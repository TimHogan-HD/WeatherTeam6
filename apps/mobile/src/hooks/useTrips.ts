import { useQuery } from '@tanstack/react-query'
import type { Trip } from '@weatherteam6/types'
import { apiFetch } from '../lib/api'

export function useTrips() {
  return useQuery({
    queryKey: ['trips'],
    queryFn: async () => (await apiFetch<Trip[]>('/trips')) ?? [],
  })
}
