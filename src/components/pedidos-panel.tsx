import { useState } from 'react'
import { PlusIcon } from 'lucide-react'
import { toast } from 'sonner'
import { ListaPedidos } from '@/components/lista-pedidos'
import { PedidoDialog } from '@/components/pedido-dialog'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useEngine } from '@/hooks/use-engine'
import { engine } from '@/lib/engine'

export function PedidosPanel() {
  const [criando, setCriando] = useState(false)
  const { stats } = useEngine()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pedidos</CardTitle>
        <CardDescription>
          Os registros são gravados neste dispositivo; o ícone de cada item mostra o estado de
          sincronização.
        </CardDescription>
        <CardAction>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{stats.locais}</Badge>
            <Button size="sm" onClick={() => setCriando(true)}>
              <PlusIcon data-icon="inline-start" />
              Novo pedido
            </Button>
          </div>
        </CardAction>
      </CardHeader>

      <CardContent>
        <ListaPedidos />
      </CardContent>

      <PedidoDialog
        aberto={criando}
        onAbertoChange={setCriando}
        rotulo="Criar pedido"
        onSubmit={(dados) => {
          void engine.criarPedido(dados)
          setCriando(false)
          toast.success('Pedido gravado no dispositivo')
        }}
      />
    </Card>
  )
}
