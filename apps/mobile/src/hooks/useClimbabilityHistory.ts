import { useQuery } from '@tanstack/react-query'
import type { ClimbabilityHistory } from '@weatherteam6/types'
import { apiFetch } from '../lib/api'

export function useClimbabilityHistory(locationId: string | undefined) {
  return useQuery({
    queryKey: ['climbabilityHistory', locationId],
    queryFn: () => apiFetch<ClimbabilityHistory[]>(`/locations/${locationId}/history`),
    enabled: !!locationId,
    staleTime: 24 * 60 * 60 * 1000,
  })
}
