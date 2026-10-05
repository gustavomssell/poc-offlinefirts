import { describe, expect, it } from 'vitest'
import { backoffMs, fmtDuracao, fmtHora } from './backoff'

describe('backoffMs', () => {
  it('cresce exponencialmente, aplica jitter e respeita o teto', () => {
    for (let tentativa = 1; tentativa <= 8; tentativa++) {
      const expo = Math.min(1000 * 2 ** (tentativa - 1), 30_000)
      for (let i = 0; i < 25; i++) {
        const espera = backoffMs(tentativa, 1000, 30_000)
        expect(espera).toBeGreaterThanOrEqual(expo / 2)
        expect(espera).toBeLessThan(expo)
      }
    }
  })

  it('nunca passa do teto mesmo em tentativas altas', () => {
    for (let i = 0; i < 50; i++) {
      expect(backoffMs(20, 1000, 30_000)).toBeLessThan(30_000)
      expect(backoffMs(20, 1000, 30_000)).toBeGreaterThanOrEqual(15_000)
    }
  })
})

describe('fmtDuracao', () => {
  it('formata ms, segundos e minutos', () => {
    expect(fmtDuracao(500)).toBe('500ms')
    expect(fmtDuracao(1500)).toBe('1,5s')
    expect(fmtDuracao(120_000)).toBe('2min')
  })
})

describe('fmtHora', () => {
  it('devolve HH:MM:SS', () => {
    expect(fmtHora(Date.now())).toMatch(/^\d{2}:\d{2}:\d{2}$/)
  })
})
