import { AguardandoEnvio } from '@/components/aguardando-envio'
import { FilaSync } from '@/components/fila-sync'
import { LogEventos } from '@/components/log-eventos'
import { PainelServidor } from '@/components/painel-servidor'
import { PainelSimulacao } from '@/components/painel-simulacao'
import { StatsBackoffice, StatsDispositivo } from '@/components/stats-bar'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useEngine } from '@/hooks/use-engine'
import { LIMITE_CREDITO } from '@/lib/mock-server'
import { moeda } from '@/lib/pedidos'

export function BackofficeView() {
  const { servidor, ops, log, stats } = useEngine()

  return (
    <div className="flex flex-col gap-4">
      <StatsBackoffice />
      <StatsDispositivo />

      <Card>
        <CardHeader>
          <CardTitle>Fila de sincronização (outbox)</CardTitle>
          <CardDescription>
            Uma operação por pedido, ordem preservada, retry com backoff exponencial e jitter.
          </CardDescription>
          <CardAction>
            <Badge variant={ops.length > 0 ? 'outline' : 'secondary'}>{ops.length}</Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <FilaSync />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle>Dados do servidor</CardTitle>
            <CardDescription>
              Espelho do backend mock — persistido em localStorage, independente do dispositivo.
            </CardDescription>
            <CardAction>
              <Badge variant="secondary">{servidor.length}</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <PainelServidor />
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Aguardando chegar</CardTitle>
            <CardDescription>
              O que existe apenas no dispositivo, visto do servidor.
            </CardDescription>
            <CardAction>
              <Badge variant={ops.length > 0 ? 'outline' : 'secondary'}>{ops.length}</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <AguardandoEnvio />
          </CardContent>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader>
            <CardTitle>Simulação de rede e servidor</CardTitle>
            <CardDescription>
              Mock com latência e falhas aleatórias. Regra fixa: pedidos acima de{' '}
              {moeda(LIMITE_CREDITO)} são rejeitados com 422.
            </CardDescription>
            <CardAction>
              <div className="flex items-center gap-2">
                {stats.conflitos > 0 && (
                  <Badge variant="outline">{stats.conflitos} conflitos</Badge>
                )}
                <Badge variant={stats.falhas > 0 ? 'destructive' : 'secondary'}>
                  {stats.falhas} em quarentena
                </Badge>
              </div>
            </CardAction>
          </CardHeader>
          <CardContent>
            <PainelSimulacao />
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader>
            <CardTitle>Log de eventos</CardTitle>
            <CardDescription>Cada tentativa, backoff e sincronização registrada.</CardDescription>
            <CardAction>
              <Badge variant="outline">{log.length}</Badge>
            </CardAction>
          </CardHeader>
          <CardContent>
            <LogEventos />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
