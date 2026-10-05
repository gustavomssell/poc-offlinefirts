import { useState } from 'react'
import { PlusIcon, SearchIcon } from 'lucide-react'
import { toast } from 'sonner'
import { ListaPedidos } from '@/components/lista-pedidos'
import { PedidoDialog } from '@/components/pedido-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
  const [busca, setBusca] = useState('')
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

      <CardContent className="flex flex-col gap-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="busca-pedidos"
            name="busca"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Buscar por cliente, produto ou observação"
            aria-label="Buscar pedidos"
            className="pl-9"
          />
        </div>
        <ListaPedidos filtro={busca} />
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
