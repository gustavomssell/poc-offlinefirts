import { useState } from 'react'
import { LayersIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { PedidoDialog } from '@/components/pedido-dialog'
import { StatusPedidoIcone } from '@/components/status-pedido-icone'
import { useEngine } from '@/hooks/use-engine'
import { engine } from '@/lib/engine'
import { fmtHora } from '@/lib/backoff'
import { curto, moeda } from '@/lib/pedidos'
import type { Pedido } from '@/lib/types'

export function ListaPedidos() {
  const { pedidos, ops, statusPedidos } = useEngine()
  const [editando, setEditando] = useState<Pedido | null>(null)

  if (pedidos.length === 0) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LayersIcon />
          </EmptyMedia>
          <EmptyTitle>Nenhum pedido ainda</EmptyTitle>
          <EmptyDescription>
            Use “Novo pedido”: o registro é gravado no IndexedDB na hora, mesmo sem rede.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        {pedidos.map((pedido) => {
          const status = statusPedidos[pedido.id]
          const op = ops.find((o) => o.entityId === pedido.id)

          return (
            <div key={pedido.id} className="flex items-start gap-3 rounded-lg border p-3">
              <StatusPedidoIcone status={status} />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{pedido.cliente}</span>
                  <span className="text-xs text-muted-foreground">#{curto(pedido.id)}</span>
                </div>

                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {pedido.produto} · {pedido.quantidade} un · {moeda(pedido.total)} · editado às{' '}
                  {fmtHora(pedido.updatedAt)}
                </p>

                {pedido.observacao && (
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {pedido.observacao}
                  </p>
                )}

                {status === 'failed' && op?.lastError && (
                  <p className="mt-1 truncate text-xs text-destructive" title={op.lastError}>
                    {op.lastError}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Editar pedido de ${pedido.cliente}`}
                  onClick={() => setEditando(pedido)}
                >
                  <PencilIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Excluir pedido de ${pedido.cliente}`}
                  onClick={() => void engine.removerPedido(pedido.id)}
                >
                  <Trash2Icon />
                </Button>
              </div>
            </div>
          )
        })}
      </div>

      <PedidoDialog
        aberto={!!editando}
        onAbertoChange={(aberto) => !aberto && setEditando(null)}
        rotulo="Salvar alterações"
        pedido={editando ?? undefined}
        onSubmit={(dados) => {
          if (!editando) return
          void engine.editarPedido(editando.id, dados)
          setEditando(null)
        }}
      />
    </>
  )
}
