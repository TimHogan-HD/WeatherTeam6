import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api.js'
import type { CreateLocationInput, Location, UpdateLocationInput } from '@weatherteam6/types'
import { getToken } from '../lib/authToken.js'
import { rememberLocations, rememberedLocations } from '../lib/rememberedLocations.js'

export const locationKeys = {
  all: ['locations'] as const,
  one: (id: string) => ['location', id] as const,
}

/** A cold open draws the list this device last saw while the real one loads. */
export function useLocations(): UseQueryResult<Location[]> {
  return useQuery({
    queryKey: locationKeys.all,
    queryFn: async () => {
      const token = getToken()
      const list = await apiGet<Location[]>('/locations')
      // A sign-out while this was in flight has already forgotten the list;
      // writing it back would hand it to the next person to sign in.
      if (getToken() === token) rememberLocations(list)
      return list
    },
    placeholderData: rememberedLocations,
  })
}

/**
 * **Seeded from the list**, which is the same row from the same mapper
 * (`GET /locations` and `GET /locations/:id` both return `mapLocation`). The
 * crag screen used to draw only a skeleton until its own copy arrived, and its
 * conditions, walls and guidebook calls waited on `is_climbing_location` from
 * that copy. The seed carries the list's own fetch time, so it is as fresh as
 * the list and refetches by the usual `staleTime`.
 */
export function useLocation(id: string | undefined): UseQueryResult<Location> {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: locationKeys.one(id ?? ''),
    queryFn: () => apiGet<Location>(`/locations/${id ?? ''}`),
    enabled: id !== undefined && id !== '',
    initialData: () =>
      queryClient.getQueryData<Location[]>(locationKeys.all)?.find((l) => l.id === id),
    initialDataUpdatedAt: () => queryClient.getQueryState(locationKeys.all)?.dataUpdatedAt,
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

/** The query roots, keyed by location id, whose answers depend on the rock type. */
const READS_THE_ROCK = new Set(['forecast', 'conditions', 'hourly'])

/**
 * `PATCH /locations/:id` answers with the whole updated row, so the crag
 * screen is handed it directly. The list is refetched rather than patched in
 * place: it is the same `mapLocation` row, and one source of truth for its
 * order is the server's.
 *
 * **Everything that reads the rock is invalidated too**, because a new rock
 * type moves the drying clock: forecast scores, conditions and the hourly
 * readings (`READS_THE_ROCK`). Alerts, walls and the guidebook do not depend on it.
 */
export function useUpdateLocation(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdateLocationInput) => apiPatch<Location>(`/locations/${id}`, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(locationKeys.one(id), updated)
      void queryClient.invalidateQueries({ queryKey: locationKeys.all })
      void queryClient.invalidateQueries({
        predicate: (q) => q.queryKey[1] === id && READS_THE_ROCK.has(String(q.queryKey[0])),
      })
    },
  })
}

/**
 * Unsave. A save flow without this is a trap — one mistyped search result would
 * be permanent.
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
