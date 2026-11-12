import { RIVER_HISTORY_DAYS, type RiverPoint } from '@weatherteam6/types'
import { niceTicks } from './chartTicks.js'

/**
 * The River tab's 15-day chart (#589), as numbers: the time and height domains,
 * the line's runs, and where each visit sits. Pure, so a gap and a scale are
 * tested here rather than in an SVG string.
 */

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

/** Two points further apart than this are a gap in the record, drawn as a break. */
export const RIVER_GAP_MS = 3 * HOUR_MS

export type RiverChartModel = {
  /** Epoch ms, left and right edges: the last 15 days to now. */
  fromMs: number
  toMs: number
  /** Height domain, ft: covers every point and the line, on round ticks. */
  lo: number
  hi: number
  ticks: number[]
  /** Unbroken runs of points, each oldest first. A one-point run is a dot. */
  runs: { ms: number; ft: number }[][]
  /** The newest point, marked with a dot; null when there is none. */
  latest: { ms: number; ft: number } | null
}

/** Null when there is nothing to draw: no point inside the window. */
export function riverChartModel(points: readonly RiverPoint[], lineFt: number, nowMs: number): RiverChartModel | null {
  const toMs = nowMs
  const fromMs = nowMs - RIVER_HISTORY_DAYS * DAY_MS
  const pts = points
    .map((p) => ({ ms: Date.parse(p.at), ft: p.height_ft }))
    .filter((p) => Number.isFinite(p.ms) && Number.isFinite(p.ft) && p.ms >= fromMs && p.ms <= toMs)
    .sort((a, b) => a.ms - b.ms)
  if (pts.length === 0) return null

  const runs: { ms: number; ft: number }[][] = []
  for (const p of pts) {
    const run = runs[runs.length - 1]
    const prev = run?.[run.length - 1]
    if (run === undefined || prev === undefined || p.ms - prev.ms > RIVER_GAP_MS) runs.push([p])
    else run.push(p)
  }

  const heights = [...pts.map((p) => p.ft), lineFt]
  const min = Math.min(...heights)
  const max = Math.max(...heights)
  const ticks = niceTicks(min - 0.05, max + 0.05, 3, 0.1)
  const lo = ticks[0] ?? min
  const hi = ticks[ticks.length - 1] ?? max
  return { fromMs, toMs, lo, hi, ticks, runs, latest: pts[pts.length - 1] ?? null }
}

/**
 * A visit's day on the crag's clock, as epoch ms, local midnight to midnight:
 * the faint band behind the visit line.
 */
export function localDaySpan(atMs: number, utcOffsetSeconds: number): { startMs: number; endMs: number } {
  const offsetMs = utcOffsetSeconds * 1000
  const startMs = Math.floor((atMs + offsetMs) / DAY_MS) * DAY_MS - offsetMs
  return { startMs, endMs: startMs + DAY_MS }
}
