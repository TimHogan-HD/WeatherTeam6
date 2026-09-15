import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { HourlySeries } from '@weatherteam6/types'
import { apiGet } from '../lib/api.js'

/**
 * The hourly series behind the charts.
 *
 * **Saved locations only.** The endpoint reads a stored run for a location row;
 * the add flow's preview has no row and no id, and `GET /preview` returns daily
 * snapshots without hours.
 *
 * `?models=all` is deliberately not requested. It costs 3.8x the payload for
 * five more deterministic models, and nothing here draws them — the charts read
 * the pooled ensemble. The parameter exists so a model switcher needs no API
 * change when Phase 3 builds one.
 */
export function useHourly(id: string | undefined): UseQueryResult<HourlySeries> {
  return useQuery({
    queryKey: ['hourly', id ?? ''] as const,
    queryFn: () => apiGet<HourlySeries>(`/hourly/${id ?? ''}`),
    enabled: id !== undefined && id !== '',
  })
}
