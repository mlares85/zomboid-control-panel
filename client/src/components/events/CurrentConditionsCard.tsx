import { Thermometer, Wind, CloudRain, Eye, Droplets, Cloud, CloudLightning, Snowflake, Loader2, AlertTriangle } from 'lucide-react'
import { TacticalPanel, SectionHeader } from '@/components/events/panels'
import { useWeatherConditions } from '@/hooks/useWeatherConditions'
import { cn } from '@/lib/utils'

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

function compassFromDegrees(degrees: number | undefined): string {
  if (degrees == null) return '—'
  const index = Math.round(((degrees % 360) + 360) % 360 / 45) % COMPASS_POINTS.length
  return COMPASS_POINTS[index]
}

function pct(value: number | undefined): string {
  if (value == null) return '—'
  return `${Math.round(value * 100)}%`
}

function StatTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  tone?: 'active' | 'idle'
}) {
  return (
    <div className="space-y-0.5">
      <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Icon className={cn('h-3 w-3', tone === 'active' && 'text-info')} />
        {label}
      </p>
      <p className={cn('text-sm font-medium', tone === 'active' ? 'text-info' : 'text-foreground')}>{value}</p>
    </div>
  )
}

// Live weather readout shown above the Events page weather controls. Reads
// through PanelBridge (ClimateManager), so it only renders while the bridge
// is connected — there's nothing to poll otherwise.
export function CurrentConditionsCard({ enabled }: { enabled: boolean }) {
  const { data, isLoading, isError } = useWeatherConditions(enabled)

  if (!enabled) return null

  return (
    <TacticalPanel tone="info" className="mb-4">
      <SectionHeader label="Current Conditions" sublabel="bridge · live · refreshes every 30s" icon={Thermometer} tone="info" />
      <div className="p-4">
        {isLoading && !data && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Reading current weather…
          </div>
        )}
        {isError && !data && (
          <div className="flex items-center gap-2 text-sm text-amber-400/85">
            <AlertTriangle className="h-3.5 w-3.5" />
            Could not read current weather from the bridge.
          </div>
        )}
        {data && (
          <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
            <StatTile icon={Thermometer} label="Temperature" value={`${Math.round(data.temperature ?? 0)}°C`} />
            <StatTile
              icon={Wind}
              label="Wind"
              value={`${Math.round(data.windSpeed ?? 0)} km/h ${compassFromDegrees(data.windAngle)}`}
            />
            <StatTile icon={CloudRain} label="Rain" value={pct(data.precipitationIntensity)} tone={data.isRaining ? 'active' : 'idle'} />
            <StatTile icon={Eye} label="Fog" value={pct(data.fogIntensity)} />
            <StatTile icon={Cloud} label="Cloud cover" value={pct(data.cloudIntensity)} />
            <StatTile icon={Droplets} label="Humidity" value={pct(data.humidity)} />
            <StatTile icon={Snowflake} label="Snow" value={data.isSnowing ? 'Falling' : 'None'} tone={data.isSnowing ? 'active' : 'idle'} />
            <StatTile
              icon={CloudLightning}
              label="Thunderstorm"
              value={data.isThunderStorming ? 'Active' : 'Clear'}
              tone={data.isThunderStorming ? 'active' : 'idle'}
            />
          </div>
        )}
      </div>
    </TacticalPanel>
  )
}
