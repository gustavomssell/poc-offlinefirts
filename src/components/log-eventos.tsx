import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { useEngine } from '@/hooks/use-engine'
import { fmtHora } from '@/lib/backoff'
import type { LogLevel } from '@/lib/types'

const ESTILOS: Record<LogLevel, { rotulo: string; variant: 'outline' | 'secondary' | 'default' | 'destructive' }> = {
  info: { rotulo: 'info', variant: 'outline' },
  success: { rotulo: 'ok', variant: 'secondary' },
  warn: { rotulo: 'warn', variant: 'default' },
  error: { rotulo: 'erro', variant: 'destructive' },
}

export function LogEventos() {
  const { log } = useEngine()

  if (log.length === 0) {
    return (
      <Empty className="border-0">
        <EmptyHeader>
          <EmptyTitle>Sem eventos</EmptyTitle>
          <EmptyDescription>O log registra cada tentativa, backoff e sincronização.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <ScrollArea className="h-72">
      <div className="flex flex-col pr-3">
        {log.map((entry) => {
          const estilo = ESTILOS[entry.level]
          return (
            <div key={entry.id} className="flex items-start gap-2 border-b py-1.5 last:border-0">
              <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {fmtHora(entry.at)}
              </span>
              <Badge variant={estilo.variant} className="shrink-0">
                {estilo.rotulo}
              </Badge>
              <span className="min-w-0 flex-1 text-xs break-words">{entry.message}</span>
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}
