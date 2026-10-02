import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { CreateTripInput, Trip, TripOutlook, TripTrend } from '@weatherteam6/types'
import { apiDelete, apiGet, apiPost } from '../lib/api.js'

export const tripKeys = {
  all: ['trips'] as const,
  one: (id: string) => ['trip', id] as const,
  forecast: (id: string) => ['trip-forecast', id] as const,
  trend: (id: string) => ['trip-trend', id] as const,
}

export function useTrips(): UseQueryResult<Trip[]> {
  return useQuery({ queryKey: tripKeys.all, queryFn: () => apiGet<Trip[]>('/trips') })
}

/** Seeded from the list, the same `mapTrip` row, so a trip opens on its name at once. */
export function useTrip(id: string | undefined): UseQueryResult<Trip> {
  const queryClient = useQueryClient()
  return useQuery({
    queryKey: tripKeys.one(id ?? ''),
    queryFn: () => apiGet<Trip>(`/trips/${id ?? ''}`),
    enabled: id !== undefined && id !== '',
    initialData: () => queryClient.getQueryData<Trip[]>(tripKeys.all)?.find((t) => t.id === id),
    initialDataUpdatedAt: () => queryClient.getQueryState(tripKeys.all)?.dataUpdatedAt,
  })
}

/** The 16-day outlook per trip location: weather only, never a score. */
export function useTripForecast(id: string | undefined): UseQueryResult<TripOutlook[]> {
  return useQuery({
    queryKey: tripKeys.forecast(id ?? ''),
    queryFn: () => apiGet<TripOutlook[]>(`/trips/${id ?? ''}/forecast`),
    enabled: id !== undefined && id !== '',
  })
}

/** The recorded rain totals and highs per trip location, oldest first. */
export function useTripTrend(id: string | undefined): UseQueryResult<TripTrend[]> {
  return useQuery({
    queryKey: tripKeys.trend(id ?? ''),
    queryFn: () => apiGet<TripTrend[]>(`/trips/${id ?? ''}/trend`),
    enabled: id !== undefined && id !== '',
  })
}

export function useCreateTrip() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTripInput) => apiPost<Trip>('/trips', input),
    onSuccess: (created) => {
      queryClient.setQueryData(tripKeys.one(created.id), created)
      void queryClient.invalidateQueries({ queryKey: tripKeys.all })
    },
  })
}

export function useDeleteTrip() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/trips/${id}`),
    onSuccess: (_data, id) => {
      for (const key of [tripKeys.one(id), tripKeys.forecast(id), tripKeys.trend(id)]) {
        queryClient.removeQueries({ queryKey: key })
      }
      void queryClient.invalidateQueries({ queryKey: tripKeys.all })
    },
  })
}
