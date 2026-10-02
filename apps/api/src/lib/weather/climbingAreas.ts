import type {
  ClimbingAreaEntry,
  ClimbingAreaLevel,
  ClimbingStateSummary,
  GeocodeResult,
} from '@weatherteam6/types'
import { CO_CLIMBING_AREAS } from './climbingAreasCo.js'
import { MN_CLIMBING_AREAS } from './climbingAreasMn.js'

/** One OpenBeta area, as stored in a generated `climbingAreas<State>.ts` file. */
export type ClimbingArea = {
  readonly uuid: string
  readonly name: string
  /** The area it sits inside, or null for a top-level area in its state. */
  readonly parent: string | null
  /** That area's OpenBeta id: names repeat, so browsing walks ids. Null for a top-level area. */
  readonly parent_id: string | null
  readonly climbs: number
  readonly lat: number
  readonly lon: number
}

/** How many climbing areas may head a result list before the places. */
export const MAX_CLIMBING_RESULTS = 5

/**
 * **The states searched and browsed, each a snapshot from `npm run
 * climbing:pull`.** The owner adds a state when a trip needs it (Minnesota
 * 2026-09-23, Colorado 2026-10-01); a new one is a pulled file and a line here.
 */
const STATES: readonly { code: string; name: string; areas: readonly ClimbingArea[] }[] = [
  { code: 'MN', name: 'Minnesota', areas: MN_CLIMBING_AREAS },
  { code: 'CO', name: 'Colorado', areas: CO_CLIMBING_AREAS },
]

type Indexed = { area: ClimbingArea; state: (typeof STATES)[number]; name: string[]; all: string[]; id: number }

const INDEX: readonly Indexed[] = STATES.flatMap((state) => state.areas.map((area) => ({ area, state }))).map(
  ({ area, state }, i) => {
    const name = words(area.name)
    return {
      area,
      state,
      name,
      all: [...name, ...words(area.parent ?? '')],
      // `GeocodeResult.id` is a list key, and Open-Meteo's ids are positive, so a
      // negative one cannot collide with a place in the same response.
      id: -(i + 1),
    }
  },
)

const BY_ID = new Map(INDEX.map((e) => [e.area.uuid, e]))

/**
 * Each area's children, most climbs first, keyed by parent id — or by the
 * state's code for its top level. **An area whose parent was left out of the
 * snapshot** (no climbs of its own, or no coordinate) **is listed at its
 * state's top level**, so every area can be reached by browsing.
 */
const CHILDREN = new Map<string, Indexed[]>()
for (const e of INDEX) {
  const key = e.area.parent_id !== null && BY_ID.has(e.area.parent_id) ? e.area.parent_id : e.state.code
  const list = CHILDREN.get(key) ?? []
  list.push(e)
  CHILDREN.set(key, list)
}
for (const list of CHILDREN.values()) list.sort((a, b) => b.area.climbs - a.area.climbs)

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

function toPlace(e: Indexed): GeocodeResult {
  return {
    id: e.id,
    name: e.area.name,
    lat: e.area.lat,
    lon: e.area.lon,
    // OpenBeta carries no elevation; the saved row then skips the lapse-rate
    // correction, as the coordinate path does (§12.3).
    elevation_m: null,
    admin1: e.state.name,
    country: 'United States',
    timezone: null,
    feature_code: null,
    climbing_area: { climbs: e.area.climbs, parent: e.area.parent },
  }
}

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
    .map(({ e }) => toPlace(e))
}

const toEntry = (e: Indexed): ClimbingAreaEntry => ({
  area_id: e.area.uuid,
  sub_areas: CHILDREN.get(e.area.uuid)?.length ?? 0,
  place: toPlace(e),
})

/** The states that can be browsed, with what each holds. */
export function climbingStates(): ClimbingStateSummary[] {
  return STATES.map((s) => {
    const top = CHILDREN.get(s.code) ?? []
    return { code: s.code, name: s.name, climbs: top.reduce((n, e) => n + e.area.climbs, 0), areas: top.length }
  })
}

/**
 * **One level of a state's tree**: the state's top-level areas when `areaId`
 * is null, else that area and the areas directly inside it. Null when the
 * state is unknown or the area is not in that state.
 */
export function climbingAreaLevel(stateCode: string, areaId: string | null): ClimbingAreaLevel | null {
  const state = STATES.find((s) => s.code === stateCode)
  if (state === undefined) return null
  const head = { code: state.code, name: state.name }
  if (areaId === null) {
    return { state: head, area: null, path: [], children: (CHILDREN.get(state.code) ?? []).map(toEntry) }
  }
  const e = BY_ID.get(areaId)
  if (e === undefined || e.state !== state) return null
  const path: { area_id: string; name: string }[] = []
  for (let up = e.area.parent_id; up !== null; ) {
    const p = BY_ID.get(up)
    if (p === undefined) break
    path.unshift({ area_id: p.area.uuid, name: p.area.name })
    up = p.area.parent_id
  }
  return { state: head, area: toEntry(e), path, children: (CHILDREN.get(e.area.uuid) ?? []).map(toEntry) }
}
