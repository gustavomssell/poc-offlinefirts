import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AppHeader } from '@/components/app-header'
import { AppSidebar, type Vista } from '@/components/app-sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useEngine } from '@/hooks/use-engine'
import { engine } from '@/lib/engine'
import { BackofficeView } from '@/views/backoffice-view'
import { RegistroView } from '@/views/registro-view'

let iniciado = false

export default function App() {
  const snap = useEngine()
  const falhasAnteriores = useRef<number | null>(null)
  const [vista, setVista] = useState<Vista>('registro')

  useEffect(() => {
    if (iniciado) return
    iniciado = true
    void engine.init()
  }, [])

  useEffect(() => {
    const anterior = falhasAnteriores.current
    if (anterior !== null && snap.stats.falhas > anterior) {
      toast.error('Operação enviada para quarentena', {
        description:
          'A fila desistiu das tentativas. Use "tentar novamente" ou descarte a operação.',
      })
    }
    falhasAnteriores.current = snap.stats.falhas
  }, [snap.stats.falhas])

  if (!snap.pronto) {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
        <Skeleton className="h-14 w-full" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    )
  }

  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar vista={vista} onVistaChange={setVista} />

        <SidebarInset>
          <AppHeader vista={vista} />

          <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-5">
            {vista === 'registro' ? <RegistroView /> : <BackofficeView />}
          </div>

          <Toaster position="top-right" richColors />
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
