/**
 * River gauges a crag's climbing depends on: a boulder or wall you can reach
 * only when the river is low enough to wade or stand beside.
 *
 * **Keyed by `KNOWN_CRAGS` slug, not by saved location**, so everyone who
 * saves the crag sees the same gauge and the same line, and it needs no
 * migration. The line is field knowledge, recorded with who set it and from
 * what reading, and changes here as the owner learns more.
 *
 * **The gauge is a reading beside the score, never part of it.** No river
 * level feeds or withholds Crag A.
 */
export type RiverGauge = {
  /** USGS monitoring location id, as `api.waterdata.usgs.gov` takes it. */
  site: string
  /** The river and the gauge's place, as a reader would name it. */
  river: string
  /** What the line is for: the problem the river cuts off, with its grade. */
  spot: string
  /** The boulder or wall `spot` is on. */
  boulder: string
  /** Gage height, ft, at or below which `spot` was reachable. */
  reachable_at_or_below_ft: number
  /** Who set the line and from what reading. */
  line_source: string
}

export const RIVER_GAUGES: Readonly<Record<string, readonly RiverGauge[]>> = {
  // Kettle River below Sandstone (USGS 05336700). On 2026-11-08 the gauge read
  // 4.90-4.98 ft (about 4.94 ft through midday) and the river was "JUST low
  // enough" to try the Beach boulder at Eldon (owner, 2026-11-09); the problem is Best
  // Boulder in Minnesota, V5 (owner, 2026-11-09: "Best v5 climbable under 5ft").
  'robinson-park': [
    {
      site: 'USGS-05336700',
      river: 'Kettle River below Sandstone',
      spot: 'Best Boulder in Minnesota V5',
      boulder: 'Beach boulder',
      reachable_at_or_below_ft: 4.95,
      line_source: 'Owner, 8 Nov 2026: just low enough at 4.94 ft',
    },
  ],
}

/** The gauges for a saved location's known crag; none for an unknown crag. */
export function riverGaugesFor(knownCrag: string | null | undefined): readonly RiverGauge[] {
  if (knownCrag === null || knownCrag === undefined) return []
  return RIVER_GAUGES[knownCrag] ?? []
}

/** One gage-height observation. */
export type RiverPoint = {
  /** ISO instant. */
  at: string
  height_ft: number
}

/**
 * `GET /river-gauges/:locationId`: one entry per gauge of the location's crag.
 * `points` covers the last `RIVER_HISTORY_DAYS`, oldest first, thinned to the
 * last observation in each hour (so the newest observation is always the last
 * point). **Empty means USGS did not answer or reported nothing**, never "the
 * river is low".
 */
export type RiverGaugeReading = RiverGauge & {
  points: RiverPoint[]
}

/** How many days of gage height a reading carries: the Gauges card's chart (#589). */
export const RIVER_HISTORY_DAYS = 15

/** The span the change line measures over: about a day, as the card has always said it. */
export const RIVER_CHANGE_SPAN_MS = 25 * 3_600_000

/** How far the point a change is measured from may sit from `RIVER_CHANGE_SPAN_MS` back. */
export const RIVER_CHANGE_TOLERANCE_MS = 90 * 60_000

/** USGS posts with a lag of an hour or two; past this, the newest reading is too old to stand for now. */
export const RIVER_STALE_MS = 6 * 3_600_000

export type RiverState =
  | { kind: 'reachable'; height_ft: number; at: string }
  | { kind: 'high'; height_ft: number; at: string }
  | { kind: 'stale'; height_ft: number; at: string }
  | { kind: 'unavailable' }

/** What the newest reading says about the spot, or why it says nothing. */
export function riverState(reading: Pick<RiverGaugeReading, 'points' | 'reachable_at_or_below_ft'>, nowMs: number): RiverState {
  const latest = reading.points.at(-1)
  if (latest === undefined || !Number.isFinite(latest.height_ft)) return { kind: 'unavailable' }
  const atMs = Date.parse(latest.at)
  if (!Number.isFinite(atMs)) return { kind: 'unavailable' }
  const base = { height_ft: latest.height_ft, at: latest.at }
  if (nowMs - atMs > RIVER_STALE_MS) return { kind: 'stale', ...base }
  return latest.height_ft <= reading.reachable_at_or_below_ft ? { kind: 'reachable', ...base } : { kind: 'high', ...base }
}

/**
 * Change over about a day, ft: the newest point minus the point nearest
 * `spanMs` before it, with that point's time so the screen can say the hours
 * it really covers. Null when no point sits within `toleranceMs` of the mark:
 * a gap there would turn a day's trend into an hour's or a week's.
 */
export function riverChangeFt(
  points: readonly RiverPoint[],
  spanMs = RIVER_CHANGE_SPAN_MS,
  toleranceMs = RIVER_CHANGE_TOLERANCE_MS,
): { change_ft: number; from_at: string } | null {
  const latest = points.at(-1)
  if (latest === undefined) return null
  const latestMs = Date.parse(latest.at)
  if (!Number.isFinite(latestMs)) return null
  const target = latestMs - spanMs
  let best: RiverPoint | null = null
  let bestOff = Infinity
  for (const p of points) {
    const ms = Date.parse(p.at)
    if (!Number.isFinite(ms) || !Number.isFinite(p.height_ft)) continue
    const off = Math.abs(ms - target)
    if (off < bestOff) {
      best = p
      bestOff = off
    }
  }
  if (best === null || bestOff > toleranceMs) return null
  return { change_ft: Math.round((latest.height_ft - best.height_ft) * 100) / 100, from_at: best.at }
}

/**
 * The gage height nearest an instant, within `toleranceMs`, or null: a visit's
 * reading on the Gauges card. Never a neighbour from hours away.
 */
export function riverHeightNear(points: readonly RiverPoint[], atMs: number, toleranceMs = 3_600_000): number | null {
  let best: RiverPoint | null = null
  let bestOff = Infinity
  for (const p of points) {
    const ms = Date.parse(p.at)
    if (!Number.isFinite(ms) || !Number.isFinite(p.height_ft)) continue
    const off = Math.abs(ms - atMs)
    if (off < bestOff) {
      best = p
      bestOff = off
    }
  }
  return best === null || bestOff > toleranceMs ? null : best.height_ft
}
