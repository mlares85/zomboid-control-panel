import { lazy, Suspense } from 'react'
import type { PerformancePoint } from './types'

const DashboardPerformanceCharts = lazy(() => import('@/components/DashboardPerformanceCharts'))

interface Props {
  history: PerformancePoint[]
  online: boolean
  showCharts: boolean
  maxMemoryGB: number | undefined
}

function ChartSkeleton() {
  return (
    <div className="space-y-2 p-3">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-2 py-1">
          <div className="h-2.5 w-16 rounded bg-muted/40" />
          <div className="h-5 flex-1 animate-pulse rounded bg-muted/30" />
          <div className="h-4 w-10 rounded bg-muted/40" />
        </div>
      ))}
    </div>
  )
}

function timeSpanLabel(history: PerformancePoint[], online: boolean): string {
  if (history.length === 0) return online ? 'sampling' : 'standby'
  if (history.length < 2) return 'live'
  const first = history[0].timestamp
  const last = history[history.length - 1].timestamp
  if (first && last) {
    const spanSec = (new Date(last).getTime() - new Date(first).getTime()) / 1000
    if (spanSec < 120) return `last ${Math.round(spanSec)}s · live`
    return `last ${Math.round(spanSec / 60)} min · live`
  }
  return 'live'
}

export function TelemetrySection({ history, online, showCharts, maxMemoryGB }: Props) {
  return (
    <section className="order-1 overflow-hidden rounded-lg border border-border/65 bg-card/50 shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-border/35 px-4 py-2">
        <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/75">Server telemetry</h2>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/60">
          {timeSpanLabel(history, online)}
        </span>
      </header>
      {history.length > 0 ? (
        <Suspense fallback={<ChartSkeleton />}>
          {showCharts ? (
            <DashboardPerformanceCharts
              performanceHistory={history}
              serverRunning={online}
              maxMemoryGB={maxMemoryGB}
            />
          ) : null}
        </Suspense>
      ) : (
        <p className="px-3 py-3 text-xs text-muted-foreground/80">
          {online
            ? 'Telemetry will appear within the next sample cycle.'
            : 'Start the server to track CPU, RAM, and player metrics.'}
        </p>
      )}
    </section>
  )
}
