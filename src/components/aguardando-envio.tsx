import { ServerOffIcon } from 'lucide-react'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { StatusOperacaoBadge } from '@/components/status-operacao-badge'
import { useEngine } from '@/hooks/use-engine'
import { curto, rotuloOperacao } from '@/lib/pedidos'

export function AguardandoEnvio() {
  const { ops } = useEngine()

  if (ops.length === 0) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ServerOffIcon />
          </EmptyMedia>
          <EmptyTitle>Nada pendente</EmptyTitle>
          <EmptyDescription>
            Todo pedido gravado no dispositivo já foi entregue ao servidor.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {ops.map((op) => (
        <li key={op.opId} className="flex items-start gap-3 rounded-lg border p-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-medium">
                {op.payload?.cliente ?? `#${curto(op.entityId)}`}
              </span>
              <StatusOperacaoBadge op={op} />
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {rotuloOperacao(op.tipo)} · seq {op.seq} · {op.attempts} tentativa(s)
              {op.lastError ? ` · ${op.lastError}` : ''}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}
