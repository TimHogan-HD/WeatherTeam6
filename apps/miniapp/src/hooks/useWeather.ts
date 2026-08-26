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
 * Today's conditions score.
 *
 * **Only ever enabled for a climbing location.** `computeLiveForecast` does not
 * branch on `is_climbing_location`, so this endpoint will happily return a
 * rock-drying score for a city; the client's job is not to ask (§3). Skipping
 * it also drops two of the three upstream fetches, so general weather locations
 * load noticeably faster.
 *
 * The result is `ConditionsScore | null`: a **200 with `data: null`** is the
 * documented answer when no computed row matches today's date, which is
 * reachable whenever the forecast feed starts at tomorrow (§5). Callers must
 * guard on null before reading `.score`.
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
