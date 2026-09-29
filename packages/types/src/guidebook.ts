import type { AreaPosition } from './logbook.js'

/**
 * The guidebook — a crag's walls and routes, from OpenBeta — as
 * `GET /api/v1/guidebook/:locationId` returns it, and the grade arithmetic
 * every surface that draws it shares.
 *
 * **OpenBeta records far less than a guidebook page implies.** Measured across
 * all 1,861 Minnesota routes on 2026-09-28: no length and no bolt count on any
 * of them, a write-up on five, and a protection rating on a handful. So every
 * field below that a route might lack is nullable, and a surface says "Not
 * recorded" rather than inventing a plausible blank.
 */

export type RouteKind = 'sport' | 'trad' | 'tr' | 'boulder' | 'aid' | 'ice' | 'mixed'

/** OpenBeta's protection rating. Its `UNSPECIFIED` is not a rating and arrives as `null`. */
export type RouteSafety = 'PG' | 'R' | 'X'

export type GuidebookRoute = {
  /** OpenBeta's climb uuid. */
  id: string
  name: string
  /** `5.12c`, `5.10-`, `Easy 5th`. Null on a boulder problem. */
  yds: string | null
  french: string | null
  /** `V4`, `V3-4`, `V-easy`. Null on a roped route. */
  vscale: string | null
  kinds: RouteKind[]
  first_ascent: string | null
  safety: RouteSafety | null
  /**
   * The route's position on its wall, 0 at the left. **Null when OpenBeta has
   * none** — it stores `999999` for that, which would sort every unplaced route
   * to the far right as if someone had placed it there.
   */
  left_right: number | null
  /** Mountain Project's route id, which OpenBeta imported from. */
  mp_id: string | null
  description: string | null
}

export type GuidebookWall = {
  /** OpenBeta's area uuid. */
  id: string
  name: string
  /** Null when OpenBeta has no point for the wall. */
  lat: number | null
  lon: number | null
  mp_id: string | null
  /** Every route in the wall's subtree. Unordered — see `ordered`. */
  routes: GuidebookRoute[]
  /**
   * True only when every route sits directly on this wall with its own distinct
   * `left_right`. **82 of the 250 Minnesota walls with routes fail this**, most
   * of them with every route at the sentinel, and a list sorted by a tie or a
   * sentinel is not "left to right" whatever the heading says.
   */
  ordered: boolean
  /**
   * Where a climber's phone put this wall or boulder, shared by every account;
   * null when nobody has recorded it. **Not `lat`/`lon`**, which are OpenBeta's
   * and wrong on the ground. Optional because the API and the client deploy
   * separately: a client reads an absent field as `null`, a gap.
   */
  position?: AreaPosition | null
}

export type Guidebook = {
  /** The date the snapshot behind this answer was pulled from OpenBeta. */
  snapshot_date: string
  crag: {
    id: string
    name: string
    /** OpenBeta's path, country first: `USA › Minnesota › He Mni Can - Barn Bluff (Red Wing)`. */
    path: string[]
    lat: number
    lon: number
    mp_id: string | null
    route_count: number
  }
  /** The crag's direct sub-areas, by name — OpenBeta's wall points are not reliable enough to order by. A crag with no sub-areas is its own single wall. */
  walls: GuidebookWall[]
}

/** What the sources footer names for everything on these screens. */
export const GUIDEBOOK_SOURCE_LABEL = 'OpenBeta community data (CC0)'

// ─────────────────────────────────────────────
// Grades
// ─────────────────────────────────────────────

/**
 * The difficulty bands the histogram and the stacked bars count, easiest first,
 * then boulders — which are on a different scale and are not a sixth step.
 */
export const GRADE_BANDS = ['5.9', '5.10', '5.11', '5.12', '5.13', 'boulder'] as const
export type GradeBand = (typeof GRADE_BANDS)[number]

/** An axis label: the open-ended bands say which way they are open. */
export const GRADE_BAND_SHORT: Record<GradeBand, string> = {
  '5.9': '5.9−',
  '5.10': '5.10',
  '5.11': '5.11',
  '5.12': '5.12',
  '5.13': '5.13+',
  boulder: 'Boulder',
}

/** A legend key, where there is room to say it. */
export const GRADE_BAND_LONG: Record<GradeBand, string> = {
  '5.9': '5.9 & under',
  '5.10': '5.10',
  '5.11': '5.11',
  '5.12': '5.12',
  '5.13': '5.13+',
  boulder: 'Boulder',
}

type Grades = Pick<GuidebookRoute, 'yds' | 'vscale' | 'kinds'>

/** `5.12c` → 12, `5.7+` → 7, `Easy 5th` → 0. Null when the string is no YDS grade. */
function ydsNumber(yds: string): number | null {
  const m = /^5\.(\d+)/.exec(yds.trim())
  if (m?.[1] !== undefined) return Number(m[1])
  return /5th/i.test(yds) ? 0 : null
}

/**
 * Where a route falls. **A boulder problem is a boulder whatever else it
 * carries**; a route with no grade OpenBeta could give falls nowhere and is
 * counted in no band rather than guessed into the easiest.
 */
export function gradeBand(route: Grades): GradeBand | null {
  if (route.kinds.includes('boulder') || (route.yds === null && route.vscale !== null)) {
    return 'boulder'
  }
  if (route.yds === null) return null
  const n = ydsNumber(route.yds)
  if (n === null) return null
  if (n <= 9) return '5.9'
  if (n >= 13) return '5.13'
  return n === 10 ? '5.10' : n === 11 ? '5.11' : '5.12'
}

/**
 * The letter or sign after a YDS number, in tenths of a number grade, so that
 * `5.10a` < `5.10-` < `5.10a/b` < `5.10b` < `5.10` < `5.10c` < `5.10+` < `5.10d`.
 * A bare `5.10` sits mid-grade, and `-`/`+` at the soft ends, where a climber means them.
 */
const YDS_SUFFIX: Record<string, number> = {
  '-': 2,
  a: 1,
  'a/b': 2.5,
  b: 3,
  'b/c': 4.5,
  '': 5,
  c: 6,
  'c/d': 7,
  '+': 8,
  d: 9,
}

/**
 * A number that orders routes by difficulty: roped routes first by YDS, then
 * boulders by V grade (the two scales do not interleave). **Null when the grade
 * cannot be read** — a caller sorts those last rather than at zero, where they
 * would pass for the easiest route on the wall.
 */
export function gradeSortKey(route: Grades): number | null {
  if (gradeBand(route) === 'boulder') {
    const v = route.vscale ?? ''
    if (/^V-?easy/i.test(v)) return 1000
    // The sign is a sign only when no digit follows: `V3-4` is a range, read at its low end.
    const m = /^V(\d+)(?:([+-])(?!\d))?/.exec(v)
    if (m?.[1] === undefined) return null
    return 1010 + Number(m[1]) * 10 + (m[2] === '+' ? 3 : m[2] === '-' ? -3 : 0)
  }
  if (route.yds === null) return null
  const n = ydsNumber(route.yds)
  if (n === null) return null
  const rest = route.yds.trim().replace(/^5\.\d+/, '').trim()
  const suffix = n < 10 ? (rest === '-' ? 3 : rest === '+' ? 7 : 5) : YDS_SUFFIX[rest]
  return n * 10 + (suffix ?? 5)
}

/** The grade as a climber writes it — YDS for a route, V for a problem. Null when there is none. */
export function gradeLabel(route: Grades): string | null {
  return gradeBand(route) === 'boulder' ? (route.vscale ?? route.yds) : (route.yds ?? route.vscale)
}

export function bandCounts(routes: readonly Grades[]): Record<GradeBand, number> {
  const counts = Object.fromEntries(GRADE_BANDS.map((b) => [b, 0])) as Record<GradeBand, number>
  for (const route of routes) {
    const band = gradeBand(route)
    if (band !== null) counts[band] += 1
  }
  return counts
}

/**
 * `5.7+ – 5.14-`: the easiest and hardest roped grade. Boulders only when there
 * is nothing roped, because a range from `5.6` to `V8` is two scales pretending
 * to be one. Null when no grade can be read.
 */
export function gradeRange(routes: readonly Grades[]): string | null {
  const roped = routes.filter((r) => gradeBand(r) !== 'boulder')
  const pool = roped.some((r) => gradeSortKey(r) !== null) ? roped : routes
  const keyed = pool
    .map((r) => ({ key: gradeSortKey(r), label: gradeLabel(r) }))
    .filter((r): r is { key: number; label: string } => r.key !== null && r.label !== null)
    .sort((a, b) => a.key - b.key)
  const lo = keyed[0]
  const hi = keyed[keyed.length - 1]
  if (lo === undefined || hi === undefined) return null
  return lo.label === hi.label ? lo.label : `${lo.label} – ${hi.label}`
}

/** Easiest first; an unreadable grade last, then by name so the order is stable. */
export function sortByGrade<T extends Grades & { name: string }>(routes: readonly T[]): T[] {
  return [...routes].sort((a, b) => {
    const ka = gradeSortKey(a)
    const kb = gradeSortKey(b)
    if (ka !== kb) return ka === null ? 1 : kb === null ? -1 : ka - kb
    return a.name.localeCompare(b.name)
  })
}

// ─────────────────────────────────────────────
// Kinds and order
// ─────────────────────────────────────────────

export const ROUTE_KIND_LABELS: Record<RouteKind, string> = {
  sport: 'Sport',
  trad: 'Trad',
  tr: 'TR',
  boulder: 'Boulder',
  aid: 'Aid',
  ice: 'Ice',
  mixed: 'Mixed',
}

/** `Sport · Trad`, in `ROUTE_KIND_LABELS` order whatever order OpenBeta stored. */
export function kindsLine(kinds: readonly RouteKind[]): string {
  return (Object.keys(ROUTE_KIND_LABELS) as RouteKind[])
    .filter((k) => kinds.includes(k))
    .map((k) => ROUTE_KIND_LABELS[k])
    .join(' · ')
}

/**
 * How many routes are of each kind. **A route can be several**, so these add up
 * to more than the route count, and a surface showing them says so.
 */
export function kindCounts(routes: readonly Pick<GuidebookRoute, 'kinds'>[]): Record<RouteKind, number> {
  const counts = Object.fromEntries(
    (Object.keys(ROUTE_KIND_LABELS) as RouteKind[]).map((k) => [k, 0]),
  ) as Record<RouteKind, number>
  for (const route of routes) for (const kind of new Set(route.kinds)) counts[kind] += 1
  return counts
}

/** The wall's routes left to right, or null when OpenBeta does not establish an order. */
export function leftToRight(wall: GuidebookWall): GuidebookRoute[] | null {
  if (!wall.ordered) return null
  return [...wall.routes].sort((a, b) => (a.left_right ?? 0) - (b.left_right ?? 0))
}

/**
 * The route and up to `span` either side of it, left to right — the "On the
 * wall" card. Null when the wall has no order, because neighbours in an
 * arbitrary order are not neighbours.
 */
export function routeNeighbours(
  wall: GuidebookWall,
  routeId: string,
  span = 2,
): { position: number; routes: GuidebookRoute[] } | null {
  const ordered = leftToRight(wall)
  if (ordered === null) return null
  const i = ordered.findIndex((r) => r.id === routeId)
  if (i === -1) return null
  const from = Math.max(0, Math.min(i - span, ordered.length - (span * 2 + 1)))
  return { position: i + 1, routes: ordered.slice(from, from + span * 2 + 1) }
}
