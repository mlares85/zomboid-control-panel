import { useQuery } from '@tanstack/react-query'
import { panelBridgeApi, type WeatherConditions } from '@/lib/api'

const WEATHER_REFRESH_MS = 30000

/**
 * Live weather readout for the Events page. Gated by `enabled` (the bridge
 * must be connected — getWeather reads ClimateManager through PanelBridge)
 * so the query doesn't fire, retry, or poll while there's nothing to read.
 */
export function useWeatherConditions(enabled: boolean) {
  return useQuery<WeatherConditions>({
    queryKey: ['panelBridge', 'weather'],
    queryFn: async () => {
      const result = await panelBridgeApi.getWeather()
      if (!result.success) {
        throw new Error('Failed to load current weather conditions')
      }
      return result.data
    },
    enabled,
    refetchInterval: WEATHER_REFRESH_MS,
    staleTime: WEATHER_REFRESH_MS - 5000,
  })
}
