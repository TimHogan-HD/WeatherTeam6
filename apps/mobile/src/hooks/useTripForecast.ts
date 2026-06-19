import { useQuery } from '@tanstack/react-query'
import type { TripForecast } from '@weatherteam6/types'
import { apiFetch } from '../lib/api'

export function useTripForecast(id: string) {
  return useQuery({
    queryKey: ['trip-forecast', id],
    queryFn: async () => (await apiFetch<TripForecast[]>(`/trips/${id}/forecast`)) ?? [],
    enabled: !!id,
  })
}
