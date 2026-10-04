import { backoffMs, fmtDuracao } from './backoff'
import {
  listar as listarIdb,
  remover as removerIdb,
  salvar as salvarIdb,
  STORE_FILA,
  STORE_PEDIDOS,
} from './idb'
import { criarServidor, ErroServidor } from './mock-server'
import { curto, rotuloOperacao } from './pedidos'
import type {
  LogEntry,
  LogLevel,
  Operacao,
  Pedido,
  PedidoInput,
  Simulacao,
  Snapshot,
  StatusPedido,
  Stats,
  TipoOperacao,
} from './types'

const SIM_PADRAO: Simulacao = {
  online: true,
  pausada: false,
  taxaFalha: 0.35,
  latenciaMs: 450,
  maxTentativas: 6,
  baseMs: 1000,
  maxMs: 30_000,
}

const MAX_LOG = 120
const MAX_CICLOS = 100

class SyncEngine {
  private listeners = new Set<() => void>()
  private sim: Simulacao = { ...SIM_PADRAO }
  private server = criarServidor(() => ({
    taxaFalha: this.sim.taxaFalha,
    latenciaMs: this.sim.latenciaMs,
  }))
  private pedidos: Pedido[] = []
  private ops: Operacao[] = []
  private log: LogEntry[] = []
  private servidor = this.server.listar()
  private seq = 0
  private pronto = false
  private drenando = false
  private timer: ReturnType<typeof setTimeout> | null = null
  private ticker: ReturnType<typeof setInterval> | null = null
  private cache: Snapshot = this.construir()

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getSnapshot = (): Snapshot => this.cache

  // ---------------------------------------------------------------- estado

  private construir(): Snapshot {
    const statusPedidos: Record<string, StatusPedido> = {}

    for (const pedido of this.pedidos) {
      statusPedidos[pedido.id] = 'synced'
    }

    for (const op of this.ops) {
      if (op.tipo === 'delete') continue
      statusPedidos[op.entityId] =
        op.status === 'failed' ? 'failed' : op.status === 'syncing' ? 'syncing' : 'pending'
    }

    const stats: Stats = {
      locais: this.pedidos.length,
      sincronizados: this.pedidos.filter((p) => statusPedidos[p.id] === 'synced').length,
      pendentes: this.ops.filter((o) => o.status === 'pending').length,
      sincronizando: this.ops.filter((o) => o.status === 'syncing').length,
      falhas: this.ops.filter((o) => o.status === 'failed').length,
    }

    return {
      pronto: this.pronto,
      pedidos: this.pedidos,
      ops: this.ops,
      log: this.log,
      servidor: this.servidor,
      sim: this.sim,
      agora: Date.now(),
      statusPedidos,
      stats,
    }
  }

  private emit(): void {
    this.cache = this.construir()
    for (const fn of this.listeners) fn()
  }

  private registrar(level: LogLevel, message: string): void {
    const entry: LogEntry = { id: crypto.randomUUID(), at: Date.now(), level, message }
    this.log = [entry, ...this.log].slice(0, MAX_LOG)
  }

  // ------------------------------------------------------------- ciclo vida

  async init(): Promise<void> {
    if (this.pronto) return

    const [pedidos, ops] = await Promise.all([
      listarIdb<Pedido>(STORE_PEDIDOS),
      listarIdb<Operacao>(STORE_FILA),
    ])

    this.pedidos = [...pedidos].sort((a, b) => b.createdAt - a.createdAt)
    this.ops = [...ops].sort((a, b) => a.seq - b.seq)
    this.seq = this.ops.reduce((max, o) => Math.max(max, o.seq), 0)
    this.servidor = this.server.listar()
    this.pronto = true

    this.registrar(
      'info',
      `Sessão restaurada: ${pedidos.length} pedido(s) locais, ${ops.length} operação(ões) pendentes na fila`,
    )
    this.emit()
    this.iniciarTicker()
    this.drenar()
  }

  private iniciarTicker(): void {
    if (this.ticker) return
    this.ticker = setInterval(() => {
      const contagem = this.ops.some(
        (o) => o.status === 'pending' && o.nextRetryAt !== null && o.nextRetryAt > Date.now(),
      )
      if (contagem) this.emit()
    }, 400)
  }

  // ------------------------------------------------------------ mutacoes UI

  async criarPedido(input: PedidoInput): Promise<void> {
    const agora = Date.now()
    const pedido: Pedido = { id: crypto.randomUUID(), ...input, createdAt: agora, updatedAt: agora }

    this.pedidos = [pedido, ...this.pedidos]
    await salvarIdb(STORE_PEDIDOS, pedido)
    await this.enfileirar(pedido.id, 'create', input)

    this.registrar('info', `Pedido de ${input.cliente} gravado no IndexedDB`)
    this.emit()
    this.drenar()
  }

  async editarPedido(id: string, input: PedidoInput): Promise<void> {
    const idx = this.pedidos.findIndex((p) => p.id === id)
    if (idx < 0) return

    const atualizado: Pedido = { ...this.pedidos[idx], ...input, updatedAt: Date.now() }
    const pedidos = [...this.pedidos]
    pedidos[idx] = atualizado
    this.pedidos = pedidos

    await salvarIdb(STORE_PEDIDOS, atualizado)
    await this.enfileirar(id, 'update', input)

    this.registrar('info', `Pedido de ${input.cliente} atualizado localmente`)
    this.emit()
    this.drenar()
  }

  async removerPedido(id: string): Promise<void> {
    const pedido = this.pedidos.find((p) => p.id === id)
    this.pedidos = this.pedidos.filter((p) => p.id !== id)
    await removerIdb(STORE_PEDIDOS, id)
    await this.enfileirar(id, 'delete', null)

    this.registrar('warn', `Pedido ${pedido?.cliente ?? curto(id)} removido localmente`)
    this.emit()
    this.drenar()
  }

  /** Outbox: no maximo uma operacao por entidade (coalescencia). */
  private async enfileirar(
    entityId: string,
    tipo: TipoOperacao,
    payload: PedidoInput | null,
  ): Promise<void> {
    const agora = Date.now()
    const existente = this.ops.find((o) => o.entityId === entityId)

    if (!existente) {
      const op: Operacao = {
        opId: crypto.randomUUID(),
        seq: ++this.seq,
        rev: 1,
        entityId,
        tipo,
        payload,
        status: 'pending',
        attempts: 0,
        nextRetryAt: agora,
        lastError: null,
        createdAt: agora,
        updatedAt: agora,
      }
      this.ops = [...this.ops, op]
      await salvarIdb(STORE_FILA, op)
      this.registrar('info', `${rotuloOperacao(tipo)} de ${curto(entityId)} enfileirada`)
      return
    }

    // Criacao que nunca saiu da fila + exclusao local = nada a sincronizar.
    if (existente.tipo === 'create' && tipo === 'delete' && existente.status === 'pending') {
      this.ops = this.ops.filter((o) => o.opId !== existente.opId)
      await removerIdb(STORE_FILA, existente.opId)
      this.registrar('warn', `${curto(entityId)} excluído antes do envio — operação descartada`)
      return
    }

    if (tipo === 'delete') {
      existente.tipo = 'delete'
      existente.payload = null
    } else if (existente.tipo !== 'create') {
      existente.tipo = 'update'
      existente.payload = payload
    } else {
      existente.payload = payload
    }

    existente.rev += 1
    existente.updatedAt = agora

    if (existente.status === 'failed') {
      existente.status = 'pending'
      existente.attempts = 0
      existente.nextRetryAt = agora
      existente.lastError = null
      this.registrar('warn', `Operação de ${curto(entityId)} reenfileirada após edição`)
    } else if (existente.status === 'syncing') {
      this.registrar('warn', `Operação de ${curto(entityId)} alterada durante o envio`)
    } else {
      this.registrar(
        'info',
        `${rotuloOperacao(existente.tipo)} de ${curto(entityId)} coalescida na operação já pendente`,
      )
    }

    await salvarIdb(STORE_FILA, existente)
    this.ops = [...this.ops]
  }

  // ------------------------------------------------------------- fila/sync

  private async gravarOp(op: Operacao): Promise<void> {
    const idx = this.ops.findIndex((o) => o.opId === op.opId)
    if (idx >= 0) {
      const arr = [...this.ops]
      arr[idx] = op
      this.ops = arr
    }
    await salvarIdb(STORE_FILA, op)
    this.emit()
  }

  private drenar(): void {
    if (this.drenando) return
    void this.drenarAsync()
  }

  private async drenarAsync(): Promise<void> {
    if (this.drenando) return
    this.drenando = true

    try {
      let ciclos = 0
      while (ciclos++ < MAX_CICLOS) {
        if (!this.sim.online || this.sim.pausada) break

        const agora = Date.now()
        const proxima = this.ops
          .filter((o) => o.status === 'pending' && (o.nextRetryAt ?? 0) <= agora)
          .sort((a, b) => a.seq - b.seq)[0]

        if (!proxima) break
        await this.executar(proxima)
      }
    } finally {
      this.drenando = false
      this.agendarProximo()
      this.emit()
    }
  }

  private async executar(op: Operacao): Promise<void> {
    const voando: Operacao = { ...op, status: 'syncing', nextRetryAt: null, updatedAt: Date.now() }
    await this.gravarOp(voando)

    const tentativa = voando.attempts + 1
    this.registrar(
      'info',
      `Enviando ${rotuloOperacao(voando.tipo)} de ${curto(voando.entityId)} (tentativa ${tentativa})`,
    )

    try {
      if (voando.tipo === 'delete') {
        await this.server.remove(voando.entityId)
      } else {
        await this.server.put(voando.entityId, voando.payload as PedidoInput)
      }

      const atual = this.ops.find((o) => o.opId === voando.opId)

      if (atual && atual.rev === voando.rev) {
        this.ops = this.ops.filter((o) => o.opId !== voando.opId)
        await removerIdb(STORE_FILA, voando.opId)
      } else if (atual) {
        atual.status = 'pending'
        atual.nextRetryAt = Date.now()
        atual.updatedAt = Date.now()
        await salvarIdb(STORE_FILA, atual)
        this.ops = [...this.ops]
        this.registrar('warn', `Payload alterado durante o envio — ${curto(voando.entityId)} será reenviado`)
      }

      this.servidor = this.server.listar()
      this.registrar('success', `${rotuloOperacao(voando.tipo)} de ${curto(voando.entityId)} sincronizado`)
    } catch (erro) {
      await this.tratarFalha(voando, erro)
    }

    this.emit()
  }

  private async tratarFalha(voando: Operacao, erro: unknown): Promise<void> {
    const mensagem = erro instanceof Error ? erro.message : String(erro)
    const atual = this.ops.find((o) => o.opId === voando.opId)
    if (!atual) return

    const permanente = erro instanceof ErroServidor && erro.permanente
    const tentativas = voando.attempts + 1

    atual.attempts = tentativas
    atual.updatedAt = Date.now()
    atual.lastError = mensagem

    if (permanente) {
      atual.status = 'failed'
      atual.nextRetryAt = null
      this.registrar('error', `Rejeição permanente em ${curto(atual.entityId)}: ${mensagem}`)
    } else if (tentativas >= this.sim.maxTentativas) {
      atual.status = 'failed'
      atual.nextRetryAt = null
      this.registrar(
        'error',
        `${curto(atual.entityId)} esgotou ${this.sim.maxTentativas} tentativas — operação em quarentena`,
      )
    } else {
      const espera = backoffMs(tentativas, this.sim.baseMs, this.sim.maxMs)
      atual.status = 'pending'
      atual.nextRetryAt = Date.now() + espera
      this.registrar(
        'warn',
        `Tentativa ${tentativas}/${this.sim.maxTentativas} falhou em ${curto(atual.entityId)} (${mensagem}) — próxima em ${fmtDuracao(espera)}`,
      )
    }

    await salvarIdb(STORE_FILA, atual)
    this.ops = [...this.ops]
  }

  private agendarProximo(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (!this.sim.online || this.sim.pausada) return

    const esperando = this.ops.filter((o) => o.status === 'pending' && o.nextRetryAt !== null)
    if (!esperando.length) return

    const proximo = Math.min(...esperando.map((o) => o.nextRetryAt as number))
    const espera = Math.max(proximo - Date.now(), 50)
    this.timer = setTimeout(() => {
      this.timer = null
      this.drenar()
    }, espera)
  }

  // ----------------------------------------------------------- acoes da UI

  async sincronizarAgora(): Promise<void> {
    const agora = Date.now()
    const antecipadas: Operacao[] = []

    this.ops = this.ops.map((o) => {
      if (o.status === 'pending' && (o.nextRetryAt === null || o.nextRetryAt > agora)) {
        const nova = { ...o, nextRetryAt: agora, updatedAt: agora }
        antecipadas.push(nova)
        return nova
      }
      return o
    })

    if (antecipadas.length) {
      await Promise.all(antecipadas.map((o) => salvarIdb(STORE_FILA, o)))
      this.registrar('info', `${antecipadas.length} operação(ões) antecipada(s) manualmente`)
    }

    this.emit()
    this.drenar()
  }

  async tentarNovamente(opId: string): Promise<void> {
    const op = this.ops.find((o) => o.opId === opId)
    if (!op || op.status !== 'failed') return

    op.status = 'pending'
    op.attempts = 0
    op.nextRetryAt = Date.now()
    op.lastError = null
    op.updatedAt = Date.now()

    await salvarIdb(STORE_FILA, op)
    this.ops = [...this.ops]
    this.registrar('info', `Operação de ${curto(op.entityId)} reiniciada pelo usuário`)
    this.emit()
    this.drenar()
  }

  async descartarOperacao(opId: string): Promise<void> {
    const op = this.ops.find((o) => o.opId === opId)
    if (!op) return

    this.ops = this.ops.filter((o) => o.opId !== opId)
    await removerIdb(STORE_FILA, opId)
    this.registrar(
      'warn',
      `${rotuloOperacao(op.tipo)} de ${curto(op.entityId)} descartada — a alteração fica só no dispositivo`,
    )
    this.emit()
  }

  setSimulacao(patch: Partial<Simulacao>): void {
    const antes = { ...this.sim }
    this.sim = { ...this.sim, ...patch }

    if (patch.online !== undefined && patch.online !== antes.online) {
      this.registrar(patch.online ? 'success' : 'warn', patch.online ? 'Conexão restaurada' : 'Conexão perdida — fila congelada')
    }
    if (patch.pausada !== undefined && patch.pausada !== antes.pausada) {
      this.registrar(patch.pausada ? 'warn' : 'info', patch.pausada ? 'Fila pausada' : 'Fila retomada')
    }

    this.emit()
    this.drenar()
  }

  reiniciarServidor(): void {
    this.servidor = this.server.reiniciar()
    this.registrar('warn', 'Estado do servidor mock restaurado para o seed')
    this.emit()
  }

  limparLog(): void {
    this.log = []
    this.emit()
  }
}

export const engine = new SyncEngine()
