import { RotateCcwIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StatusOperacaoBadge } from '@/components/status-operacao-badge'
import { useEngine } from '@/hooks/use-engine'
import { engine } from '@/lib/engine'
import { curto, rotuloOperacao } from '@/lib/pedidos'
import type { Operacao } from '@/lib/types'

function proximaTentativa(op: Operacao, agora: number): string {
  if (op.status === 'failed') return '—'
  if (op.status === 'syncing') return 'enviando'
  const espera = (op.nextRetryAt ?? 0) - agora
  if (espera <= 0) return 'agora'
  return `em ${(espera / 1000).toFixed(1).replace('.', ',')}s`
}

export function FilaSync() {
  const { ops, sim, agora } = useEngine()

  if (ops.length === 0) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>Fila vazia</EmptyTitle>
          <EmptyDescription>
            Toda alteração local já foi enviada — ou nunca houve uma pendência.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <>
      <ul className="flex flex-col gap-2 md:hidden">
        {ops.map((op) => (
          <li key={op.opId} className="flex flex-col gap-2 rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {rotuloOperacao(op.tipo)}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {op.payload?.cliente ?? `#${curto(op.entityId)}`} · #{curto(op.entityId)} · seq{' '}
                  {op.seq}
                </span>
              </div>
              <StatusOperacaoBadge op={op} />
            </div>

            {op.lastError && (
              <p className="truncate text-xs text-destructive" title={op.lastError}>
                {op.lastError}
              </p>
            )}

            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs tabular-nums text-muted-foreground">
                  {op.attempts}/{sim.maxTentativas} tentativas · próxima {proximaTentativa(op, agora)}
                </p>
                <Progress className="mt-1.5" value={(op.attempts / sim.maxTentativas) * 100} />
              </div>

              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Tentar sincronizar novamente"
                  disabled={op.status !== 'failed'}
                  onClick={() => void engine.tentarNovamente(op.opId)}
                >
                  <RotateCcwIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Descartar operação da fila"
                  disabled={op.status === 'syncing'}
                  onClick={() => void engine.descartarOperacao(op.opId)}
                >
                  <XIcon />
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Operação</TableHead>
              <TableHead>Pedido</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Tentativas</TableHead>
              <TableHead>Próxima</TableHead>
              <TableHead className="w-20 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ops.map((op) => (
              <TableRow key={op.opId}>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{rotuloOperacao(op.tipo)}</span>
                    <span className="text-xs text-muted-foreground">seq {op.seq}</span>
                  </div>
                </TableCell>

                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="max-w-32 truncate text-sm">
                      {op.payload?.cliente ?? `#${curto(op.entityId)}`}
                    </span>
                    <span className="text-xs text-muted-foreground">#{curto(op.entityId)}</span>
                  </div>
                </TableCell>

                <TableCell>
                  <div className="flex flex-col gap-1">
                    <StatusOperacaoBadge op={op} />
                    {op.lastError && (
                      <span
                        className="max-w-32 truncate text-xs text-destructive"
                        title={op.lastError}
                      >
                        {op.lastError}
                      </span>
                    )}
                  </div>
                </TableCell>

                <TableCell>
                  <div className="flex w-20 flex-col gap-1.5">
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {op.attempts}/{sim.maxTentativas}
                    </span>
                    <Progress value={(op.attempts / sim.maxTentativas) * 100} />
                  </div>
                </TableCell>

                <TableCell className="text-sm tabular-nums text-muted-foreground">
                  {proximaTentativa(op, agora)}
                </TableCell>

                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Tentar sincronizar novamente"
                      disabled={op.status !== 'failed'}
                      onClick={() => void engine.tentarNovamente(op.opId)}
                    >
                      <RotateCcwIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Descartar operação da fila"
                      disabled={op.status === 'syncing'}
                      onClick={() => void engine.descartarOperacao(op.opId)}
                    >
                      <XIcon />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
