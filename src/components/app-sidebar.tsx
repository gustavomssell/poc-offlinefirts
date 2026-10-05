import { CloudIcon, PencilLineIcon, ServerIcon, WifiIcon, WifiOffIcon } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { useEngine } from '@/hooks/use-engine'

export type Vista = 'registro' | 'backoffice'

export const VISTAS = [
  { id: 'registro', rotulo: 'Registro', icon: PencilLineIcon },
  { id: 'backoffice', rotulo: 'Backoffice', icon: ServerIcon },
] as const satisfies ReadonlyArray<{ id: Vista; rotulo: string; icon: typeof ServerIcon }>

type Props = {
  vista: Vista
  onVistaChange: (vista: Vista) => void
}

export function AppSidebar({ vista, onVistaChange }: Props) {
  const { sim } = useEngine()
  const { isMobile, setOpenMobile } = useSidebar()

  const irPara = (destino: Vista) => {
    onVistaChange(destino)
    if (isMobile) setOpenMobile(false)
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <CloudIcon className="size-4" />
          </div>
          <div className="grid flex-1 leading-tight group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-semibold">Sync offline-first</span>
            <span className="truncate text-xs text-sidebar-foreground/70">
              POC · pedidos de venda
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Áreas</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {VISTAS.map((item) => (
                <SidebarMenuItem key={item.id}>
                  <SidebarMenuButton
                    isActive={vista === item.id}
                    tooltip={item.rotulo}
                    onClick={() => irPara(item.id)}
                  >
                    <item.icon />
                    {item.rotulo}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-sidebar-foreground/70">
          {sim.online ? (
            <WifiIcon className="size-4" />
          ) : (
            <WifiOffIcon className="size-4 text-destructive" />
          )}
          <span className="truncate group-data-[collapsible=icon]:hidden">
            {sim.online ? 'Conectado' : 'Sem conexão'}
          </span>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
