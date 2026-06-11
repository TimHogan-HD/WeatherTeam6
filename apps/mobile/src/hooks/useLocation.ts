import { useQuery } from '@tanstack/react-query'
import type { Location } from '@weatherteam6/types'
import { apiFetch } from '../lib/api'

export function useLocation(locationId: string | undefined) {
  return useQuery({
    queryKey: ['location', locationId],
    queryFn: () => apiFetch<Location>(`/locations/${locationId}`),
    enabled: !!locationId,
  })
}
