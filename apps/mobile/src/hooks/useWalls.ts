import { useQuery } from '@tanstack/react-query'
import type { Wall } from '@weatherteam6/types'
import { apiFetch } from '../lib/api'

export function useWalls(locationId: string) {
  return useQuery({
    queryKey: ['walls', locationId],
    queryFn: async () => (await apiFetch<Wall[]>(`/walls/${locationId}`)) ?? [],
    enabled: !!locationId,
  })
}
