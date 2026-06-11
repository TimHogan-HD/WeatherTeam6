import { useQuery } from '@tanstack/react-query'
import type { Location } from '@weatherteam6/types'
import { apiFetch } from '../lib/api'

export function useLocations() {
  return useQuery({
    queryKey: ['locations'],
    queryFn: async () => (await apiFetch<Location[]>('/locations')) ?? [],
  })
}
