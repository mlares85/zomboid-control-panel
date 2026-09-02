import {
  Skull, Clock, CalendarDays, Hourglass, Moon, Map as MapIcon,
  AlertTriangle, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorldStats } from '@/hooks/dashboard/useWorldStats'
import { formatGameClock, formatGameDate, formatWorldAge } from '@/lib/worldStatsFormat'
import type { WorldStatsData } from '@/hooks/dashboard/useWorldStats'

interface Props {
  /** PanelBridge mod connection — the game process being up isn't enough. */
  bridgeConnected: boolean
}

/**
 * Zombie count and world/time stats. The parent only mounts this while the
 * server is running (see Dashboard.tsx); bridgeConnected additionally gates
 * the query since these reads go over the PanelBridge IPC, not RCON.
 */
export function WorldStats({ bridgeConnected }: Props) {
  const { data, isLoading, isError, isFetching, refetch } = useWorldStats(bridgeConnected)

  return (
    <section className="order-3 overflow-hidden rounded-lg border border-border/65 bg-card/50 shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-border/35 px-4 py-2">
        <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/75">World stats</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/60">
          {bridgeConnected ? (isFetching ? 'refreshing…' : 'live · 30s') : 'bridge offline'}
        </span>
      </header>

      {!bridgeConnected ? (
        <p className="px-3 py-3 text-xs text-muted-foreground/80">
          Waiting for the PanelBridge mod to connect before zombie and world data is available.
        </p>
      ) : isLoading ? (
        <StatsSkeleton />
      ) : isError || !data ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : (
        <StatsGrid data={data} />
      )}
    </section>
  )
}

function StatsGrid({ data }: { data: WorldStatsData }) {
  return (
    <div className="grid grid-cols-2 gap-px bg-border/20 sm:grid-cols-3">
      <StatTile
        icon={<Skull className="h-3.5 w-3.5 text-destructive/70" />}
        label="Zombies"
        value={String(data.zombieCount)}
        hint="loaded cells only"
      />
      <StatTile
        icon={<MapIcon className="h-3.5 w-3.5 text-primary/70" />}
        label="Map"
        value={data.map}
        hint={data.serverName}
      />
      <StatTile
        icon={<CalendarDays className="h-3.5 w-3.5 text-amber-400/70" />}
        label="Date"
        value={formatGameDate(data.month, data.day, data.year)}
      />
      <StatTile
        icon={<Clock className="h-3.5 w-3.5 text-sky-400/70" />}
        label="Time"
        value={formatGameClock(data.hour, data.minute)}
      />
      <StatTile
        icon={<Hourglass className="h-3.5 w-3.5 text-muted-foreground/70" />}
        label="World age"
        value={formatWorldAge(data.worldAgeHours)}
      />
      <StatTile
        icon={<Moon className="h-3.5 w-3.5 text-indigo-400/70" />}
        label="Nights survived"
        value={String(data.nightsSurvived)}
      />
    </div>
  )
}

function StatTile({
  icon, label, value, hint,
}: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 bg-card/50 px-3 py-2.5">
      <span className="flex items-center gap-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60">
        {icon}
        {label}
      </span>
      <span className="truncate text-sm font-medium tabular-nums text-foreground/90" title={value}>
        {value}
      </span>
      {hint && (
        <span className="truncate font-mono text-[10px] text-muted-foreground/50" title={hint}>
          {hint}
        </span>
      )}
    </div>
  )
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-px bg-border/20 sm:grid-cols-3" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map(i => (
        <div key={i} className="flex flex-col gap-2 bg-card/50 px-3 py-2.5">
          <div className="h-2.5 w-16 rounded bg-muted/40" />
          <div className="h-4 w-20 animate-pulse rounded bg-muted/30" />
        </div>
      ))}
    </div>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center gap-2 px-3 py-3">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive/80" aria-hidden="true" />
      <p className="text-xs text-muted-foreground/80">Couldn&apos;t load zombie and world stats.</p>
      <button
        type="button"
        onClick={onRetry}
        className={cn(
          'ml-auto inline-flex items-center gap-1 rounded-sm px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em]',
          'text-muted-foreground/70 transition-colors hover:bg-muted/30 hover:text-foreground',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70',
        )}
      >
        <RefreshCw className="h-3 w-3" /> Retry
      </button>
    </div>
  )
}
