import { useEffect, useState } from 'react'
import { useMutation, useQuery, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query'
import { apiGet } from '../lib/api.js'
import type { ClimbingAreaLevel, ClimbingStateSummary, GeocodeResult, ReverseGeocode } from '@weatherteam6/types'
import type { Fix } from './useCurrentPosition.js'

/** The API answers a shorter query with an empty 200, so don't spend the round trip. */
const MIN_QUERY_LENGTH = 2

const DEBOUNCE_MS = 300

export function useDebouncedValue<T>(value: T, delayMs: number = DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}

/**
 * Place-name search for the add flow. Proxied through the API — the client
 * never calls Open-Meteo's geocoder directly, or it would bypass the shared
 * retry policy and the `{ data, error, status }` contract both.
 */
export function useGeocode(query: string): UseQueryResult<GeocodeResult[]> {
  const trimmed = query.trim()
  return useQuery({
    queryKey: ['geocode', trimmed] as const,
    queryFn: () => apiGet<GeocodeResult[]>('/geocode', { q: trimmed }),
    enabled: trimmed.length >= MIN_QUERY_LENGTH,
  })
}

/**
 * Name and elevation for a GPS fix, looked up once per tap. A mutation rather
 * than a query: it is an action the reader started, and `reset()` on Cancel or
 * Back means a late answer cannot open the save form behind them.
 */
export function useReverseGeocode(): UseMutationResult<ReverseGeocode, Error, Fix> {
  return useMutation({
    mutationFn: (fix: Fix) => apiGet<ReverseGeocode>('/geocode/reverse', { lat: fix.lat, lon: fix.lon }),
  })
}

/** The states `/add` can browse. Snapshot data that changes only on a deploy, so never refetched. */
export function useClimbingStates(): UseQueryResult<ClimbingStateSummary[]> {
  return useQuery({
    queryKey: ['climbing-areas'] as const,
    queryFn: () => apiGet<ClimbingStateSummary[]>('/climbing-areas'),
    staleTime: Infinity,
  })
}

/** One level of a state's tree; `areaId` null is the state's top level. */
export function useClimbingAreaLevel(state: string, areaId: string | null): UseQueryResult<ClimbingAreaLevel> {
  const path = areaId === null ? state : `${state}/${areaId}`
  return useQuery({
    queryKey: ['climbing-areas', state, areaId] as const,
    queryFn: () => apiGet<ClimbingAreaLevel>(`/climbing-areas/${path}`),
    staleTime: Infinity,
  })
}
