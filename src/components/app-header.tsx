import { useSyncExternalStore } from 'react'
import {
  CheckCheckIcon,
  MoonIcon,
  PauseIcon,
  PlayIcon,
  RefreshCwIcon,
  SunIcon,
  WifiIcon,
  WifiOffIcon,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Switch } from '@/components/ui/switch'
import { useEngine } from '@/hooks/use-engine'
import { engine } from '@/lib/engine'
import { fmtHora } from '@/lib/backoff'
import type { Vista } from '@/components/app-sidebar'

const TITULOS: Record<Vista, { titulo: string; sub: string }> = {
  registro: {
    titulo: 'Pedidos de venda',
    sub: 'Registro de pedidos com armazenamento local no dispositivo',
  },
  backoffice: {
    titulo: 'Backoffice do servidor',
    sub: 'Estado remoto, fila de sync, simulação de falhas e rastro de eventos',
  },
}

const semInscricao = () => () => {}

function BotaoTema() {
  const { resolvedTheme, setTheme } = useTheme()
  const montado = useSyncExternalStore(
    semInscricao,
    () => true,
    () => false,
  )

  const escuro = montado && resolvedTheme === 'dark'

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={escuro ? 'Ativar tema claro' : 'Ativar tema escuro'}
      onClick={() => setTheme(escuro ? 'light' : 'dark')}
    >
      {escuro ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}

export function AppHeader({ vista }: { vista: Vista }) {
  const { sim, stats, ultimaSync } = useEngine()
  const conteudo = TITULOS[vista]
  const pendencias = stats.pendentes + stats.sincronizando + stats.falhas
  const backoffice = vista === 'backoffice'

  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
        <SidebarTrigger className="-ml-1 shrink-0" />

        <div className="min-w-56 flex-1">
          <h1 className="truncate text-sm font-semibold tracking-tight">{conteudo.titulo}</h1>
          <p className="hidden truncate text-xs text-muted-foreground sm:block">{conteudo.sub}</p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={sim.online}
              onCheckedChange={(v) => engine.setSimulacao({ online: v })}
              aria-label="Alternar conexão simulada"
            />
            {sim.online ? (
              <Badge variant="secondary">
                <WifiIcon />
                Online
              </Badge>
            ) : (
              <Badge variant="destructive">
                <WifiOffIcon />
                Offline
              </Badge>
            )}
          </div>

          {pendencias > 0 && <Badge variant="outline">{pendencias} pendências</Badge>}

          {ultimaSync && (
            <Badge variant="outline" title="Última sincronização">
              <CheckCheckIcon />
              {fmtHora(ultimaSync)}
            </Badge>
          )}

          {backoffice && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => engine.setSimulacao({ pausada: !sim.pausada })}
              >
                {sim.pausada ? (
                  <PlayIcon data-icon="inline-start" />
                ) : (
                  <PauseIcon data-icon="inline-start" />
                )}
                {sim.pausada ? 'Retomar' : 'Pausar'}
              </Button>

              <Button
                size="sm"
                disabled={!sim.online || sim.pausada}
                onClick={() => void engine.sincronizarAgora()}
              >
                <RefreshCwIcon data-icon="inline-start" />
                Sincronizar agora
              </Button>
            </>
          )}

          <BotaoTema />
        </div>
      </div>
    </header>
  )
}
