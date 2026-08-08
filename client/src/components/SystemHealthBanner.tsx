import { useCallback, useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ShieldAlert, HelpCircle } from 'lucide-react'
import { SocketContext } from '@/contexts/SocketContext'
import { systemApi, StorageHealth } from '@/lib/api'
import { cn } from '@/lib/utils'

const POLL_INTERVAL_MS = 30_000
// Any threshold crossing DiskMonitor emits — we don't try to merge the
// partial payload, just treat it as a signal to refetch full storage health.
const DISK_SOCKET_EVENTS = ['disk:warning', 'disk:critical', 'disk:normal'] as const

type Level = 'warning' | 'critical'

interface Banner {
  level: Level
  title: string
  message: string
  dismissible: boolean
}

function deriveBanner(health: StorageHealth | null): Banner | null {
  if (!health) return null
  const { diskSpace, circuitBreaker } = health
  const save = diskSpace.saveVolume

  if (circuitBreaker.open) {
    return {
      level: 'critical',
      title: 'Storage degraded',
      message: 'Panel storage degraded — settings changes may not be saved. Check disk space.',
      dismissible: false,
    }
  }
  if (save?.critical) {
    return {
      level: 'critical',
      title: 'Storage critical',
      message: `Save volume critically low (${save.usedPercent}%) — server may corrupt saves`,
      dismissible: false,
    }
  }
  if (save?.warning) {
    return {
      level: 'warning',
      title: 'Storage warning',
      message: `Save volume is ${save.usedPercent}% full — free space to prevent world corruption`,
      dismissible: true,
    }
  }
  return null
}

export function SystemHealthBanner() {
  const [health, setHealth] = useState<StorageHealth | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const socket = useContext(SocketContext)
  const navigate = useNavigate()

  const refresh = useCallback(() => {
    systemApi.getStorageHealth().then(setHealth).catch(() => { /* keep last-known state */ })
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [refresh])

  useEffect(() => {
    if (!socket) return
    DISK_SOCKET_EVENTS.forEach((evt) => socket.on(evt, refresh))
    return () => { DISK_SOCKET_EVENTS.forEach((evt) => socket.off(evt, refresh)) }
  }, [socket, refresh])

  const banner = deriveBanner(health)

  // Reset dismissal once the condition clears so a future warning isn't pre-dismissed.
  useEffect(() => {
    if (!banner) setDismissed(false)
  }, [banner])

  if (!banner || (dismissed && banner.dismissible)) return null

  const isCritical = banner.level === 'critical'
  const Icon = isCritical ? ShieldAlert : AlertTriangle

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn(
        'mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border py-2 pl-3 pr-2',
        isCritical
          ? 'border-destructive/35 bg-destructive/[0.05] shadow-[inset_2px_0_0_hsl(var(--destructive))]'
          : 'border-warning/35 bg-warning/[0.04] shadow-[inset_2px_0_0_hsl(var(--warning))]'
      )}
    >
      <Icon
        className={cn('h-3.5 w-3.5 shrink-0', isCritical ? 'text-destructive' : 'text-warning')}
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span
          className={cn(
            'font-mono text-[10px] font-semibold uppercase tracking-[0.18em]',
            isCritical ? 'text-destructive' : 'text-warning'
          )}
        >
          {banner.title}
        </span>
        <span className="min-w-0 text-xs text-muted-foreground">{banner.message}</span>
      </div>
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={() => navigate('/debug')}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <HelpCircle className="h-3 w-3" aria-hidden="true" />
          Diagnostics
        </button>
        {banner.dismissible && (
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  )
}
