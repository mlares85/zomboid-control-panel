import {
  LogIn, LogOut, Activity, Skull, Sword, ShieldAlert, AlertCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export function getDashboardSuccessCopy(action: string) {
  switch (action) {
    case 'Start server':      return { title: 'Server starting',       description: 'Watch the dashboard for live status.' }
    case 'Stop server':       return { title: 'Server stopped',        description: 'Session closed cleanly.' }
    case 'Force stop server': return { title: 'Server force stopped',  description: 'The game process was terminated without RCON.' }
    case 'Restart server':    return { title: 'Restart scheduled',     description: 'The server will restart shortly.' }
    case 'Restart server now':return { title: 'Restart triggered',     description: 'Hard restart command sent.' }
    case 'Save world':        return { title: 'World saved',           description: 'Current state written to disk.' }
    case 'Create backup':     return { title: 'Backup started',        description: 'Packaging a fresh recovery point.' }
    case 'Connect RCON':      return { title: 'RCON connected',        description: 'Remote command control ready.' }
    default:                  return { title: 'Action complete',       description: `${action} completed successfully.` }
  }
}

export function isFailedActionResult(value: unknown): value is { success: false; error?: string; message?: string } {
  return typeof value === 'object'
    && value !== null
    && 'success' in value
    && (value as { success?: boolean }).success === false
}

export function formatAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

/** Countdown to a future moment. Returns null once the moment has passed. */
export function formatEta(iso: string): string | null {
  const ms = new Date(iso).getTime() - Date.now()
  if (!Number.isFinite(ms) || ms < 0) return null
  const mins = Math.round(ms / 60000)
  if (mins < 1) return 'any moment'
  if (mins < 60) return `in ${mins}m`
  const hrs = Math.floor(mins / 60)
  const rem = mins % 60
  if (hrs < 24) return rem ? `in ${hrs}h ${rem}m` : `in ${hrs}h`
  return `in ${Math.floor(hrs / 24)}d`
}

export function eventStyle(action: string) {
  switch (action) {
    case 'connect':    return { icon: <LogIn       className="h-3 w-3" />, tone: 'text-success',         verb: 'joined' }
    case 'disconnect': return { icon: <LogOut      className="h-3 w-3" />, tone: 'text-destructive/85',  verb: 'left' }
    case 'death':      return { icon: <Skull       className="h-3 w-3" />, tone: 'text-warning',         verb: 'died' }
    case 'pvp_kill':   return { icon: <Sword       className="h-3 w-3" />, tone: 'text-warning',         verb: 'killed' }
    case 'ban':        return { icon: <ShieldAlert className="h-3 w-3" />, tone: 'text-destructive',     verb: 'banned' }
    case 'kick':       return { icon: <AlertCircle className="h-3 w-3" />, tone: 'text-warning',         verb: 'kicked' }
    default:           return { icon: <Activity    className="h-3 w-3" />, tone: 'text-muted-foreground', verb: action.replace(/_/g, ' ').toLowerCase() }
  }
}

/** Connection LED row. */
export function ConnLine({
  label, state, value, hint,
}: { label: string; state: 'on' | 'off' | 'wait'; value?: string; hint?: string }) {
  const dot =
    state === 'on'   ? 'bg-success'
  : state === 'wait' ? 'bg-warning'
                     : 'bg-destructive/70'
  const valueTone =
    state === 'on'   ? 'text-success/75'
  : state === 'wait' ? 'text-warning/80'
                     : 'text-destructive/80'
  return (
    <div className="flex min-w-0 items-center gap-2.5 py-1.5">
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', dot)} aria-hidden="true" />
      <span className="shrink-0 font-mono text-[11px] font-medium text-foreground/70">{label}</span>
      <span className={cn('min-w-0 flex-1 truncate text-right font-mono text-[11px] tabular-nums', valueTone)}>
        {value ?? (state === 'on' ? 'connected' : state === 'wait' ? 'pending' : 'offline')}
      </span>
      {hint && <span className="shrink-0 font-mono text-[10px] text-muted-foreground/50">{hint}</span>}
    </div>
  )
}
