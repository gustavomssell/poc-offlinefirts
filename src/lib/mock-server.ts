import type { PedidoInput, RegistroServidor } from './types'

export const LIMITE_CREDITO = 50_000
const CHAVE = 'poc-sync:servidor'

export class ErroServidor extends Error {
  permanente: boolean

  constructor(mensagem: string, permanente: boolean) {
    super(mensagem)
    this.name = 'ErroServidor'
    this.permanente = permanente
  }
}

export type Controles = {
  taxaFalha: number
  latenciaMs: number
}

function semear(): RegistroServidor[] {
  const agora = Date.now()
  const base: Array<Omit<RegistroServidor, 'sincronizadoEm'>> = [
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
  return base.map((b, i) => ({ ...b, sincronizadoEm: agora - (i + 1) * 60_000 }))
}

function carregar(): RegistroServidor[] {
  try {
    const cru = localStorage.getItem(CHAVE)
    if (cru) return JSON.parse(cru) as RegistroServidor[]
  } catch {
    // storage indisponivel -> volta para a semente
  }
  const inicial = semear()
  persistir(inicial)
  return inicial
}

function persistir(registros: RegistroServidor[]): void {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(registros))
  } catch {
    // modo privado / cota: estado do servidor fica so na memoria
  }
}

export function criarServidor(controles: () => Controles) {
  let registros = carregar()

  function ordenados(): RegistroServidor[] {
    return [...registros].sort((a, b) => b.sincronizadoEm - a.sincronizadoEm)
  }

  async function latencia(): Promise<void> {
    const { latenciaMs } = controles()
    const espera = latenciaMs + Math.random() * latenciaMs * 0.6
    await new Promise((resolve) => setTimeout(resolve, espera))
  }

  function instavel(): boolean {
    return Math.random() < controles().taxaFalha
  }

  async function put(id: string, payload: PedidoInput): Promise<RegistroServidor> {
    await latencia()

    if (instavel()) {
      throw new ErroServidor('503 Service Unavailable — instabilidade transitória', false)
    }

    if (payload.total > LIMITE_CREDITO) {
      throw new ErroServidor(
        `422 Valor total de ${payload.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} excede o limite de crédito de ${LIMITE_CREDITO.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`,
        true,
      )
    }

    const registro: RegistroServidor = { id, ...payload, sincronizadoEm: Date.now() }
    registros = [...registros.filter((r) => r.id !== id), registro]
    persistir(registros)
    return registro
  }

  async function remove(id: string): Promise<void> {
    await latencia()

    if (instavel()) {
      throw new ErroServidor('503 Service Unavailable — instabilidade transitória', false)
    }

    registros = registros.filter((r) => r.id !== id)
    persistir(registros)
  }

  function reiniciar(): RegistroServidor[] {
    registros = semear()
    persistir(registros)
    return ordenados()
  }

  return {
    listar: ordenados,
    put,
    remove,
    reiniciar,
  }
}
