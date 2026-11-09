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
 * `points` is the last day of observations, oldest first. **Empty means USGS
 * did not answer or reported nothing**, never "the river is low".
 */
export type RiverGaugeReading = RiverGauge & {
  points: RiverPoint[]
}

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
 * Change over the window the points cover, ft, newest minus the first point
 * at least `minSpanMs` older. Null when the points cover less than that: a
 * trend over an hour reads as a day's.
 */
export function riverChangeFt(points: readonly RiverPoint[], minSpanMs = 18 * 3_600_000): number | null {
  const latest = points.at(-1)
  const first = points[0]
  if (latest === undefined || first === undefined) return null
  if (Date.parse(latest.at) - Date.parse(first.at) < minSpanMs) return null
  return Math.round((latest.height_ft - first.height_ft) * 100) / 100
}
