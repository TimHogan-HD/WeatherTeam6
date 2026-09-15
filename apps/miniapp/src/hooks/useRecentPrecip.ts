import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { RecentPrecip } from '@weatherteam6/types'
import { apiGet } from '../lib/api.js'

/**
 * Hourly rainfall over the days just past — the record behind the drying
 * model's "climbable in ~10h".
 *
 * **Its own query, not a field on another one.** It costs an upstream call, and
 * the detail screen's rule is that a section's fetch cannot delay the rest of
 * the page. A reader who wants the seven-day forecast should not wait on a
 * five-day rain history to render it.
 *
 * **Saved climbing locations only.** Like `useHourly`, the endpoint reads a
 * location row for its coordinates, so the `/add` preview has nothing to ask
 * about; and like `useConditions`, the gate is `is_climbing_location` —
 * the only surface that draws this is the drying card, a city has no drying
 * story (§3), and an upstream call nothing renders is a wasted round trip.
 * `undefined` while the location query is in flight holds the fetch rather
 * than guessing, which is why the parameter is not a plain boolean.
 */
export function useRecentPrecip(
  id: string | undefined,
  isClimbingLocation: boolean | undefined,
): UseQueryResult<RecentPrecip> {
  return useQuery({
    queryKey: ['recent-precip', id ?? ''] as const,
    queryFn: () => apiGet<RecentPrecip>(`/recent-precip/${id ?? ''}`),
    enabled: id !== undefined && id !== '' && isClimbingLocation === true,
  })
}
