import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPost } from '../lib/api.js'
import type { CreateLocationInput, Location } from '@weatherteam6/types'

export const locationKeys = {
  all: ['locations'] as const,
  one: (id: string) => ['location', id] as const,
}

export function useLocations(): UseQueryResult<Location[]> {
  return useQuery({
    queryKey: locationKeys.all,
    queryFn: () => apiGet<Location[]>('/locations'),
  })
}

export function useLocation(id: string | undefined): UseQueryResult<Location> {
  return useQuery({
    queryKey: locationKeys.one(id ?? ''),
    queryFn: () => apiGet<Location>(`/locations/${id ?? ''}`),
    enabled: id !== undefined && id !== '',
  })
}

/**
 * The created `Location` comes back on the 201 with its new `id`, so the save
 * flow can route straight to `/location/:id` with no follow-up fetch (§2).
 */
export function useCreateLocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateLocationInput) => apiPost<Location>('/locations', input),
    onSuccess: (created) => {
      queryClient.setQueryData(locationKeys.one(created.id), created)
      void queryClient.invalidateQueries({ queryKey: locationKeys.all })
    },
  })
}

/**
 * Unsave. A save flow without this is a trap — one mistyped search result would
 * be permanent, and there is no edit screen either (§12.4).
 */
export function useDeleteLocation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/locations/${id}`),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: locationKeys.one(id) })
      void queryClient.invalidateQueries({ queryKey: locationKeys.all })
    },
  })
}
