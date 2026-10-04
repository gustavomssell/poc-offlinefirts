export type Produto = {
  nome: string
  unitario: number
}

export const PRODUTOS: Produto[] = [
  { nome: 'Notebook Pro 14"', unitario: 7490 },
  { nome: 'Monitor 27" QHD', unitario: 1890 },
  { nome: 'Teclado mecânico', unitario: 540 },
  { nome: 'Cadeira ergonômica', unitario: 2290 },
  { nome: 'Dock USB-C 11 em 1', unitario: 420 },
]

export const UNIDADES = PRODUTOS.map((p) => p.nome)

export function unitarioDe(produto: string): number {
  return PRODUTOS.find((p) => p.nome === produto)?.unitario ?? 0
}

export function moeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function curto(id: string): string {
  return id.slice(0, 6)
}

export function rotuloOperacao(tipo: 'create' | 'update' | 'delete'): string {
  if (tipo === 'create') return 'Criação'
  if (tipo === 'update') return 'Atualização'
  return 'Exclusão'
}
