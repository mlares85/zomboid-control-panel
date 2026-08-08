import { AlertCircle } from 'lucide-react'

export function StatChip({
  icon,
  value,
  label,
  ok,
}: {
  icon: React.ReactNode
  value: string | number
  label: string
  ok?: boolean
}) {
  const numericValue = typeof value === 'number' ? value : Number(value)
  const isZero = !Number.isNaN(numericValue) && numericValue === 0
  const muted = isZero || ok === false
  return (
    <span
      className={`inline-flex items-center gap-1.5 normal-case tracking-normal ${muted ? 'opacity-55' : ''}`}
      title={ok === false ? `${label}: file not found` : undefined}
    >
      <span className={muted ? 'text-muted-foreground/50' : 'text-primary/70'}>{icon}</span>
      <span className={`font-mono text-sm font-semibold tabular-nums ${muted ? 'text-muted-foreground' : 'text-foreground'}`}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
      {ok === false && (
        <AlertCircle className="h-3 w-3 text-warning" aria-label="Not found" />
      )}
    </span>
  )
}
