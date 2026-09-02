import { useQuery } from '@tanstack/react-query'
import { panelBridgeApi } from '@/lib/api'

export interface WorldStatsData {
  zombieCount: number
  zombieCountNote: string
  serverName: string
  map: string
  day: number
  month: number
  year: number
  hour: number
  minute: number
  worldAgeHours: number
  nightsSurvived: number
}

// Combines three PanelBridge reads into the one shape the dashboard card
// needs. A single Promise.all (not allSettled) is deliberate: if any one of
// these fails the whole card should show its error state, not silently
// display two-thirds of a stat panel as if it were complete.
async function fetchWorldStats(): Promise<WorldStatsData> {
  const [zombies, world, time] = await Promise.all([
    panelBridgeApi.getZombieCount(),
    panelBridgeApi.getWorldStats(),
    panelBridgeApi.getGameTime(),
  ])
  return {
    zombieCount: zombies.data.zombieCount,
    zombieCountNote: zombies.data.note,
    serverName: world.data.serverName,
    map: world.data.map,
    day: time.data.day,
    month: time.data.month,
    year: time.data.year,
    hour: Math.floor(time.data.hour),
    minute: time.data.minute,
    worldAgeHours: time.data.worldAgeHours,
    nightsSurvived: time.data.nightsSurvived,
  }
}

const REFRESH_INTERVAL_MS = 30_000

/** Zombie count + world/time stats for the dashboard, polled every 30s while enabled. */
export function useWorldStats(enabled: boolean) {
  return useQuery({
    queryKey: ['dashboard', 'world-stats'],
    queryFn: fetchWorldStats,
    enabled,
    refetchInterval: enabled ? REFRESH_INTERVAL_MS : false,
  })
}
