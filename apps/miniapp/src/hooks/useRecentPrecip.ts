import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { RecentPrecip } from '@weatherteam6/types'
import { apiGet } from '../lib/api.js'

/**
 * Hourly precipitation over the week just past — the Precip tab, and the
 * record behind the drying model's "climbable in ~10h".
 *
 * **Its own query, not a field on another one.** It costs an upstream call, and
 * the detail screen's rule is that a section's fetch cannot delay the rest of
 * the page. A reader who wants the seven-day forecast should not wait on the
 * rain history to render it.
 *
 * **Every saved location, city or crag.** It was gated on
 * `is_climbing_location` while the drying card was its only reader; the Precip
 * tab is on every location, and a city had rain too.
 */
export const recentPrecipQuery = (id: string | undefined) =>
  queryOptions({
    queryKey: ['recent-precip', id ?? ''] as const,
    queryFn: () => apiGet<RecentPrecip>(`/recent-precip/${id ?? ''}`),
    enabled: id !== undefined && id !== '',
  })

export function useRecentPrecip(id: string | undefined): UseQueryResult<RecentPrecip> {
  return useQuery(recentPrecipQuery(id))
}
