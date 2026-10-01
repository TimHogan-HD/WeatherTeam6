import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { HourlySeries } from '@weatherteam6/types'
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
 */
export const hourlyQuery = (id: string | undefined) =>
  queryOptions({
    queryKey: ['hourly', id ?? ''] as const,
    queryFn: () => apiGet<HourlySeries>(`/hourly/${id ?? ''}`),
    enabled: id !== undefined && id !== '',
  })

export function useHourly(id: string | undefined): UseQueryResult<HourlySeries> {
  return useQuery(hourlyQuery(id))
}
