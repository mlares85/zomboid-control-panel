import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Play, Square, RotateCcw, Archive, Terminal, Loader2, Server as ServerIcon, Globe, Container } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ServerStatusBadge } from '@/components/ServerStatusBadge'
import { useToast } from '@/components/ui/use-toast'
import { errorToastContent } from '@/lib/errorToast'
import { cn, formatUptime } from '@/lib/utils'
import { serversApi, serverApi, backupApi, ServerInstance, ComposedServerStatus, ContainerStats } from '@/lib/api'

export interface ServerCardStats {
  players: number
  uptimeSeconds: number
  lastBackupSize: number | null
}

interface ServerCardProps {
  server: ServerInstance
  isRunning: boolean
  /** Full 3-signal status — only known for the currently active server. */
  activeStatus: ComposedServerStatus | null
  /** Live stats — only known for the currently active server. */
  stats: ServerCardStats | null
  /** Docker CPU/RAM/disk snapshot — only present for docker-backed servers with a running container. */
  containerStats?: ContainerStats | null
  /** Called after activation/actions so the parent can refresh sooner than the next poll. */
  onChanged: () => void
  /** Called once this card's server is the active one — lets the parent drill into a detail view. */
  onDrillIn?: (serverId: string | number) => void
}

// Duplicated in Backups.tsx — three lines isn't worth a shared util for.
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatContainerStats(cs: ContainerStats): string {
  const toGB = (bytes: number) => (bytes / (1024 * 1024 * 1024)).toFixed(1)
  const cpu = Math.round(cs.cpu.usagePercent)
  const ram = `${toGB(cs.memory.used)}/${toGB(cs.memory.limit)}GB`
  const disk = formatBytes(cs.disk.read + cs.disk.write)
  return `CPU ${cpu}% · RAM ${ram} · Disk ${disk}`
}

function providerBadge(server: ServerInstance, activeStatus: ComposedServerStatus | null) {
  const provider = server.isActive ? activeStatus?.provider : undefined
  if (provider === 'docker') return { label: 'Docker', icon: Container }
  if (server.isRemote) return { label: 'Remote', icon: Globe }
  return { label: 'Native', icon: ServerIcon }
}

function ActionButton({
  label, icon: Icon, onClick, disabled, pending, className,
}: {
  label: string; icon: typeof Play; onClick: () => void; disabled?: boolean; pending?: boolean; className?: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className={cn(
            'pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-md border border-border/50 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-40',
            className,
          )}
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function ServerCard({ server, isRunning, activeStatus, stats, containerStats, onChanged, onDrillIn }: ServerCardProps) {
  const [pending, setPending] = useState<string | null>(null)
  const { toast } = useToast()
  const navigate = useNavigate()
  const provider = providerBadge(server, activeStatus)

  const runAction = async (name: string, fn: () => Promise<unknown>, successTitle: string) => {
    setPending(name)
    try {
      if (!server.isActive) await serversApi.activate(server.id)
      await fn()
      toast({ title: successTitle, description: server.name, variant: 'success' as const })
      onChanged()
    } catch (error) {
      toast({ title: 'Error', ...errorToastContent(error, `Failed to ${name} server.`), variant: 'destructive' })
    } finally {
      setPending(null)
    }
  }

  const handleSelect = async () => {
    // Already active: nothing to activate, just let the parent drill in.
    if (server.isActive) { onDrillIn?.(server.id); return }
    setPending('select')
    try {
      await serversApi.activate(server.id)
      onChanged()
      if (onDrillIn) onDrillIn(server.id)
      else toast({ title: `Switched to ${server.name}`, variant: 'success' as const })
    } catch (error) {
      toast({ title: 'Error', ...errorToastContent(error, 'Failed to select server.'), variant: 'destructive' })
    } finally {
      setPending(null)
    }
  }
  const handleStart = () => runAction('start', serverApi.start, 'Server starting')
  const handleStop = () => runAction('stop', serverApi.stop, 'Server stopping')
  const handleRestart = () => runAction('restart', serverApi.restartNow, 'Restart triggered')
  const handleBackup = () => runAction('backup', () => backupApi.createBackup({ includeDb: true }), 'Backup started')

  const handleConsole = async () => {
    if (server.isActive) { navigate('/console'); return }
    setPending('console')
    try {
      await serversApi.activate(server.id)
      onChanged()
      navigate('/console')
    } catch (error) {
      toast({ title: 'Error', ...errorToastContent(error, 'Failed to switch server.'), variant: 'destructive' })
    } finally {
      setPending(null)
    }
  }

  return (
    <Card
      className={cn(
        'relative overflow-hidden p-3 transition-colors',
        server.isActive
          ? 'border-primary/50 bg-primary/[0.03] ring-1 ring-primary/20'
          : 'bg-muted/10 hover:border-primary/25',
      )}
    >
      <button
        type="button"
        onClick={handleSelect}
        disabled={(server.isActive && !onDrillIn) || pending !== null}
        aria-label={
          server.isActive
            ? (onDrillIn ? `Open ${server.name}` : `${server.name} is the active server`)
            : `Switch to ${server.name}`
        }
        className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 disabled:cursor-default"
      />

      <div className="pointer-events-none relative z-10 flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-foreground" title={server.name}>{server.name}</span>
            <Badge variant="outline" className="shrink-0 gap-1 px-1.5 py-0 text-[9px]">
              <provider.icon className="h-2.5 w-2.5" /> {provider.label}
            </Badge>
          </div>
          {server.isActive && (
            <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-primary">
              <Check className="h-3 w-3" /> Selected
            </span>
          )}
        </div>

        <ServerStatusBadge
          compact
          host={server.isActive ? activeStatus?.host : { status: isRunning ? 'running' : 'stopped', label: 'Process', detail: null }}
          server={server.isActive ? activeStatus?.server : undefined}
          bridge={server.isActive ? activeStatus?.bridge : undefined}
        />

        <div className="flex items-center gap-3 font-mono text-[10px] tabular-nums text-muted-foreground/80">
          <span>{stats ? `${stats.players} online` : '—'}</span>
          <span>{stats && isRunning ? formatUptime(stats.uptimeSeconds) : '—'}</span>
          <span>{stats?.lastBackupSize != null ? formatBytes(stats.lastBackupSize) : '—'}</span>
        </div>

        {containerStats && (
          <div className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
            {formatContainerStats(containerStats)}
          </div>
        )}

        <div className="flex items-center gap-1 border-t border-border/30 pt-1.5">
          <ActionButton label="Start" icon={Play} onClick={handleStart} disabled={pending !== null || isRunning} pending={pending === 'start'} />
          <ActionButton label="Stop" icon={Square} onClick={handleStop} disabled={pending !== null || !isRunning} pending={pending === 'stop'} />
          <ActionButton label="Restart" icon={RotateCcw} onClick={handleRestart} disabled={pending !== null || !isRunning} pending={pending === 'restart'} />
          <ActionButton label="Backup" icon={Archive} onClick={handleBackup} disabled={pending !== null || server.isRemote} pending={pending === 'backup'} />
          <ActionButton label="Console" icon={Terminal} onClick={handleConsole} disabled={pending !== null} pending={pending === 'console'} />
        </div>
      </div>
    </Card>
  )
}
