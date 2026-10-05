import { EraserIcon, RotateCcwIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { useEngine } from '@/hooks/use-engine'
import { engine } from '@/lib/engine'

export function PainelSimulacao() {
  const { sim } = useEngine()

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <div role="group" aria-label="Taxa de falha do servidor" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium">Taxa de falha (503)</span>
            <span className="text-sm tabular-nums text-muted-foreground">
              {Math.round(sim.taxaFalha * 100)}%
            </span>
          </div>
          <Slider
            value={[Math.round(sim.taxaFalha * 100)]}
            min={0}
            max={100}
            step={5}
            onValueChange={([v]) => engine.setSimulacao({ taxaFalha: v / 100 })}
          />
          <p className="text-xs text-muted-foreground">
            Probabilidade de o envio falhar e disparar o backoff.
          </p>
        </div>

        <div role="group" aria-label="Latência do servidor" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium">Latência do servidor</span>
            <span className="text-sm tabular-nums text-muted-foreground">{sim.latenciaMs} ms</span>
          </div>
          <Slider
            value={[sim.latenciaMs]}
            min={0}
            max={2000}
            step={50}
            onValueChange={([v]) => engine.setSimulacao({ latenciaMs: v })}
          />
          <p className="text-xs text-muted-foreground">
            Atraso base por requisição (mais até 60% de variação).
          </p>
        </div>
      </div>

      <Separator />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Backoff: base {sim.baseMs / 1000}s, teto {sim.maxMs / 1000}s, até {sim.maxTentativas}{' '}
          tentativas.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => engine.reiniciarServidor()}>
            <RotateCcwIcon data-icon="inline-start" />
            Reiniciar servidor
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void engine.limparDispositivo()}
            title="Apaga pedidos e fila deste dispositivo"
          >
            <EraserIcon data-icon="inline-start" />
            Limpar dispositivo
          </Button>
          <Button variant="ghost" size="sm" onClick={() => engine.limparLog()}>
            <Trash2Icon data-icon="inline-start" />
            Limpar log
          </Button>
        </div>
      </div>
    </div>
  )
}
