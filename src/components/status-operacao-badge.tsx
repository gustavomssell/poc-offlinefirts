import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import type { Operacao } from '@/lib/types'

export function StatusOperacaoBadge({ op }: { op: Operacao }) {
  if (op.status === 'syncing') {
    return (
      <Badge>
        <Spinner />
        Enviando
      </Badge>
    )
  }

  if (op.status === 'failed') return <Badge variant="destructive">Quarentena</Badge>

  return <Badge variant="outline">Pendente</Badge>
}
