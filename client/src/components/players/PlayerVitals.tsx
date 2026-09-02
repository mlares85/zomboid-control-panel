import { AlertTriangle, Droplet, Droplets, GlassWater, Heart, Loader2, Moon, RefreshCw, Thermometer, Utensils } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { usePlayerVitals } from '@/hooks/usePlayerVitals'
import { normalizeToPercent, toneForHealth, toneForNeed } from '@/lib/playerVitals'
import { VitalBar } from './VitalBar'

interface PlayerVitalsProps {
  username: string
}

/** Live health/hunger/thirst/fatigue/bleeding readout for the selected player, polling every ~12s. */
export function PlayerVitals({ username }: PlayerVitalsProps) {
  const { data: player, isLoading, isError, error, refetch, isFetching } = usePlayerVitals(username)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/[0.04] px-4 py-6 text-center">
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <p className="text-sm text-muted-foreground">
          {error instanceof Error ? error.message : 'Failed to load live vitals.'}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </Button>
      </div>
    )
  }

  const health = normalizeToPercent(player?.health?.overallBodyHealth)
  const hunger = normalizeToPercent(player?.stats?.hunger)
  const thirst = normalizeToPercent(player?.stats?.thirst)
  const fatigue = normalizeToPercent(player?.stats?.fatigue)
  const isBleeding = player?.health?.isBleeding === true
  const isInfected = player?.health?.isInfected === true
  const temperature = player?.health?.temperature
  const wetness = normalizeToPercent(player?.health?.wetness)
  const noVitals = health === null && hunger === null && thirst === null && fatigue === null

  if (!player || noVitals) {
    return (
      <p className="rounded-lg border border-dashed border-border/50 bg-muted/10 px-4 py-6 text-center text-sm text-muted-foreground">
        Live vitals aren't available — {username} must be online and in-world.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isBleeding && (
            <Badge variant="outline" className="gap-1 border-destructive/45 bg-destructive/10 text-destructive">
              <Droplet className="h-3 w-3" /> Bleeding
            </Badge>
          )}
          {isInfected && (
            <Badge variant="outline" className="gap-1 border-destructive/45 bg-destructive/10 text-destructive">
              Infected
            </Badge>
          )}
        </div>
        {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-label="Refreshing vitals" />}
      </div>

      <div className="space-y-2.5">
        {health !== null && <VitalBar icon={<Heart className="h-3.5 w-3.5" />} label="Health" percent={health} tone={toneForHealth(health)} />}
        {hunger !== null && <VitalBar icon={<Utensils className="h-3.5 w-3.5" />} label="Hunger" percent={hunger} tone={toneForNeed(hunger)} />}
        {thirst !== null && <VitalBar icon={<GlassWater className="h-3.5 w-3.5" />} label="Thirst" percent={thirst} tone={toneForNeed(thirst)} />}
        {fatigue !== null && <VitalBar icon={<Moon className="h-3.5 w-3.5" />} label="Fatigue" percent={fatigue} tone={toneForNeed(fatigue)} />}
        {wetness !== null && <VitalBar icon={<Droplets className="h-3.5 w-3.5" />} label="Wetness" percent={wetness} tone={toneForNeed(wetness)} />}
      </div>

      {typeof temperature === 'number' && (
        <div
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
          title="Raw in-game body temperature reading — not a direct Celsius/Fahrenheit value."
        >
          <Thermometer className="h-3.5 w-3.5" />
          <span>Body temperature (raw): <span className="font-mono text-foreground/85">{temperature.toFixed(1)}</span></span>
        </div>
      )}
    </div>
  )
}
