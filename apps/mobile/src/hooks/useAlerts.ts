import { useQuery } from '@tanstack/react-query'
import type { WeatherAlert } from '@weatherteam6/types'
import { apiFetch } from '../lib/api'

export function useAlerts(locationId: string | undefined) {
  return useQuery({
    queryKey: ['alerts', locationId],
    queryFn: async () => (await apiFetch<WeatherAlert[]>(`/alerts/${locationId}`)) ?? [],
    enabled: Boolean(locationId),
    staleTime: 5 * 60 * 1000,
  })
}
