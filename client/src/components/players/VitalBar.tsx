import type { ReactNode } from 'react'
import { VITAL_TONE_COLOR, type VitalTone } from '@/lib/playerVitals'

interface VitalBarProps {
  icon: ReactNode
  label: string
  percent: number
  tone: VitalTone
}

/** One labeled meter row — health/hunger/thirst/fatigue all share this shape. */
export function VitalBar({ icon, label, percent, tone }: VitalBarProps) {
  const rounded = Math.round(percent)
  return (
    <div className="flex items-center gap-3">
      <div className="flex w-24 shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div
        className="h-2 flex-1 overflow-hidden rounded-sm bg-muted/60 ring-1 ring-border/40"
        role="progressbar"
        aria-label={label}
        aria-valuenow={rounded}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-sm transition-all"
          style={{ width: `${percent}%`, backgroundColor: VITAL_TONE_COLOR[tone] }}
        />
      </div>
      <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-foreground/85">
        {rounded}%
      </span>
    </div>
  )
}
