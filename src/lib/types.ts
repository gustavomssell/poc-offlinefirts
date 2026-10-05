export type PedidoInput = {
  cliente: string
  produto: string
  quantidade: number
  unitario: number
  total: number
  observacao: string
}

export type Pedido = PedidoInput & {
  id: string
  createdAt: number
  updatedAt: number
  serverRev: number | null
}

export type RegistroServidor = PedidoInput & {
  id: string
  rev: number
  atualizadoEm: number
  sincronizadoEm: number
}

export type Tumbstone = {
  id: string
  deletadoEm: number
}

export type TipoOperacao = 'create' | 'update' | 'delete'

export type StatusOperacao = 'pending' | 'syncing' | 'failed'

export type Operacao = {
  opId: string
  seq: number
  rev: number
  chave: string
  entityId: string
  tipo: TipoOperacao
  payload: PedidoInput | null
  status: StatusOperacao
  attempts: number
  nextRetryAt: number | null
  lastError: string | null
  createdAt: number
  updatedAt: number
}

export type StatusPedido = 'synced' | 'pending' | 'syncing' | 'failed'

export type LogLevel = 'info' | 'success' | 'warn' | 'error'

export type LogEntry = {
  id: string
  at: number
  level: LogLevel
  message: string
}

export type Simulacao = {
  online: boolean
  pausada: boolean
  taxaFalha: number
  latenciaMs: number
  maxTentativas: number
  baseMs: number
  maxMs: number
}

export type Stats = {
  locais: number
  sincronizados: number
  pendentes: number
  sincronizando: number
  falhas: number
  conflitos: number
}

export type Snapshot = {
  pronto: boolean
  pedidos: Pedido[]
  ops: Operacao[]
  log: LogEntry[]
  servidor: RegistroServidor[]
  sim: Simulacao
  agora: number
  statusPedidos: Record<string, StatusPedido>
  stats: Stats
  ultimaSync: number | null
}
