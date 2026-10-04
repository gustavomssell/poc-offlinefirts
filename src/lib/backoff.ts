/**
 * Backoff exponencial com jitter uniforme ("equal jitter"):
 *   exp = min(base * 2^(tentativa-1), teto)
 *   espera = exp/2 + aleatorio(0, exp/2)
 *
 * O jitter evita que varias operacoes pendentes disparem junto quando o
 * servidor volta a ficar saudavel (thundering herd).
 */
export function backoffMs(tentativa: number, baseMs: number, maxMs: number): number {
  const exponencial = Math.min(baseMs * 2 ** Math.max(tentativa - 1, 0), maxMs)
  const parte = Math.round(exponencial / 2)
  return parte + Math.floor(Math.random() * (parte || 1))
}

export function fmtDuracao(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1).replace('.', ',')}s`
  return `${Math.round(ms / 60_000)}min`
}

export function fmtHora(ts: number): string {
  return new Date(ts).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}
