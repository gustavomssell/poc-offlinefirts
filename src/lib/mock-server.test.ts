import { beforeEach, describe, expect, it } from 'vitest'
import { criarServidor, ErroConflito, ErroServidor, LIMITE_CREDITO } from './mock-server'
import type { PedidoInput } from './types'

const controles = () => ({ taxaFalha: 0, latenciaMs: 0 })

const input: PedidoInput = {
  cliente: 'Acme',
  produto: 'Teclado mecânico',
  quantidade: 1,
  unitario: 500,
  total: 500,
  observacao: '',
}

beforeEach(() => {
  localStorage.clear()
})

describe('criarServidor: put idempotente', () => {
  it('cria com rev 1 e repetir a mesma chave não duplica nem incrementa', async () => {
    const servidor = criarServidor(controles)

    const primeiro = await servidor.put('e1', input, {
      chave: 'chave-1',
      clienteRev: 0,
      atualizadoEm: 1000,
    })
    const replay = await servidor.put('e1', input, {
      chave: 'chave-1',
      clienteRev: 0,
      atualizadoEm: 1000,
    })

    expect(primeiro.rev).toBe(1)
    expect(replay.rev).toBe(1)
    expect(servidor.listar().filter((r) => r.id === 'e1')).toHaveLength(1)
  })

  it('chave nova no mesmo id incrementa a revisão', async () => {
    const servidor = criarServidor(controles)

    await servidor.put('e1', input, { chave: 'a', clienteRev: 0, atualizadoEm: 1000 })
    const segundo = await servidor.put('e1', input, {
      chave: 'b',
      clienteRev: 1,
      atualizadoEm: 5000,
    })

    expect(segundo.rev).toBe(2)
    expect(segundo.atualizadoEm).toBe(5000)
  })
})

describe('criarServidor: conflito 409', () => {
  it('rejeita escrita atrasada quando o servidor tem versão mais nova', async () => {
    const servidor = criarServidor(controles)
    await servidor.put('e1', input, { chave: 'a', clienteRev: 0, atualizadoEm: 1000 })
    await servidor.put('e1', input, { chave: 'b', clienteRev: 1, atualizadoEm: 5000 })

    const erro = await servidor
      .put('e1', { ...input, cliente: 'Local atrasada' }, {
        chave: 'c',
        clienteRev: 1,
        atualizadoEm: 2000,
      })
      .catch((e: unknown) => e)

    expect(erro).toBeInstanceOf(ErroConflito)
    const conflito = erro as ErroConflito
    expect(conflito.registro.cliente).toBe('Acme')
    expect(conflito.registro.rev).toBe(2)
    expect(servidor.listar()[0].cliente).toBe('Acme')
  })

  it('aceita escrita mais recente sobre revisão antiga', async () => {
    const servidor = criarServidor(controles)
    await servidor.put('e1', input, { chave: 'a', clienteRev: 0, atualizadoEm: 1000 })

    const ok = await servidor.put('e1', { ...input, cliente: 'Nova' }, {
      chave: 'b',
      clienteRev: 1,
      atualizadoEm: 9000,
    })

    expect(ok.rev).toBe(2)
    expect(ok.cliente).toBe('Nova')
  })
})

describe('criarServidor: 422 permanente', () => {
  it('rejeita total acima do limite de crédito', async () => {
    const servidor = criarServidor(controles)

    const erro = await servidor
      .put('e2', { ...input, quantidade: 2, unitario: LIMITE_CREDITO, total: LIMITE_CREDITO * 2 }, {
        chave: 'x',
        clienteRev: 0,
        atualizadoEm: 1000,
      })
      .catch((e: unknown) => e)

    expect(erro).toBeInstanceOf(ErroServidor)
    expect((erro as ErroServidor).permanente).toBe(true)
    expect((erro as ErroServidor).message).toContain('422')
    expect(servidor.listar().some((r) => r.id === 'e2')).toBe(false)
  })
})

describe('criarServidor: remove + desde (pull)', () => {
  it('remove grava tombstone e desde devolve registros e remoções desde o cursor', async () => {
    const servidor = criarServidor(controles)
    await servidor.put('e9', input, { chave: 'k1', clienteRev: 0, atualizadoEm: Date.now() })

    const antes = await servidor.desde(0)
    expect(antes.registros.some((r) => r.id === 'e9')).toBe(true)

    await servidor.remove('e9', 'k2')

    const depois = await servidor.desde(0)
    expect(depois.registros.some((r) => r.id === 'e9')).toBe(false)
    expect(depois.tumbas.map((t) => t.id)).toContain('e9')
  })

  it('remove repetida com a mesma chave não gera tombstone novo', async () => {
    const servidor = criarServidor(controles)
    await servidor.remove('seed-0001', 'k-unico')
    await servidor.remove('seed-0001', 'k-unico')

    const { tumbas } = await servidor.desde(0)
    expect(tumbas.filter((t) => t.id === 'seed-0001')).toHaveLength(1)
  })

  it('desde ignora o que é anterior ao cursor', async () => {
    const servidor = criarServidor(controles)
    const registro = await servidor.put('e10', input, {
      chave: 'k',
      clienteRev: 0,
      atualizadoEm: Date.now(),
    })

    const { registros, tumbas } = await servidor.desde(registro.sincronizadoEm + 60_000)

    expect(registros).toHaveLength(0)
    expect(tumbas).toHaveLength(0)
  })
})
