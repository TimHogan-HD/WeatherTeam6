import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { apiGet } from '../lib/api.js'
import type { ConditionsScore, ForecastSnapshot, WeatherAlert } from '@weatherteam6/types'

export function useForecast(id: string | undefined): UseQueryResult<ForecastSnapshot[]> {
  return useQuery({
    queryKey: ['forecast', id ?? ''] as const,
    queryFn: () => apiGet<ForecastSnapshot[]>(`/forecast/${id ?? ''}`),
    enabled: id !== undefined && id !== '',
  })
}

/**
 * Today's conditions — **the v2 readings, and the legacy score they replaced.**
 *
 * **Only ever enabled for a climbing location.** Neither model branches on
 * `is_climbing_location`, so this endpoint will happily answer for a city; the
 * client's job is not to ask (§3). Skipping it also drops the upstream fetches,
 * so general weather locations load noticeably faster.
 *
 * The result is `ConditionsScore | null`: a **200 with `data: null`** is the
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
): UseQueryResult<ConditionsScore | null> {
  return useQuery({
    queryKey: ['conditions', id ?? ''] as const,
    queryFn: () => apiGet<ConditionsScore | null>(`/conditions/${id ?? ''}`),
    enabled: id !== undefined && id !== '' && isClimbingLocation === true,
  })
}

export function useAlerts(id: string | undefined): UseQueryResult<WeatherAlert[]> {
  return useQuery({
    queryKey: ['alerts', id ?? ''] as const,
    queryFn: () => apiGet<WeatherAlert[]>(`/alerts/${id ?? ''}`),
    enabled: id !== undefined && id !== '',
  })
}

export type PreviewTarget = {
  lat: number
  lon: number
  /** The geocoder's elevation, or null on the hand-entered-coordinates path. */
  elevationM: number | null
}

/**
 * Weather for a place that has no row and no UUID yet — step 2 of the add flow.
 *
 * The same windowed `ForecastSnapshot[]` shape as `/forecast/:id`, so preview
 * and saved detail render through one code path. Passing `elevation` here and
 * persisting the same value on save is what keeps the two agreeing on
 * temperature; without it the lapse-rate correction is skipped on one side only
 * and the same place reads ~10 °F apart before and after Save (§12.3).
 */
export function usePreview(target: PreviewTarget | null): UseQueryResult<ForecastSnapshot[]> {
  return useQuery({
    queryKey: ['preview', target?.lat ?? null, target?.lon ?? null, target?.elevationM ?? null] as const,
    queryFn: () => {
      if (target === null) throw new Error('usePreview called with no target')
      const params: Record<string, string | number> = { lat: target.lat, lon: target.lon }
      if (target.elevationM !== null) params['elevation'] = target.elevationM
      return apiGet<ForecastSnapshot[]>('/preview', params)
    },
    enabled: target !== null,
  })
}
