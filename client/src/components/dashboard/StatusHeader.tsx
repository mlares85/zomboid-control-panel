import { Link } from 'react-router-dom'
import {
  Play, Square, RotateCcw, Save, Server, Wifi, Loader2, MoreHorizontal,
  Zap, Trash2, Archive, Skull, RefreshCw, Copy, Gamepad2, Globe, Monitor,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { serverApi, backupApi, type ServerInstance } from '@/lib/api'
import { cn, copyText } from '@/lib/utils'
import { formatUptime } from '@/lib/utils'
import { useToast } from '@/components/ui/use-toast'
import type { Verdict } from './DashboardVerdict'
import type { ConfirmAction, Player, ServerStatus } from './types'

interface Props {
  verdict: Verdict
  activeServer: ServerInstance | null
  status: ServerStatus | null
  online: boolean
  hasServer: boolean
  loading: string | null
  players: Player[]
  panelInfo: { localIp: string; port: number; url: string } | null
  onAction: (action: string, fn: () => Promise<unknown>) => void
  onConfirm: (action: ConfirmAction) => void
  onConnect: () => void
  onRefresh: () => void
  onRefreshMaintenance: () => void
  onOpenWipe: () => void
}

export function StatusHeader({
  verdict, activeServer, status, online, hasServer, loading, players, panelInfo,
  onAction, onConfirm, onConnect, onRefresh, onRefreshMaintenance, onOpenWipe,
}: Props) {
  const { toast } = useToast()

  const copy = async (text: string, label: string) => {
    try { await copyText(text); toast({ title: 'Copied', description: `${label} copied to clipboard`, duration: 2000 }) }
    catch { toast({ title: 'Failed to copy', description: 'Could not copy to clipboard', variant: 'destructive' }) }
  }

  return (
    <header aria-label="Server status" className="overflow-hidden rounded-lg border border-border/55 bg-card/45 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
        {/* Identity cluster */}
        <div className="flex min-w-0 items-center gap-3">
          <VerdictDot verdict={verdict} />
          <h1 className="min-w-0 truncate font-mono text-base font-semibold text-foreground" title={activeServer?.serverName ?? 'No active server'}>
            {activeServer?.serverName ?? 'No active server'}
          </h1>
          {online && status && status.uptime > 0 && (
            <span className="hidden font-mono text-[11px] tabular-nums text-muted-foreground/60 sm:inline">
              up {formatUptime(status.uptime)}
            </span>
          )}
          {activeServer?.isRemote && (
            <span className="rounded-sm bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">remote</span>
          )}
        </div>

        {/* Address bar */}
        <AddressBar status={status} panelInfo={panelInfo} onCopy={copy} />

        {/* Controls */}
        <div className="order-2 ml-auto flex flex-wrap justify-end gap-1">
          <ServerControls
            online={online} hasServer={hasServer} loading={loading}
            activeServer={activeServer} players={players} status={status}
            onAction={onAction} onConfirm={onConfirm} onConnect={onConnect}
            onRefresh={onRefresh} onRefreshMaintenance={onRefreshMaintenance}
            onOpenWipe={onOpenWipe}
          />
        </div>
      </div>
    </header>
  )
}

function VerdictDot({ verdict }: { verdict: Verdict }) {
  const color = verdict.level === 'critical' ? 'bg-destructive'
    : verdict.level === 'warning' ? 'bg-warning' : 'bg-success'
  return (
    <span className="relative flex h-2.5 w-2.5 shrink-0 items-center justify-center" title={verdict.headline ?? 'Everything nominal'}>
      <span className={cn('absolute inline-flex h-2.5 w-2.5 rounded-full opacity-25', color)} />
      <span className={cn('relative inline-flex h-1.5 w-1.5 rounded-full', color)} />
      <span className="sr-only">{verdict.headline ?? 'Everything nominal'}</span>
    </span>
  )
}

function AddressBar({
  status, panelInfo, onCopy,
}: { status: ServerStatus | null; panelInfo: Props['panelInfo']; onCopy: (text: string, label: string) => void }) {
  return (
    <div className="order-3 -mx-4 -mb-3 flex w-[calc(100%+2rem)] flex-wrap items-center gap-1 border-t border-border/30 bg-background/20 px-3 py-1.5">
      {status?.localIp && (
        <AddressButton icon={<Wifi className="h-3 w-3 text-emerald-500/70" />} tag="LAN"
          address={`${status.localIp}${status.port ? `:${status.port}` : ''}`}
          onClick={() => onCopy(`${status.localIp}${status.port ? `:${status.port}` : ''}`, 'LAN address')}
          title="Connect from your home network" />
      )}
      {status?.publicIp && (
        <AddressButton icon={<Globe className="h-3 w-3 text-amber-500/70" />} tag="WAN"
          address={`${status.publicIp}${status.port ? `:${status.port}` : ''}`}
          onClick={() => onCopy(`${status.publicIp}${status.port ? `:${status.port}` : ''}`, 'WAN address')}
          title="Share this address with internet players" />
      )}
      {panelInfo && (
        <AddressButton icon={<Monitor className="h-3 w-3 text-primary/70" />} tag="Panel"
          address={`${panelInfo.localIp}:${panelInfo.port}`}
          onClick={() => onCopy(panelInfo.url, 'Panel address')}
          title="Open or copy the control panel address" />
      )}
      {status?.publicIp && status?.port && (
        <a href={`steam://connect/${status.publicIp}:${status.port}`}
          className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground"
          aria-label={`Join with Steam at ${status.publicIp}:${status.port}`} title="Connect with Steam">
          <Gamepad2 className="h-3 w-3 text-blue-400/70" />
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em]">Join</span>
        </a>
      )}
    </div>
  )
}

function AddressButton({ icon, tag, address, onClick, title }: {
  icon: React.ReactNode; tag: string; address: string; onClick: () => void; title: string
}) {
  return (
    <button onClick={onClick} title={title}
      className="group inline-flex items-center gap-1.5 rounded-sm px-2 py-1 text-muted-foreground transition-colors hover:bg-background/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
      aria-label={`Copy ${tag} address: ${address}`}>
      {icon}
      <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-foreground/45">{tag}</span>
      <span className="font-mono text-[11px] tabular-nums">{address}</span>
      <Copy className="h-2.5 w-2.5 shrink-0 opacity-35 transition-opacity group-hover:opacity-70" />
    </button>
  )
}

function ServerControls({
  online, hasServer, loading, activeServer, players, status,
  onAction, onConfirm, onConnect, onRefresh, onRefreshMaintenance, onOpenWipe,
}: Omit<Props, 'verdict' | 'panelInfo'>) {
  const ghostBtn = (color: string, hoverBg: string) =>
    `h-8 gap-1.5 rounded-md border border-${color}/30 px-2.5 text-xs text-${color} hover:bg-${color}/${hoverBg} hover:text-${color.replace('400','300')} disabled:border-border/50 disabled:text-muted-foreground`

  return (
    <>
      {!online ? (
        <Button onClick={() => onAction('Start server', serverApi.start)} disabled={!hasServer || loading !== null || activeServer?.isRemote}
          variant="ghost" size="sm"
          className={ghostBtn('emerald-400', '10')}
          title={!hasServer ? 'Add or select a server first' : activeServer?.isRemote ? 'Not available for remote (RCON-only) servers' : undefined}>
          {loading === 'Start server' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
          Start
        </Button>
      ) : (
        <>
          <Button onClick={() => onConfirm({ title: 'Stop server', description: 'Are you sure you want to stop the server? All connected players will be disconnected.', action: serverApi.stop, variant: 'destructive' })}
            disabled={loading !== null} variant="ghost" size="sm" className={ghostBtn('red-400', '10')}>
            {loading === 'Stop server' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />} Stop
          </Button>
          <Button onClick={() => onConfirm({ title: 'Force stop server', description: `This will immediately kill the game process without saving.${players.length > 0 ? ` ${players.length} player(s) will be disconnected!` : ''}`, action: serverApi.forceStop, variant: 'destructive' })}
            disabled={loading !== null || activeServer?.isRemote} variant="ghost" size="sm" className={ghostBtn('red-400', '10')}
            title={activeServer?.isRemote ? 'Not available for remote (RCON-only) servers' : 'Immediately stops the game without saving'}>
            {loading === 'Force stop server' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Skull className="h-3.5 w-3.5" />} Force stop
          </Button>
          <Button onClick={() => onConfirm({ title: 'Restart server', description: 'This will send a 5-minute warning to all players, then restart the server.', action: () => serverApi.restart(5), variant: 'warning' })}
            disabled={loading !== null || activeServer?.isRemote} variant="ghost" size="sm"
            className={ghostBtn('amber-400', '10')} title={activeServer?.isRemote ? 'Not available for remote (RCON-only) servers' : undefined}>
            <RotateCcw className="h-3.5 w-3.5" /> Restart
          </Button>
          <Button onClick={() => onAction('Save world', serverApi.save)} disabled={loading !== null}
            variant="ghost" size="sm" className={ghostBtn('sky-400', '10')}>
            <Save className="h-3.5 w-3.5" /> Save
          </Button>
        </>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" className="h-8 w-8 border-border/60 text-muted-foreground hover:text-foreground" aria-label="More server actions">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onAction('Create backup', () => backupApi.createBackup({ includeDb: true }).then(() => onRefreshMaintenance()))}
            disabled={!hasServer || loading !== null || activeServer?.isRemote}>
            <Archive className="mr-2 h-4 w-4" /> Create backup
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onRefresh}><RefreshCw className="mr-2 h-4 w-4" /> Refresh status</DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link to="/settings" className="flex items-center"><Server className="mr-2 h-4 w-4" /> Bridge settings</Link>
          </DropdownMenuItem>
          {!status?.rcon?.connected && (
            <DropdownMenuItem onClick={onConnect} disabled={!hasServer || loading !== null}>
              <Wifi className="mr-2 h-4 w-4" /> Connect RCON
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onConfirm({ title: 'Restart server now', description: `This will immediately restart the server without warning.${players.length > 0 ? ` ${players.length} player(s) will be disconnected!` : ''}`, action: () => serverApi.restart(0), variant: 'destructive' })}
            disabled={!hasServer || !online || loading !== null || activeServer?.isRemote} className="text-destructive focus:text-destructive">
            <Zap className="mr-2 h-4 w-4" /> Restart now
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenWipe} disabled={!hasServer || online || loading !== null || activeServer?.isRemote}
            className="text-destructive focus:text-destructive">
            <Trash2 className="mr-2 h-4 w-4" /> Wipe server
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
