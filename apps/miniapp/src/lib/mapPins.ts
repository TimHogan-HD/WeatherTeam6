import type { Conditions, Location, WeatherAlert } from '@weatherteam6/types'
import { cardSummary, scoreTone, type Tone } from './locationList.js'

/**
 * One saved location on the Map tab. `score` is the number its list card
 * prints, under the same suppression, and `tone` its rung; both null draw a
 * neutral dot and the name alone.
 */
export type MapPin = { id: string; name: string; lon: number; lat: number; score: number | null; tone: Tone | null }

type Answer<T> = { data: T | undefined; isPending: boolean }

/** A location with the list's own query answers for it, so the map asks for nothing new. */
export type PinSource = {
  location: Location
  conditions: Answer<Conditions | null>
  alerts: Answer<WeatherAlert[]>
}

/**
 * The pins, through `cardSummary` exactly as the list's cards go: no number
 * while alerts are pending or under a Severe+ alert, none for a place that is
 * not a crag, and none until conditions have answered.
 *
 * A location whose coordinates are not finite, or not on the globe, has no
 * pin: placing it at 0,0 would draw a crag in the Gulf of Guinea.
 */
export function mapPins(sources: readonly PinSource[]): MapPin[] {
  const pins: MapPin[] = []
  for (const { location, conditions, alerts } of sources) {
    const lat = coordinate(location.lat, 90)
    const lon = coordinate(location.lon, 180)
    if (lat === null || lon === null) continue
    const score = location.is_climbing_location
      ? (cardSummary(conditions.data, alerts.data, alerts.isPending)?.score ?? null)
      : null
    pins.push({ id: location.id, name: location.name, lat, lon, score, tone: score === null ? null : scoreTone(score) })
  }
  return pins
}

/**
 * `Location` types these as numbers, which the API parses from Postgres
 * `numeric` strings; this is the boundary that makes sure. A string is read,
 * anything else is a gap.
 */
function coordinate(value: unknown, limit: number): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  return Number.isFinite(n) && Math.abs(n) <= limit ? n : null
}

export type MapView =
  | { kind: 'bounds'; bounds: [[number, number], [number, number]] }
  | { kind: 'centre'; centre: [number, number]; zoom: number }

/** The contiguous United States, for a map with nothing on it yet. */
export const EMPTY_VIEW: MapView = { kind: 'centre', centre: [-98.5, 39.5], zoom: 3 }
/** One pin: close enough to see its valley, far enough to see the towns round it. */
export const SINGLE_PIN_ZOOM = 10

/** Where the map opens: every pin in view, one pin centred, or the US. */
export function initialView(pins: readonly Pick<MapPin, 'lon' | 'lat'>[]): MapView {
  const [first, ...rest] = pins
  if (first === undefined) return EMPTY_VIEW
  if (rest.length === 0) return { kind: 'centre', centre: [first.lon, first.lat], zoom: SINGLE_PIN_ZOOM }
  const lons = pins.map((p) => p.lon)
  const lats = pins.map((p) => p.lat)
  return {
    kind: 'bounds',
    bounds: [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ],
  }
}
