import { useQuery } from '@tanstack/react-query'
import type { ConditionsScore } from '@weatherteam6/types'
import { apiFetch } from '../lib/api'

export function useConditions(locationId: string | undefined) {
  return useQuery({
    queryKey: ['conditions', locationId],
    queryFn: () => apiFetch<ConditionsScore | null>(`/conditions/${locationId}`),
    enabled: !!locationId,
  })
}
