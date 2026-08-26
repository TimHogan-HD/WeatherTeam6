import { useEffect, useState } from 'react'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { apiGet } from '../lib/api.js'
import type { GeocodeResult } from '@weatherteam6/types'

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
