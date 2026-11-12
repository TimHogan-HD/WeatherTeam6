import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { apiGet } from '../lib/api.js'
import {
  riverGaugesFor,
  soilStationFor,
  type Conditions,
  type ForecastSnapshot,
  type RadarLayers,
  type RainGaugeReadings,
  type RainNow,
  type RiverGaugeReading,
  type SoilReading,
  type Visit,
  type WeatherAlert,
} from '@weatherteam6/types'

/** IEM builds a radar frame every 5 minutes. */
const RADAR_REFRESH_MS = 5 * 60_000

/** Every Map radar layer's frame times, asked for only while a layer is on, and again every radar frame after. */
export function useRadarLayers(enabled: boolean): UseQueryResult<RadarLayers> {
  return useQuery({
    queryKey: ['radar', 'layers'] as const,
    queryFn: () => apiGet<RadarLayers>('/radar/layers'),
    enabled,
    staleTime: RADAR_REFRESH_MS,
    refetchInterval: enabled ? RADAR_REFRESH_MS : false,
  })
}

/** MRMS publishes a rain-rate frame every 2 minutes; the API reuses one for as long. */
const RAIN_NOW_REFRESH_MS = 2 * 60_000

/**
 * Radar rain rate at every saved place, one query for the list and every
 * Overview (#313). `null` (no recent frame) and an error both say nothing.
 */
export function useRainNow(): UseQueryResult<RainNow | null> {
  return useQuery({
    queryKey: ['rain-now'] as const,
    queryFn: () => apiGet<RainNow | null>('/rain-now'),
    staleTime: RAIN_NOW_REFRESH_MS,
    refetchInterval: RAIN_NOW_REFRESH_MS,
  })
}

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

/**
 * The river gauges of a crag that has any (`RIVER_GAUGES`), with the last day
 * of gage height. Asked only for such a crag, so no other screen makes the
 * request. Refetched every 15 minutes, the gauge's own interval.
 */
export const riverGaugesQuery = (id: string | undefined, knownCrag: string | null | undefined) =>
  queryOptions({
    queryKey: ['river-gauges', id ?? ''] as const,
    queryFn: () => apiGet<RiverGaugeReading[]>(`/river-gauges/${id ?? ''}`),
    enabled: id !== undefined && id !== '' && riverGaugesFor(knownCrag).length > 0,
    refetchInterval: 15 * 60_000,
  })

export function useRiverGauges(
  id: string | undefined,
  knownCrag: string | null | undefined,
): UseQueryResult<RiverGaugeReading[]> {
  return useQuery(riverGaugesQuery(id, knownCrag))
}

/**
 * The rain gauges near a place over its last six complete days (#479), for
 * the Precip tab. Asked only while that tab is open (`enabled`), because each
 * answer costs up to seven IEM requests; kept an hour, since an airport day
 * only closes at midnight and a volunteer reads once a day.
 */
export const rainGaugesQuery = (id: string | undefined, enabled: boolean) =>
  queryOptions({
    queryKey: ['rain-gauges', id ?? ''] as const,
    queryFn: () => apiGet<RainGaugeReadings>(`/rain-gauges/${id ?? ''}`),
    enabled: enabled && id !== undefined && id !== '',
    staleTime: 60 * 60_000,
  })

export function useRainGauges(id: string | undefined, enabled: boolean): UseQueryResult<RainGaugeReadings> {
  return useQuery(rainGaugesQuery(id, enabled))
}

/**
 * The soil station's reading near a crag in `SOIL_STATIONS` (#589), for the
 * Gauges card's Ground tab. Asked only while the Precip tab is open, and only
 * for such a crag; kept an hour, since NCEI posts the file hourly.
 */
export const soilQuery = (id: string | undefined, knownCrag: string | null | undefined, enabled: boolean) =>
  queryOptions({
    queryKey: ['soil', id ?? ''] as const,
    // `basis=recent`: this build reads a Wisconet rank against its last 30 days, so the API may send one.
    queryFn: () => apiGet<SoilReading | null>(`/soil/${id ?? ''}?basis=recent`),
    enabled: enabled && id !== undefined && id !== '' && soilStationFor(knownCrag) !== null,
    staleTime: 60 * 60_000,
  })

export function useSoil(
  id: string | undefined,
  knownCrag: string | null | undefined,
  enabled: boolean,
): UseQueryResult<SoilReading | null> {
  return useQuery(soilQuery(id, knownCrag, enabled))
}

/** The key every visits query sits under, so a saved forecast check can mark it stale. */
export const VISITS_KEY = 'visits'

/**
 * The reader's own visits to a place over the last 15 days (#589): their
 * forecast checks there, for the Gauges card's marks. Asked only while the
 * Precip tab is open, like the rain gauges.
 */
export const visitsQuery = (id: string | undefined, enabled: boolean) =>
  queryOptions({
    queryKey: [VISITS_KEY, id ?? ''] as const,
    queryFn: () => apiGet<Visit[]>(`/visits/${id ?? ''}`),
    enabled: enabled && id !== undefined && id !== '',
  })

export function useVisits(id: string | undefined, enabled: boolean): UseQueryResult<Visit[]> {
  return useQuery(visitsQuery(id, enabled))
}
