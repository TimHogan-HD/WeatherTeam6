import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { ClimbHours, HourlySeries } from '@weatherteam6/types'
import { apiGet } from '../lib/api.js'

/**
 * The hourly series behind the charts.
 *
 * **Saved locations only.** The endpoint reads a stored run for a location row.
 *
 * `?models=all` is deliberately not requested. It costs 3.8x the payload for
 * five more deterministic models, and nothing here draws them — the charts read
 * the pooled ensemble. The parameter exists so a model switcher needs no API
 * change when Phase 3 builds one.
 *
 * `climbHours` is a trip's own climbing hours: the day scores read them in
 * place of the reader's Profile hours. They are in the key, so a trip's series
 * and the crag screen's never share a cache entry.
 */
export const hourlyQuery = (id: string | undefined, climbHours?: ClimbHours | null) =>
  queryOptions({
    queryKey: ['hourly', id ?? '', climbHours ? `${climbHours.first}-${climbHours.last}` : 'profile'] as const,
    queryFn: () =>
      apiGet<HourlySeries>(
        `/hourly/${id ?? ''}${climbHours ? `?climbFirst=${climbHours.first}&climbLast=${climbHours.last}` : ''}`,
      ),
    enabled: id !== undefined && id !== '',
  })

export function useHourly(id: string | undefined): UseQueryResult<HourlySeries> {
  return useQuery(hourlyQuery(id))
}
