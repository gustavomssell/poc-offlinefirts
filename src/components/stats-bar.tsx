import {
  CircleCheckIcon,
  DatabaseIcon,
  GaugeIcon,
  LayersIcon,
  ServerIcon,
  TimerIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from 'cn'
import { useEngine } from '@/hooks/use-engine'

type Stat = {
  label: string
  valor: number | string
  hint: string
  icon: LucideIcon
  destaque?: boolean
}

function StatCard({ stat }: { stat: Stat }) {
  return (
    <Card size="sm">
      <CardContent className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">{stat.label}</p>
          <p
            className={cn(
              'text-2xl font-semibold tracking-tight tabular-nums',
              stat.destaque && 'text-destructive',
            )}
          >
            {stat.valor}
          </p>
          <p className="text-xs text-muted-foreground">{stat.hint}</p>
        </div>
        <stat.icon className="size-4 text-muted-foreground" />
      </CardContent>
    </Card>
  )
}

export function StatsDispositivo() {
  const { stats } = useEngine()

  const itens: Stat[] = [
    {
      label: 'Pedidos',
      valor: stats.locais,
      hint: 'gravados no dispositivo',
      icon: DatabaseIcon,
    },
    {
      label: 'Sincronizados',
      valor: stats.sincronizados,
      hint: 'idênticos ao servidor',
      icon: CircleCheckIcon,
    },
    {
      label: 'Na fila',
      valor: stats.pendentes + stats.sincronizando,
      hint: 'pendentes + em envio',
      icon: LayersIcon,
    },
    {
      label: 'Falhas',
      valor: stats.falhas,
      hint: 'em quarentena',
      icon: TriangleAlertIcon,
      destaque: stats.falhas > 0,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {itens.map((stat) => (
        <StatCard key={stat.label} stat={stat} />
      ))}
    </div>
  )
}

export function StatsBackoffice() {
  const { servidor, stats, sim } = useEngine()

  const aguardando = stats.pendentes + stats.sincronizando + stats.falhas
  const itens: Stat[] = [
    {
      label: 'Registros no servidor',
      valor: servidor.length,
      hint: 'estado remoto atual',
      icon: ServerIcon,
    },
    {
      label: 'Aguardando chegar',
      valor: aguardando,
      hint: 'alterações só no dispositivo',
      icon: LayersIcon,
      destaque: stats.falhas > 0,
    },
    {
      label: 'Taxa de falha',
      valor: `${Math.round(sim.taxaFalha * 100)}%`,
      hint: 'probabilidade de 503',
      icon: GaugeIcon,
    },
    {
      label: 'Latência',
      valor: `${sim.latenciaMs} ms`,
      hint: 'atraso base do mock',
      icon: TimerIcon,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {itens.map((stat) => (
        <StatCard key={stat.label} stat={stat} />
      ))}
    </div>
  )
}
