import { cn } from '@/lib/utils'
import { eventStyle } from './helpers'
import type { PlayerActivity, ServerStatus } from './types'

interface Props {
  activity: PlayerActivity[]
  online: boolean
  status: ServerStatus | null
}

export function LiveActivityFeed({ activity, online, status }: Props) {
  return (
    <section className={cn(
      'order-2 flex flex-col overflow-hidden rounded-lg border border-border/45 bg-card/25',
      activity.length > 0 && 'max-h-[15rem]',
    )}>
      <header className="flex items-center justify-between border-b border-border/30 px-3 py-1.5">
        <h3 className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary/75">Live activity</h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
          {activity.length > 0 ? `${activity.length} events` : online ? 'idle' : 'offline'}
        </span>
      </header>
      {activity.length === 0 ? (
        <div className="flex items-center px-3 py-3">
          <p className="text-xs text-muted-foreground/75">
            {online
              ? 'Listening for player joins, departures, deaths, and moderation events.'
              : status?.configured
                ? 'Start the server to begin tracking player activity.'
                : 'Configure a server to start tracking activity.'}
          </p>
        </div>
      ) : (
        <ol className="min-h-0 divide-y divide-border/15 overflow-y-auto">
          {activity.map(a => {
            const s = eventStyle(a.action)
            return (
              <li key={a.id} className="group grid grid-cols-[3.25rem_1rem_minmax(0,8rem)_minmax(0,1fr)] items-center gap-2 px-3 py-[3px] transition-colors hover:bg-muted/20">
                <time className="font-mono text-[10px] tabular-nums text-muted-foreground/50">
                  {new Date(a.logged_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </time>
                <span className={cn('flex justify-center', s.tone)} aria-hidden="true">{s.icon}</span>
                <span className="truncate text-[11px] font-medium text-foreground/85" dir="auto" title={a.player_name}>
                  {a.player_name}
                </span>
                <span className="truncate text-[11px] text-muted-foreground/55">
                  {s.verb}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
