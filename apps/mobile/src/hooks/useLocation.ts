import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { Location } from '@weatherteam6/types'
import { apiFetch } from '../lib/api'

export function useLocation(locationId: string | undefined) {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: ['location', locationId],
    queryFn: () => apiFetch<Location>(`/locations/${locationId}`),
    enabled: !!locationId,
    // Seed from the home screen's cached list so the title renders instantly
    // (and survives offline) while the per-location fetch refreshes in the background.
    placeholderData: () =>
      queryClient
        .getQueryData<Location[]>(['locations'])
        ?.find((loc) => loc.id === locationId),
  })
}
