import { useQuery } from '@tanstack/react-query'
import { panelBridgeApi, type PlayerVitalsDetail } from '@/lib/api'

// Live vitals change fast in-game (bleeding, hunger ticking down) but don't
// need sub-10s precision for an admin dossier — 12s balances freshness
// against hammering the bridge's file-based command queue.
const VITALS_REFRESH_MS = 12000

/**
 * Polls live vitals (health/hunger/thirst/fatigue/bleeding) for one player.
 * Disabled when no username is selected, so the dossier's empty state
 * doesn't fire requests for an empty target.
 */
export function usePlayerVitals(username: string) {
  return useQuery({
    queryKey: ['player-vitals', username],
    queryFn: () => panelBridgeApi.getPlayerDetails(username),
    select: (res): PlayerVitalsDetail | null => res.data ?? null,
    enabled: username.length > 0,
    refetchInterval: VITALS_REFRESH_MS,
    staleTime: 5000,
    retry: 1,
  })
}
