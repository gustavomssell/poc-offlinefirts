import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useEngine } from '@/hooks/use-engine'
import { moeda } from '@/lib/pedidos'
import { fmtHora } from '@/lib/backoff'

export function PainelServidor() {
  const { servidor } = useEngine()

  if (servidor.length === 0) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>Servidor sem registros</EmptyTitle>
          <EmptyDescription>Reinicie o mock para restaurar os dados de exemplo.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <>
      <ul className="flex flex-col gap-2 md:hidden">
        {servidor.map((registro) => (
          <li key={registro.id} className="flex flex-col gap-1 rounded-lg border p-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-medium">{registro.cliente}</span>
              <span className="shrink-0 text-sm font-medium tabular-nums">
                {moeda(registro.total)}
              </span>
            </div>

            <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
              <span className="min-w-0 truncate">
                {registro.produto} · {registro.quantidade} un
              </span>
              <span className="shrink-0 tabular-nums">{fmtHora(registro.sincronizadoEm)}</span>
            </div>

            <span className="text-xs text-muted-foreground">#{registro.id.slice(0, 6)}</span>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Qtd</TableHead>
              <TableHead>Total</TableHead>
              <TableHead className="text-right">Recebido</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {servidor.map((registro) => (
              <TableRow key={registro.id}>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{registro.cliente}</span>
                    <span className="text-xs text-muted-foreground">
                      #{registro.id.slice(0, 6)}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{registro.produto}</TableCell>
                <TableCell className="text-sm tabular-nums">{registro.quantidade}</TableCell>
                <TableCell className="text-sm tabular-nums">{moeda(registro.total)}</TableCell>
                <TableCell className="text-right text-xs text-muted-foreground">
                  {fmtHora(registro.sincronizadoEm)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
