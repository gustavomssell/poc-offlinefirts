import { backoffMs, fmtDuracao } from './backoff'
import {
  limpar as limparIdb,
  listar as listarIdb,
  remover as removerIdb,
  salvar as salvarIdb,
  STORE_FILA,
  STORE_PEDIDOS,
} from './idb'
import { criarServidor, ErroConflito, ErroServidor } from './mock-server'
import { curto, rotuloOperacao } from './pedidos'
import type {
  LogEntry,
  LogLevel,
  Operacao,
  Pedido,
  PedidoInput,
  RegistroServidor,
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

const CHAVE_SIM = 'poc-sync:sim'
const CHAVE_CURSOR = 'poc-sync:cursor'
const CHAVE_ULTIMA_SYNC = 'poc-sync:ultima-sync'
const CANAL = 'poc-sync:canal'
const MAX_LOG = 120
const MAX_CICLOS = 100

function lerJSON<T>(chave: string): Partial<T> | null {
  try {
    const cru = localStorage.getItem(chave)
    return cru ? (JSON.parse(cru) as Partial<T>) : null
  } catch {
    return null
  }
}

function gravarJSON(chave: string, valor: unknown): void {
  try {
    localStorage.setItem(chave, JSON.stringify(valor))
  } catch {
    // storage indisponivel: estado fica so na memoria
  }
}

function porDataDesc(a: Pedido, b: Pedido): number {
  return b.createdAt - a.createdAt
}

export class SyncEngine {
  private listeners = new Set<() => void>()
  private sim: Simulacao = this.carregarSim()
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
  private proximoPull = true
  private conflitos = 0
  private cursor = Number(localStorage.getItem(CHAVE_CURSOR) ?? 0)
  private ultimaSync: number | null = Number(localStorage.getItem(CHAVE_ULTIMA_SYNC)) || null
  private timer: ReturnType<typeof setTimeout> | null = null
  private ticker: ReturnType<typeof setInterval> | null = null
  private canal: BroadcastChannel | null = null
  private tabId = crypto.randomUUID()
  private cache: Snapshot = this.construir()

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  getSnapshot = (): Snapshot => this.cache

  // ---------------------------------------------------------------- estado

  private carregarSim(): Simulacao {
    const guardado = lerJSON<Simulacao>(CHAVE_SIM) ?? {}
    const online =
      typeof navigator !== 'undefined' && 'onLine' in navigator ? navigator.onLine : true
    return {
      ...SIM_PADRAO,
      ...guardado,
      online,
      maxTentativas: SIM_PADRAO.maxTentativas,
      baseMs: SIM_PADRAO.baseMs,
      maxMs: SIM_PADRAO.maxMs,
    }
  }

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
      conflitos: this.conflitos,
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
      ultimaSync: this.ultimaSync,
    }
  }

  private emit(notificarAbas = true): void {
    this.cache = this.construir()
    for (const fn of this.listeners) fn()
    if (notificarAbas && this.canal) {
      try {
        this.canal.postMessage({ origem: this.tabId, at: Date.now() })
      } catch {
        // canal fechado
      }
    }
  }

  private registrar(level: LogLevel, message: string): void {
    const entry: LogEntry = { id: crypto.randomUUID(), at: Date.now(), level, message }
    this.log = [entry, ...this.log].slice(0, MAX_LOG)
  }

  // ------------------------------------------------------------- ciclo vida

  async init(): Promise<void> {
    if (this.pronto) return

    await this.recarregarEstado()
    this.pronto = true
    this.proximoPull = true
    this.instalarEventosDeRede()
    this.instalarCanal()

    this.registrar(
      'info',
      `Sessão restaurada: ${this.pedidos.length} pedido(s) locais, ${this.ops.length} operação(ões) pendentes na fila`,
    )
    this.emit()
    this.iniciarTicker()
    this.drenar()
  }

  private async recarregarEstado(): Promise<void> {
    const [pedidosBrutos, ops] = await Promise.all([
      listarIdb<Pedido>(STORE_PEDIDOS),
      listarIdb<Operacao>(STORE_FILA),
    ])

    // migra pedidos gravados antes de existir serverRev (e updatedAt quebrado)
    const agora = Date.now()
    let migracao = false
    const pedidos = pedidosBrutos.map((bruto) => {
      const createdAt = typeof bruto.createdAt === 'number' ? bruto.createdAt : agora
      const updatedAt = typeof bruto.updatedAt === 'number' ? bruto.updatedAt : createdAt
      const serverRev = typeof bruto.serverRev === 'number' ? bruto.serverRev : null
      if (
        createdAt !== bruto.createdAt ||
        updatedAt !== bruto.updatedAt ||
        serverRev !== bruto.serverRev
      ) {
        migracao = true
      }
      return { ...bruto, createdAt, updatedAt, serverRev }
    })

    this.pedidos = [...pedidos].sort(porDataDesc)

    // uma operacao "syncing" que ficou gravada significa reload no meio do envio
    const reenfileiradas: Operacao[] = []
    this.ops = [...ops]
      .map((op) => {
        if (op.status !== 'syncing') return op
        const reenfileirada: Operacao = { ...op, status: 'pending', nextRetryAt: Date.now() }
        reenfileiradas.push(reenfileirada)
        return reenfileirada
      })
      .sort((a, b) => a.seq - b.seq)

    this.seq = this.ops.reduce((max, o) => Math.max(max, o.seq), 0)
    this.servidor = this.server.recarregar()

    if (reenfileiradas.length) {
      this.registrar(
        'warn',
        `${reenfileiradas.length} operação(ões) interrompida(s) por reload voltaram para a fila`,
      )
      await Promise.all(reenfileiradas.map((o) => salvarIdb(STORE_FILA, o)))
    }

    if (migracao) {
      await Promise.all(pedidos.map((p) => salvarIdb(STORE_PEDIDOS, p)))
    }
  }

  private instalarEventosDeRede(): void {
    if (typeof window === 'undefined') return
    window.addEventListener('online', () => this.setSimulacao({ online: true }))
    window.addEventListener('offline', () => this.setSimulacao({ online: false }))
  }

  private instalarCanal(): void {
    if (typeof BroadcastChannel === 'undefined') return
    try {
      this.canal = new BroadcastChannel(CANAL)
      this.canal.onmessage = (evento) => {
        const dados = evento.data as { origem?: string } | null
        if (!dados || dados.origem === this.tabId) return
        void this.recarregarAba()
      }
    } catch {
      this.canal = null
    }
  }

  /** Outra aba alterou o IndexedDB: rerei o estado e emite sem avisar de novo. */
  private async recarregarAba(): Promise<void> {
    await this.recarregarEstado()
    this.emit(false)
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
    const pedido: Pedido = {
      id: crypto.randomUUID(),
      ...input,
      createdAt: agora,
      updatedAt: agora,
      serverRev: null,
    }

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
        chave: crypto.randomUUID(),
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
    existente.chave = crypto.randomUUID()
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
      const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
      if (locks) {
        await locks.request('poc-sync:drenar', { ifAvailable: true }, async (lock) => {
          if (!lock) {
            this.registrar('info', 'Outra aba está drenando a fila — esta cedeu a vez')
            return
          }
          await this.cicloDeDrenagem()
        })
      } else {
        await this.cicloDeDrenagem()
      }

      if (this.proximoPull) {
        this.proximoPull = false
        await this.puxar()
      }
    } finally {
      this.drenando = false
      this.agendarProximo()
      this.emit()
    }
  }

  private async cicloDeDrenagem(): Promise<void> {
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
        await this.server.remove(voando.entityId, voando.chave)
      } else {
        const local = this.pedidos.find((p) => p.id === voando.entityId)
        const registro = await this.server.put(voando.entityId, voando.payload as PedidoInput, {
          chave: voando.chave,
          clienteRev: local?.serverRev ?? 0,
          atualizadoEm: local?.updatedAt ?? Date.now(),
        })
        this.atualizarServerRev(voando.entityId, registro.rev)
      }

      const atual = this.ops.find((o) => o.opId === voando.opId)

      if (atual && atual.rev === voando.rev) {
        this.ops = this.ops.filter((o) => o.opId !== voando.opId)
        await removerIdb(STORE_FILA, voando.opId)
      } else if (atual) {
        atual.status = 'pending'
        atual.chave = crypto.randomUUID()
        atual.nextRetryAt = Date.now()
        atual.updatedAt = Date.now()
        await salvarIdb(STORE_FILA, atual)
        this.ops = [...this.ops]
        this.registrar(
          'warn',
          `Payload alterado durante o envio — ${curto(voando.entityId)} será reenviado`,
        )
      }

      this.servidor = this.server.listar()
      this.marcarSincronizado()
      this.proximoPull = true
      this.registrar(
        'success',
        `${rotuloOperacao(voando.tipo)} de ${curto(voando.entityId)} sincronizado`,
      )
    } catch (erro) {
      if (erro instanceof ErroConflito) {
        await this.resolverConflito(voando, erro.registro)
      } else {
        await this.tratarFalha(voando, erro)
      }
    }

    this.emit()
  }

  private atualizarServerRev(entityId: string, rev: number): void {
    const idx = this.pedidos.findIndex((p) => p.id === entityId)
    if (idx < 0) return
    const arr = [...this.pedidos]
    arr[idx] = { ...arr[idx], serverRev: rev }
    this.pedidos = arr
    void salvarIdb(STORE_PEDIDOS, arr[idx])
  }

  /** 409: o servidor tem uma versao mais nova e o device adota ela. */
  private async resolverConflito(op: Operacao, registro: RegistroServidor): Promise<void> {
    const idx = this.pedidos.findIndex((p) => p.id === op.entityId)
    if (idx >= 0) {
      const arr = [...this.pedidos]
      arr[idx] = {
        ...arr[idx],
        cliente: registro.cliente,
        produto: registro.produto,
        quantidade: registro.quantidade,
        unitario: registro.unitario,
        total: registro.total,
        observacao: registro.observacao,
        updatedAt: registro.atualizadoEm,
        serverRev: registro.rev,
      }
      this.pedidos = arr
      await salvarIdb(STORE_PEDIDOS, arr[idx])
    }

    this.ops = this.ops.filter((o) => o.opId !== op.opId)
    await removerIdb(STORE_FILA, op.opId)
    this.conflitos += 1
    this.servidor = this.server.listar()
    this.marcarSincronizado()
    this.registrar(
      'warn',
      `Conflito em ${curto(op.entityId)}: versão do servidor (rev ${registro.rev}) prevaleceu sobre a local`,
    )
  }

  private marcarSincronizado(): void {
    this.ultimaSync = Date.now()
    localStorage.setItem(CHAVE_ULTIMA_SYNC, String(this.ultimaSync))
  }

  /** Pull: aplica no device o que existe no servidor desde o ultimo cursor. */
  private async puxar(): Promise<void> {
    if (!this.sim.online || this.sim.pausada) return

    try {
      const { registros, tumbas } = await this.server.desde(this.cursor)
      this.marcarSincronizado()

      if (!registros.length && !tumbas.length) return

      let cursor = this.cursor
      let mudou = false

      for (const remoto of registros) {
        cursor = Math.max(cursor, remoto.sincronizadoEm)
        if (this.ops.some((o) => o.entityId === remoto.id)) continue

        const idx = this.pedidos.findIndex((p) => p.id === remoto.id)
        const local = idx >= 0 ? this.pedidos[idx] : null
        if (local && local.serverRev !== null && local.serverRev >= remoto.rev) continue

        const aplicado: Pedido = {
          id: remoto.id,
          cliente: remoto.cliente,
          produto: remoto.produto,
          quantidade: remoto.quantidade,
          unitario: remoto.unitario,
          total: remoto.total,
          observacao: remoto.observacao,
          createdAt: local?.createdAt ?? remoto.atualizadoEm,
          updatedAt: remoto.atualizadoEm,
          serverRev: remoto.rev,
        }

        if (idx >= 0) {
          const arr = [...this.pedidos]
          arr[idx] = aplicado
          this.pedidos = arr
        } else {
          this.pedidos = [aplicado, ...this.pedidos]
        }
        await salvarIdb(STORE_PEDIDOS, aplicado)
        mudou = true
      }

      for (const tum of tumbas) {
        cursor = Math.max(cursor, tum.deletadoEm)
        if (this.ops.some((o) => o.entityId === tum.id)) continue
        if (!this.pedidos.some((p) => p.id === tum.id)) continue
        this.pedidos = this.pedidos.filter((p) => p.id !== tum.id)
        await removerIdb(STORE_PEDIDOS, tum.id)
        mudou = true
      }

      if (cursor !== this.cursor) {
        this.cursor = cursor
        localStorage.setItem(CHAVE_CURSOR, String(cursor))
      }

      if (mudou) {
        this.pedidos = [...this.pedidos].sort(porDataDesc)
        this.registrar(
          'info',
          `Pull aplicado: ${registros.length} registro(s) e ${tumbas.length} remoção(ões) vindos do servidor`,
        )
        this.emit()
      }
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : String(erro)
      this.registrar('warn', `Falha no pull do servidor: ${mensagem}`)
    }
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

    this.proximoPull = true
    this.emit()
    if (this.pronto) this.drenar()
  }

  async tentarNovamente(opId: string): Promise<void> {
    const op = this.ops.find((o) => o.opId === opId)
    if (!op || op.status !== 'failed') return

    op.status = 'pending'
    op.attempts = 0
    op.chave = crypto.randomUUID()
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
    gravarJSON(CHAVE_SIM, {
      pausada: this.sim.pausada,
      taxaFalha: this.sim.taxaFalha,
      latenciaMs: this.sim.latenciaMs,
    })

    if (patch.online !== undefined && patch.online !== antes.online) {
      this.registrar(
        patch.online ? 'success' : 'warn',
        patch.online ? 'Conexão restaurada' : 'Conexão perdida — fila congelada',
      )
      if (patch.online) this.proximoPull = true
    }
    if (patch.pausada !== undefined && patch.pausada !== antes.pausada) {
      this.registrar(
        patch.pausada ? 'warn' : 'info',
        patch.pausada ? 'Fila pausada' : 'Fila retomada',
      )
    }

    this.emit()
    if (this.pronto) this.drenar()
  }

  reiniciarServidor(): void {
    this.servidor = this.server.reiniciar()
    this.cursor = 0
    localStorage.setItem(CHAVE_CURSOR, '0')
    this.registrar('warn', 'Estado do servidor mock restaurado para o seed')
    this.emit()
  }

  async limparDispositivo(): Promise<void> {
    await Promise.all([limparIdb(STORE_PEDIDOS), limparIdb(STORE_FILA)])
    this.pedidos = []
    this.ops = []
    this.seq = 0
    this.cursor = Date.now()
    localStorage.setItem(CHAVE_CURSOR, String(this.cursor))
    this.conflitos = 0
    this.registrar(
      'warn',
      'Dados locais apagados — a partir de agora só entram alterações futuras do servidor',
    )
    this.emit()
  }

  limparLog(): void {
    this.log = []
    this.emit()
  }

  /** Para timers e canal — usado nos testes para não vazar loops. */
  parar(): void {
    if (this.timer) clearTimeout(this.timer)
    if (this.ticker) clearInterval(this.ticker)
    this.timer = null
    this.ticker = null
    if (this.canal) {
      try {
        this.canal.close()
      } catch {
        // canal ja fechado
      }
      this.canal = null
    }
    this.listeners.clear()
  }
}

export const engine = new SyncEngine()
