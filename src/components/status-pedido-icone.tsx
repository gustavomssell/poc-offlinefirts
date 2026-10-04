import { CloudCheckIcon, CloudUploadIcon, TriangleAlertIcon } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import type { StatusPedido } from '@/lib/types'

const CONFIG: Record<
  Exclude<StatusPedido, 'syncing'>,
  { rotulo: string; Icone: typeof CloudCheckIcon; classe: string }
> = {
  synced: {
    rotulo: 'Já está no servidor',
    Icone: CloudCheckIcon,
    classe: 'text-primary',
  },
  pending: {
    rotulo: 'Ainda no dispositivo — na fila de envio',
    Icone: CloudUploadIcon,
    classe: 'text-muted-foreground',
  },
  failed: {
    rotulo: 'Falhou — em quarentena',
    Icone: TriangleAlertIcon,
    classe: 'text-destructive',
  },
}

export function StatusPedidoIcone({ status }: { status: StatusPedido }) {
  if (status === 'syncing') {
    return (
      <span
        title="Enviando para o servidor"
        aria-label="Enviando para o servidor"
        className="flex size-7 shrink-0 items-center justify-center"
      >
        <Spinner />
      </span>
    )
  }

  const { rotulo, Icone, classe } = CONFIG[status]

  return (
    <span
      title={rotulo}
      aria-label={rotulo}
      className="flex size-7 shrink-0 items-center justify-center"
    >
      <Icone className={`size-4 ${classe}`} />
    </span>
  )
}
