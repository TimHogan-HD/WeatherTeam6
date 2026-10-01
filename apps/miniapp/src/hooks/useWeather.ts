import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { apiGet } from '../lib/api.js'
import type { Conditions, ForecastSnapshot, WeatherAlert } from '@weatherteam6/types'

/**
 * The query definitions are exported so a screen that needs several locations'
 * data at once — the list, sorting by score — reads **the same cache entries**
 * the per-card hooks fill, not a second copy under a key that could drift.
 */
export const forecastQuery = (id: string | undefined) =>
  queryOptions({
    queryKey: ['forecast', id ?? ''] as const,
    queryFn: () => apiGet<ForecastSnapshot[]>(`/forecast/${id ?? ''}`),
    enabled: id !== undefined && id !== '',
  })

export function useForecast(id: string | undefined): UseQueryResult<ForecastSnapshot[]> {
  return useQuery(forecastQuery(id))
}

/**
 * Today's conditions — **the v2 readings, and the legacy score they replaced.**
 *
 * **Only ever enabled for a climbing location.** Neither model branches on
 * `is_climbing_location`, so this endpoint will happily answer for a city; the
 * client's job is not to ask (§3). Skipping it also drops the upstream fetches,
 * so general weather locations load noticeably faster.
 *
 * The result is `Conditions | null`: a **200 with `data: null`** is the
 * documented answer when no computed row matches today's date (§5). Callers
 * must guard on null.
 *
 * **`readings` is optional on the response type, and it is deliberately not
 * normalised to null here.** The API and the Mini App deploy separately, so
 * every release that adds a field has a window where the client is new and the
 * response is not. The usual fix is `?? null` at the fetch boundary
 * (architecture rule — it cost a chart its rain whiskers in production), but
 * that is for a field whose absence means the same thing as its null.
 *
 * Here it does not. An absent `readings` means *the server did not send it*; a
 * present one with a named `unavailable_reason` means *the model could not read
 * this spot*. Collapsing the first into the second would print an attribution
 * the data does not support (defect class 3). Leaving it `undefined` makes every
 * caller's branch a compile-time obligation, and the honest rendering for it is
 * nothing at all.
 */
export function useConditions(
  id: string | undefined,
  isClimbingLocation: boolean | undefined,
): UseQueryResult<Conditions | null> {
  return useQuery(conditionsQuery(id, isClimbingLocation))
}

export const conditionsQuery = (id: string | undefined, isClimbingLocation: boolean | undefined) =>
  queryOptions({
    queryKey: ['conditions', id ?? ''] as const,
    queryFn: () => apiGet<Conditions | null>(`/conditions/${id ?? ''}`),
    enabled: id !== undefined && id !== '' && isClimbingLocation === true,
  })

export const alertsQuery = (id: string | undefined) =>
  queryOptions({
    queryKey: ['alerts', id ?? ''] as const,
    queryFn: () => apiGet<WeatherAlert[]>(`/alerts/${id ?? ''}`),
    enabled: id !== undefined && id !== '',
  })

export function useAlerts(id: string | undefined): UseQueryResult<WeatherAlert[]> {
  return useQuery(alertsQuery(id))
}
