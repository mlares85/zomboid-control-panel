import { cn } from '@/lib/utils'

// Shared "tactical panel" chrome for the Events page — extracted out of
// Events.tsx so new sections (e.g. CurrentConditionsCard) can reuse the
// same look without growing that already-oversized file further.
export type PanelTone = 'primary' | 'warning' | 'destructive' | 'info' | 'success'

export function toneBorder(tone: PanelTone): string {
  switch (tone) {
    case 'warning': return 'border-amber-400/55'
    case 'destructive': return 'border-destructive/55'
    case 'info': return 'border-info/55'
    case 'success': return 'border-emerald-400/55'
    default: return 'border-primary/55'
  }
}

export function toneText(tone: PanelTone): string {
  switch (tone) {
    case 'warning': return 'text-amber-400/85'
    case 'destructive': return 'text-destructive/85'
    case 'info': return 'text-info/85'
    case 'success': return 'text-emerald-400/85'
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
      'self-start overflow-hidden rounded-md border bg-card shadow-sm flex flex-col',
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
  sublabel?: string
  icon?: React.ComponentType<{ className?: string }>
  action?: React.ReactNode
  tone?: PanelTone
}) {
  const isBridgeOffline = sublabel?.startsWith('bridge offline')
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3 select-none">
      <span className="flex min-w-0 items-center gap-2">
        {Icon && <Icon className={cn('h-4 w-4 shrink-0', toneText(tone))} />}
        <span className="truncate text-sm font-semibold text-foreground">{label}</span>
        {sublabel && (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="text-muted-foreground/35">/</span>
            <span className={cn(
              'truncate text-xs font-normal',
              isBridgeOffline ? 'text-amber-400/70' : 'text-muted-foreground/65'
            )}>{sublabel}</span>
          </span>
        )}
      </span>
      {action && <div className="flex items-center gap-1.5 shrink-0">{action}</div>}
    </div>
  )
}
