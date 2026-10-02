import type { GeocodeResult } from '@weatherteam6/types'
import { CO_CLIMBING_AREAS } from './climbingAreasCo.js'
import { MN_CLIMBING_AREAS } from './climbingAreasMn.js'

/** One OpenBeta area, as stored in a generated `climbingAreas<State>.ts` file. */
export type ClimbingArea = {
  readonly uuid: string
  readonly name: string
  /** The area it sits inside, or null for a top-level area in its state. */
  readonly parent: string | null
  readonly climbs: number
  readonly lat: number
  readonly lon: number
}

/** How many climbing areas may head a result list before the places. */
export const MAX_CLIMBING_RESULTS = 5

/**
 * **The states searched, each a snapshot from `npm run climbing:pull`.** The
 * owner adds a state when a trip needs it (Minnesota 2026-09-23, Colorado
 * 2026-10-01); a new one is a pulled file and a line here.
 */
const STATES: readonly { admin1: string; areas: readonly ClimbingArea[] }[] = [
  { admin1: 'Minnesota', areas: MN_CLIMBING_AREAS },
  { admin1: 'Colorado', areas: CO_CLIMBING_AREAS },
]

const INDEX: readonly { area: ClimbingArea; admin1: string; name: string[]; all: string[]; id: number }[] =
  STATES.flatMap(({ admin1, areas }) => areas.map((area) => ({ area, admin1 }))).map(({ area, admin1 }, i) => {
    const name = words(area.name)
    return {
      area,
      admin1,
      name,
      all: [...name, ...words(area.parent ?? '')],
      // `GeocodeResult.id` is a list key, and Open-Meteo's ids are positive, so a
      // negative one cannot collide with a place in the same response.
      id: -(i + 1),
    }
  })

/** Lowercase words, apostrophes dropped so "Devils" finds "Devil's". */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w !== '')
}

const everyPrefix = (query: string[], haystack: string[]): boolean =>
  query.every((q) => haystack.some((w) => w.startsWith(q)))

/**
 * **Climbing areas whose name matches the query, to go above the geocoder's
 * places.** Open-Meteo ranks by population and knows nothing about climbing:
 * measured 2026-09-23, "Smith Rock" put an island in Maine first and "Red River
 * Gorge" returned nothing at all.
 *
 * Every query word must be the start of a word in the area's name or its
 * parent's, so "taylors falls" finds *Interstate SP (Taylors Falls)* and "barn"
 * finds the walls on Barn Bluff. An area matched on its own name ranks above
 * one matched only through its parent, then most climbs first, so the crag
 * leads its own walls.
 */
export function searchClimbingAreas(query: string): GeocodeResult[] {
  const q = words(query)
  if (q.length === 0) return []
  return INDEX.filter((e) => everyPrefix(q, e.all))
    .map((e) => ({ e, own: everyPrefix(q, e.name) }))
    .sort((a, b) => Number(b.own) - Number(a.own) || b.e.area.climbs - a.e.area.climbs)
    .slice(0, MAX_CLIMBING_RESULTS)
    .map(({ e }) => ({
      id: e.id,
      name: e.area.name,
      lat: e.area.lat,
      lon: e.area.lon,
      // OpenBeta carries no elevation; the saved row then skips the lapse-rate
      // correction, as the coordinate path does (§12.3).
      elevation_m: null,
      admin1: e.admin1,
      country: 'United States',
      timezone: null,
      feature_code: null,
      climbing_area: { climbs: e.area.climbs, parent: e.area.parent },
    }))
}
