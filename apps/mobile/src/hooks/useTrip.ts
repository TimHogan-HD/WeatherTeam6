import { useQuery } from '@tanstack/react-query'
import type { Trip } from '@weatherteam6/types'
import { apiFetch } from '../lib/api'

export function useTrip(id: string) {
  return useQuery({
    queryKey: ['trip', id],
    queryFn: async () => (await apiFetch<Trip>(`/trips/${id}`) ?? null),
    enabled: !!id,
  })
}
