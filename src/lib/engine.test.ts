import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SyncEngine } from './engine'
import { limpar, listar, STORE_FILA, STORE_PEDIDOS } from './idb'
import { LIMITE_CREDITO } from './mock-server'
import type { Operacao, PedidoInput, RegistroServidor } from './types'

const input: PedidoInput = {
  cliente: 'Acme',
  produto: 'Teclado mecânico',
  quantidade: 1,
  unitario: 500,
  total: 500,
  observacao: '',
}

const criados: SyncEngine[] = []

function novoEngine(opts: { online?: boolean } = {}): SyncEngine {
  const engine = new SyncEngine()
  criados.push(engine)
  engine.setSimulacao({ taxaFalha: 0, latenciaMs: 0, online: opts.online ?? false })
  return engine
}

function servidorMock(): RegistroServidor[] {
  return JSON.parse(localStorage.getItem('poc-sync:servidor') ?? '[]') as RegistroServidor[]
}

beforeEach(async () => {
  localStorage.clear()
  await Promise.all([limpar(STORE_PEDIDOS), limpar(STORE_FILA)])
})

afterEach(() => {
  for (const engine of criados) engine.parar()
  criados.length = 0
})

describe('outbox offline', () => {
  it('grava o pedido no IndexedDB e enfileira o create', async () => {
    const engine = novoEngine()
    await engine.init()
    await engine.criarPedido(input)

    const snapshot = engine.getSnapshot()
    expect(snapshot.pedidos).toHaveLength(1)
    expect(snapshot.ops).toHaveLength(1)
    expect(snapshot.ops[0].tipo).toBe('create')
    expect(snapshot.statusPedidos[snapshot.pedidos[0].id]).toBe('pending')

    const fila = await listar<Operacao>(STORE_FILA)
    expect(fila).toHaveLength(1)
    expect(fila[0].status).toBe('pending')
    expect(fila[0].chave).toBeTruthy()
  })

  it('coalesce várias edições em uma única operação', async () => {
    const engine = novoEngine()
    await engine.init()
    await engine.criarPedido(input)
    const id = engine.getSnapshot().pedidos[0].id

    await engine.editarPedido(id, { ...input, cliente: 'Acme 2' })
    await engine.editarPedido(id, { ...input, cliente: 'Acme 3' })

    const fila = await listar<Operacao>(STORE_FILA)
    expect(fila).toHaveLength(1)
    expect(fila[0].rev).toBe(3)
    expect(fila[0].payload?.cliente).toBe('Acme 3')
  })

  it('descarta o create de pedido excluído antes do envio', async () => {
    const engine = novoEngine()
    await engine.init()
    await engine.criarPedido(input)
    const id = engine.getSnapshot().pedidos[0].id

    await engine.removerPedido(id)

    expect(engine.getSnapshot().pedidos).toHaveLength(0)
    expect(engine.getSnapshot().ops).toHaveLength(0)
    expect(await listar<Operacao>(STORE_FILA)).toHaveLength(0)
  })
})

describe('push', () => {
  it('drena a fila quando a conexão volta e grava rev no device', async () => {
    const engine = novoEngine()
    await engine.init()
    await engine.criarPedido(input)
    const id = engine.getSnapshot().pedidos[0].id
    expect(engine.getSnapshot().ops).toHaveLength(1)

    engine.setSimulacao({ online: true })

    await vi.waitFor(() => expect(engine.getSnapshot().ops).toHaveLength(0))
    await vi.waitFor(() => {
      expect(servidorMock().find((r) => r.id === id)?.rev).toBe(1)
    })
    expect(engine.getSnapshot().pedidos[0].serverRev).toBe(1)
    expect(engine.getSnapshot().ultimaSync).not.toBeNull()
  })

  it('quarentena com 422 permanente sem novas tentativas', async () => {
    const engine = novoEngine({ online: true })
    await engine.init()
    await engine.criarPedido({
      ...input,
      unitario: LIMITE_CREDITO + 1,
      total: LIMITE_CREDITO + 1,
    })

    await vi.waitFor(() => expect(engine.getSnapshot().ops[0]?.status).toBe('failed'))
    expect(engine.getSnapshot().ops[0].lastError).toContain('422')

    const id = engine.getSnapshot().pedidos[0].id
    expect(engine.getSnapshot().statusPedidos[id]).toBe('failed')
  })

  it('resolve 409 adotando a versão do servidor', async () => {
    const a = novoEngine({ online: true })
    await a.init()
    await a.criarPedido({ ...input, cliente: 'Original' })
    await vi.waitFor(() => expect(a.getSnapshot().ops).toHaveLength(0))
    a.parar()

    // outra aba/edita o servidor: revisão e data mais novas que a local
    const registros = servidorMock()
    const alvo = registros.find((r) => r.cliente === 'Original')
    expect(alvo).toBeDefined()
    alvo!.cliente = 'Do servidor'
    alvo!.rev = 9
    alvo!.atualizadoEm = Date.now() + 60_000
    localStorage.setItem('poc-sync:servidor', JSON.stringify(registros))

    const b = novoEngine({ online: false })
    await b.init()
    await b.editarPedido(alvo!.id, { ...input, cliente: 'Local atrasada' })
    b.setSimulacao({ online: true })

    await vi.waitFor(() => expect(b.getSnapshot().ops).toHaveLength(0))

    expect(b.getSnapshot().pedidos.find((p) => p.id === alvo!.id)?.cliente).toBe('Do servidor')
    expect(b.getSnapshot().stats.conflitos).toBe(1)
    expect(b.getSnapshot().log.some((l) => l.message.includes('Conflito'))).toBe(true)
  })
})

describe('pull', () => {
  it('importa registros do servidor que não existem no device', async () => {
    const engine = novoEngine({ online: true })
    await engine.init()

    await vi.waitFor(() =>
      expect(engine.getSnapshot().pedidos.some((p) => p.id.startsWith('seed-'))).toBe(true),
    )

    const seed = engine.getSnapshot().pedidos.find((p) => p.id.startsWith('seed-'))
    expect(seed?.serverRev).toBe(1)
    expect(seed?.cliente).toBe('Padaria Estrela')
  })

  it('aplica remoção vinda do servidor (tombstone)', async () => {
    const engine = novoEngine({ online: true })
    const apagado = servidorMock()[0]
    expect(apagado).toBeDefined()

    await engine.init()
    await vi.waitFor(() =>
      expect(engine.getSnapshot().pedidos.some((p) => p.id === apagado.id)).toBe(true),
    )

    await engine.reiniciarServidor() // reseta server e cursor para 0

    // apaga direto no servidor e recria o device para forçar um pull novo
    const restantes = servidorMock().filter((r) => r.id !== apagado.id)
    localStorage.setItem('poc-sync:servidor', JSON.stringify(restantes))
    localStorage.setItem(
      'poc-sync:tumbas',
      JSON.stringify([{ id: apagado.id, deletadoEm: Date.now() }]),
    )

    engine.setSimulacao({ online: false })
    engine.setSimulacao({ online: true })

    await vi.waitFor(() =>
      expect(engine.getSnapshot().pedidos.some((p) => p.id === apagado.id)).toBe(false),
    )
  })
})
