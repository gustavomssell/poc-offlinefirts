import { PedidoForm } from '@/components/pedido-form'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { Pedido, PedidoInput } from '@/lib/types'

type Props = {
  aberto: boolean
  onAbertoChange: (aberto: boolean) => void
  onSubmit: (dados: PedidoInput) => void
  rotulo: string
  pedido?: Pedido
}

export function PedidoDialog({ aberto, onAbertoChange, onSubmit, rotulo, pedido }: Props) {
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{pedido ? 'Editar pedido' : 'Novo pedido'}</DialogTitle>
          <DialogDescription>
            {pedido
              ? 'A alteração regrava o registro local e coalesce na operação já pendente.'
              : 'Gravado primeiro no dispositivo — a fila de sync cuida do envio.'}
          </DialogDescription>
        </DialogHeader>

        <PedidoForm
          key={pedido?.id ?? 'novo'}
          inicial={pedido}
          rotulo={rotulo}
          onSubmit={onSubmit}
          onCancel={() => onAbertoChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
