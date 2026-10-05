import type { PedidoInput, RegistroServidor, Tumbstone } from './types'

export const LIMITE_CREDITO = 50_000
const CHAVE_REGS = 'poc-sync:servidor'
const CHAVE_TUMBAS = 'poc-sync:tumbas'
const CHAVE_IDEMP = 'poc-sync:idemp'
const MAX_IDEMP = 64

export class ErroServidor extends Error {
  permanente: boolean

  constructor(mensagem: string, permanente: boolean) {
    super(mensagem)
    this.name = 'ErroServidor'
    this.permanente = permanente
  }
}

export class ErroConflito extends Error {
  registro: RegistroServidor

  constructor(mensagem: string, registro: RegistroServidor) {
    super(mensagem)
    this.name = 'ErroConflito'
    this.registro = registro
  }
}

export type Controles = {
  taxaFalha: number
  latenciaMs: number
}

export type Envio = {
  chave: string
  clienteRev: number
  atualizadoEm: number
}

type MarcaIdempotencia = {
  chave: string
  id: string
  rev: number
}

function semear(): RegistroServidor[] {
  const agora = Date.now()
  const base: Array<Omit<RegistroServidor, 'sincronizadoEm' | 'rev' | 'atualizadoEm'>> = [
    {
      id: 'seed-0001',
      cliente: 'Padaria Estrela',
      produto: 'Monitor 27" QHD',
      quantidade: 2,
      unitario: 1890,
      total: 3780,
      observacao: 'Entrega na loja central',
    },
    {
      id: 'seed-0002',
      cliente: 'Studio Aurora',
      produto: 'Cadeira ergonômica',
      quantidade: 6,
      unitario: 2290,
      total: 13740,
      observacao: '',
    },
  ]
  return base.map((b, i) => ({
    ...b,
    rev: 1,
    atualizadoEm: agora - (i + 1) * 60_000,
    sincronizadoEm: agora - (i + 1) * 60_000,
  }))
}

function ler<T>(chave: string, padrao: T): T {
  try {
    const cru = localStorage.getItem(chave)
    if (cru) return JSON.parse(cru) as T
  } catch {
    // storage indisponivel -> usa o padrao
  }
  return padrao
}

function gravar(chave: string, valor: unknown): void {
  try {
    localStorage.setItem(chave, JSON.stringify(valor))
  } catch {
    // modo privado / cota: estado fica so na memoria
  }
}

/** Migra registros gravados por versoes anteriores da POC (sem rev/atualizadoEm). */
function normalizar(registros: RegistroServidor[]): RegistroServidor[] {
  return registros.map((r) => ({
    ...r,
    rev: typeof r.rev === 'number' ? r.rev : 1,
    atualizadoEm:
      typeof r.atualizadoEm === 'number' ? r.atualizadoEm : (r.sincronizadoEm ?? Date.now()),
  }))
}

function carregar(): RegistroServidor[] {
  const guardado = localStorage.getItem(CHAVE_REGS)
  if (guardado) {
    try {
      const registros = JSON.parse(guardado) as RegistroServidor[]
      const normalizados = normalizar(registros)
      if (normalizados.some((r) => typeof r.rev !== 'number')) gravar(CHAVE_REGS, normalizados)
      return normalizados
    } catch {
      // JSON corrompido -> ressementeia
    }
  }
  const inicial = semear()
  gravar(CHAVE_REGS, inicial)
  return inicial
}

export function criarServidor(controles: () => Controles) {
  let registros = carregar()

  function ordenados(): RegistroServidor[] {
    return [...registros].sort((a, b) => b.sincronizadoEm - a.sincronizadoEm)
  }

  function recarregar(): RegistroServidor[] {
    registros = carregar()
    return ordenados()
  }

  async function latencia(): Promise<void> {
    const { latenciaMs } = controles()
    const espera = latenciaMs + Math.random() * latenciaMs * 0.6
    await new Promise((resolve) => setTimeout(resolve, espera))
  }

  function instavel(): boolean {
    return Math.random() < controles().taxaFalha
  }

  function idempotencias(): MarcaIdempotencia[] {
    return ler<MarcaIdempotencia[]>(CHAVE_IDEMP, [])
  }

  function registrarIdempotencia(marca: MarcaIdempotencia): void {
    const atual = [marca, ...idempotencias().filter((m) => m.chave !== marca.chave)]
    gravar(CHAVE_IDEMP, atual.slice(0, MAX_IDEMP))
  }

  async function put(id: string, payload: PedidoInput, envio: Envio): Promise<RegistroServidor> {
    await latencia()

    const replay = idempotencias().find((m) => m.chave === envio.chave)
    if (replay) {
      const existente = registros.find((r) => r.id === replay.id)
      if (existente) return existente
    }

    if (instavel()) {
      throw new ErroServidor('503 Service Unavailable — instabilidade transitória', false)
    }

    if (payload.total > LIMITE_CREDITO) {
      throw new ErroServidor(
        `422 Valor total de ${payload.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} excede o limite de crédito de ${LIMITE_CREDITO.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
        true,
      )
    }

    const atual = registros.find((r) => r.id === id)

    if (atual) {
      const clienteAtrasado = envio.clienteRev < atual.rev
      const servidorMaisRecente = envio.atualizadoEm < atual.atualizadoEm
      if (clienteAtrasado && servidorMaisRecente) {
        throw new ErroConflito(
          `409 Conflito de versão em ${id}: o servidor tem uma alteração mais recente (rev ${atual.rev})`,
          atual,
        )
      }
    }

    const agora = Date.now()
    const registro: RegistroServidor = {
      id,
      ...payload,
      rev: (atual?.rev ?? 0) + 1,
      atualizadoEm: envio.atualizadoEm,
      sincronizadoEm: agora,
    }
    registros = [...registros.filter((r) => r.id !== id), registro]
    gravar(CHAVE_REGS, registros)
    registrarIdempotencia({ chave: envio.chave, id, rev: registro.rev })
    return registro
  }

  async function remove(id: string, chave: string): Promise<void> {
    await latencia()

    const replay = idempotencias().find((m) => m.chave === chave)
    if (replay) return

    if (instavel()) {
      throw new ErroServidor('503 Service Unavailable — instabilidade transitória', false)
    }

    const existia = registros.some((r) => r.id === id)
    registros = registros.filter((r) => r.id !== id)
    gravar(CHAVE_REGS, registros)
    registrarIdempotencia({ chave, id, rev: 0 })

    if (existia) {
      const tumbas = ler<Tumbstone[]>(CHAVE_TUMBAS, [])
      gravar(CHAVE_TUMBAS, [{ id, deletadoEm: Date.now() }, ...tumbas].slice(0, MAX_IDEMP))
    }
  }

  async function desde(cursor: number): Promise<{ registros: RegistroServidor[]; tumbas: Tumbstone[] }> {
    recarregar()
    await latencia()
    return {
      registros: registros.filter((r) => r.sincronizadoEm > cursor),
      tumbas: ler<Tumbstone[]>(CHAVE_TUMBAS, []).filter((t) => t.deletadoEm > cursor),
    }
  }

  function reiniciar(): RegistroServidor[] {
    registros = semear()
    gravar(CHAVE_REGS, registros)
    gravar(CHAVE_TUMBAS, [])
    gravar(CHAVE_IDEMP, [])
    return ordenados()
  }

  return {
    listar: ordenados,
    recarregar,
    desde,
    put,
    remove,
    reiniciar,
  }
}
