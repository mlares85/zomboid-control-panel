import { cn } from '@/lib/utils'

// ──────────────────────────────────────────────────────────────────────────
// Visual primitives — mirror the Events page so the whole control surface
// reads with the same cadence.
// ──────────────────────────────────────────────────────────────────────────
export type PanelTone = 'primary' | 'warning' | 'destructive' | 'info' | 'success' | 'muted'

function toneBorder(tone: PanelTone): string {
  switch (tone) {
    case 'warning': return 'border-amber-400/55'
    case 'destructive': return 'border-destructive/55'
    case 'info': return 'border-sky-400/55'
    case 'success': return 'border-emerald-400/55'
    case 'muted': return 'border-border/70'
    default: return 'border-primary/55'
  }
}

function toneText(tone: PanelTone): string {
  switch (tone) {
    case 'warning': return 'text-amber-400/85'
    case 'destructive': return 'text-destructive/85'
    case 'info': return 'text-sky-400/85'
    case 'success': return 'text-emerald-400/85'
    case 'muted': return 'text-muted-foreground/85'
    default: return 'text-primary/75'
  }
}

export function TacticalPanel({
  children,
  tone = 'primary',
  className,
}: {
  children: React.ReactNode
  tone?: PanelTone
  className?: string
}) {
  return (
    <div className={cn(
      'overflow-hidden rounded-md border bg-card shadow-sm',
      toneBorder(tone),
      className
    )}>
      {children}
    </div>
  )
}

export function SectionHeader({
  label,
  sublabel,
  icon: Icon,
  action,
  tone = 'primary',
}: {
  label: string
  sublabel?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  action?: React.ReactNode
  tone?: PanelTone
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 select-none">
      <span className="flex min-w-0 items-center gap-2">
        {Icon && <Icon className={cn('h-4 w-4 shrink-0', toneText(tone))} />}
        <span className="truncate text-sm font-semibold text-foreground">{label}</span>
        {sublabel && (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="text-muted-foreground/35">/</span>
            <span className="truncate text-xs font-normal text-muted-foreground/65">{sublabel}</span>
          </span>
        )}
      </span>
      {action && <div className="flex items-center gap-1.5 shrink-0">{action}</div>}
    </div>
  )
}
