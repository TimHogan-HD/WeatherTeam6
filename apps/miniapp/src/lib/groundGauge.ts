import { SOIL_HISTORY_DAYS, type SoilPoint, type SoilRainDay } from '@weatherteam6/types'
import { niceTicks } from './chartTicks.js'

/**
 * The Gauges card's Ground tab (#589 part 2; owner, 2026-11-12): the NOAA
 * station's soil, as numbers and words. Pure, so the rules that keep a reading
 * honest are tested here rather than in markup.
 *
 * **Frozen or stale is a gap, never a figure.** The sensor reads frozen soil
 * as dry, so a 5 cm temperature at or below 0 °C withholds the reading; so
 * does a newest row older than `GROUND_STALE_MS`, or one missing the
 * temperature that would rule frost out. Percentile words are the owner's.
 */

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

/** NCEI posts the soil file a few hours behind; past this the newest row is too old to stand for now. */
export const GROUND_STALE_MS = 8 * HOUR_MS

/** Two points further apart than this are a gap in the record, drawn as a break. */
export const GROUND_GAP_MS = 3 * HOUR_MS

/** A change smaller than this, in percentage points of water, reads as steady. */
export const GROUND_STEADY_PTS = 0.5

export type GroundWord = 'Drier than usual' | 'Typical' | 'Wetter than usual' | 'Soaked'

/** The owner's words for a percentile (a fraction): under 25, 25-75, 75-90, 90 and up. */
export function groundWord(pct: number): GroundWord {
  if (pct >= 0.9) return 'Soaked'
  if (pct >= 0.75) return 'Wetter than usual'
  if (pct >= 0.25) return 'Typical'
  return 'Drier than usual'
}

/** The pill beside the figure: the word, said against the date where it would otherwise read as absolute. */
export function groundPill(word: GroundWord): string {
  return word === 'Typical' || word === 'Soaked' ? `${word} for the date` : word
}

/** A soil temperature that rules frost out at a depth; null is not ruled out. */
const thawed = (c: number | null): boolean => c !== null && c > 0

export type GroundDepth = { vwc: number; pct: number; word: GroundWord }

export type GroundState =
  | { kind: 'reading'; at: string; top: GroundDepth; below: GroundDepth | null; wetBelow: boolean }
  | { kind: 'frozen'; at: string; temp_c: number }
  | { kind: 'stale'; at: string }
  | { kind: 'unavailable' }

/** What the newest reading says, or why it says nothing. */
export function groundState(points: readonly SoilPoint[], nowMs: number): GroundState {
  // The newest row the station logged anything in; an empty row is not a reading.
  const latest = [...points].reverse().find((p) => p.vwc_5 !== null || p.temp_5_c !== null)
  if (latest === undefined) return { kind: 'unavailable' }
  const atMs = Date.parse(latest.at)
  if (!Number.isFinite(atMs)) return { kind: 'unavailable' }
  if (nowMs - atMs > GROUND_STALE_MS) return { kind: 'stale', at: latest.at }
  if (latest.temp_5_c !== null && latest.temp_5_c <= 0) return { kind: 'frozen', at: latest.at, temp_c: latest.temp_5_c }
  if (!thawed(latest.temp_5_c) || latest.vwc_5 === null || latest.pct_5 === null) return { kind: 'unavailable' }
  const top = { vwc: latest.vwc_5, pct: latest.pct_5, word: groundWord(latest.pct_5) }
  const below =
    thawed(latest.temp_20_c) && latest.vwc_20 !== null && latest.pct_20 !== null
      ? { vwc: latest.vwc_20, pct: latest.pct_20, word: groundWord(latest.pct_20) }
      : null
  return { kind: 'reading', at: latest.at, top, below, wetBelow: below !== null && below.pct >= 0.75 }
}

/** The Ground tab's status word. */
export function groundTabWord(state: GroundState): string {
  switch (state.kind) {
    case 'reading':
      return state.top.word
    case 'frozen':
      return 'Frozen'
    case 'stale':
    case 'unavailable':
      return 'No reading'
  }
}

/** Percent water by volume, one place: `23.4%`. */
export function formatVwc(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`
}

/** `46th`, `82nd`, `99th`, from a fraction. */
export function ordinalPct(fraction: number): string {
  const n = Math.min(99, Math.max(0, Math.round(fraction * 100)))
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`
}

/** The 5 cm series the chart and trend may read: thawed hours with a figure, oldest first. */
function usable(points: readonly SoilPoint[]): { ms: number; pts: number }[] {
  return points
    .map((p) => ({ ms: Date.parse(p.at), vwc: p.vwc_5, ok: thawed(p.temp_5_c) }))
    .filter((p): p is { ms: number; vwc: number; ok: true } => Number.isFinite(p.ms) && p.vwc !== null && p.ok)
    .map((p) => ({ ms: p.ms, pts: p.vwc * 100 }))
    .sort((a, b) => a.ms - b.ms)
}

/** A move back the other way this large, in points, ends the walk back to the last turn. */
export const GROUND_TURN_PTS = 1

/**
 * How the top 5 cm has moved since its last turn, as one line: down since the
 * last wet peak, or up since the last dry low, with that hour's local date.
 * Walks back from the newest hour; once the series has moved
 * `GROUND_STEADY_PTS` one way, a move of `GROUND_TURN_PTS` back the other
 * marks the turn, so a storm two weeks ago never stands in for last week's.
 * `Steady since` the first usable hour when it never moved that far. Null with fewer than two usable
 * hours: a trend from one point is not a trend.
 */
export function groundTrend(points: readonly SoilPoint[], utcOffsetSeconds: number): string | null {
  const s = usable(points)
  const latest = s[s.length - 1]
  if (latest === undefined || s.length < 2) return null
  let hi = latest
  let lo = latest
  let dir: 'down' | 'up' | null = null
  for (let i = s.length - 2; i >= 0; i--) {
    const p = s[i]
    if (p === undefined) continue
    if (dir === 'down' && hi.pts - p.pts >= GROUND_TURN_PTS) break
    if (dir === 'up' && p.pts - lo.pts >= GROUND_TURN_PTS) break
    if (p.pts > hi.pts) hi = p
    if (p.pts < lo.pts) lo = p
    if (dir === null) dir = hi.pts - latest.pts >= GROUND_STEADY_PTS ? 'down' : latest.pts - lo.pts >= GROUND_STEADY_PTS ? 'up' : null
  }
  const day = (ms: number) =>
    new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(ms + utcOffsetSeconds * 1000)
  if (dir === 'down') return `Down ${(hi.pts - latest.pts).toFixed(1)} points since ${day(hi.ms)}`
  if (dir === 'up') return `Up ${(latest.pts - lo.pts).toFixed(1)} points since ${day(lo.ms)}`
  // The span is the one the series covers, never the one asked for: a thaw or a short read leaves less.
  const first = s[0] ?? latest
  return `Steady since ${day(first.ms)}`
}

export type GroundChartModel = {
  fromMs: number
  toMs: number
  /** Percent domain, on round ticks. */
  lo: number
  hi: number
  ticks: number[]
  runs: { ms: number; pts: number }[][]
  latest: { ms: number; pts: number } | null
  /** Each local day's rain, mm, centred on the day; a partial day is in `rainGaps` instead. */
  rain: { midMs: number; mm: number }[]
  /** Days in the window the station did not report in full (today, always): drawn as a dashed stub, never as a dry day. */
  rainGaps: number[]
  /** The rain axis's top, mm: a day at it reaches about half the plot. */
  rainTopMm: number
}

/** Rain that reaches the rain axis's top at the least: an inch. */
const RAIN_TOP_MIN_MM = 25.4

/** Null when no usable hour falls in the window. */
export function groundChartModel(
  points: readonly SoilPoint[],
  rainDays: readonly SoilRainDay[],
  utcOffsetSeconds: number,
  nowMs: number,
): GroundChartModel | null {
  const toMs = nowMs
  const fromMs = nowMs - SOIL_HISTORY_DAYS * DAY_MS
  const pts = usable(points).filter((p) => p.ms >= fromMs && p.ms <= toMs)
  if (pts.length === 0) return null
  // A row that is not usable (frozen, or no figure) breaks the line however close its neighbours are.
  const usableAt = new Map(pts.map((p) => [p.ms, p]))
  const rows = points
    .map((p) => Date.parse(p.at))
    .filter((ms) => Number.isFinite(ms) && ms >= fromMs && ms <= toMs)
    .sort((a, b) => a - b)
  const runs: { ms: number; pts: number }[][] = []
  let open = false
  for (const ms of rows) {
    const p = usableAt.get(ms)
    if (p === undefined) {
      open = false
      continue
    }
    const run = runs[runs.length - 1]
    const prev = run?.[run.length - 1]
    if (!open || run === undefined || prev === undefined || p.ms - prev.ms > GROUND_GAP_MS) runs.push([p])
    else if (prev.ms !== p.ms) run.push(p)
    open = true
  }
  const values = pts.map((p) => p.pts)
  const ticks = niceTicks(Math.min(...values) - 0.5, Math.max(...values) + 0.5, 3, 1)
  const offsetMs = utcOffsetSeconds * 1000
  const dayMid = (date: string): number | null => {
    const midMs = Date.parse(`${date}T12:00:00Z`) - offsetMs
    return Number.isFinite(midMs) && midMs >= fromMs && midMs <= toMs ? midMs : null
  }
  const rain = rainDays.flatMap((d) => {
    const midMs = dayMid(d.local_date)
    return midMs === null || d.rain_mm === null || d.rain_mm <= 0 ? [] : [{ midMs, mm: d.rain_mm }]
  })
  const rainGaps = rainDays.flatMap((d) => {
    const midMs = dayMid(d.local_date)
    return midMs === null || d.rain_mm !== null ? [] : [midMs]
  })
  return {
    fromMs,
    toMs,
    lo: ticks[0] ?? Math.min(...values),
    hi: ticks[ticks.length - 1] ?? Math.max(...values),
    ticks,
    runs,
    latest: pts[pts.length - 1] ?? null,
    rain,
    rainGaps,
    rainTopMm: Math.max(RAIN_TOP_MIN_MM, ...rain.map((r) => r.mm)),
  }
}

/** The 5 cm moisture nearest an instant, within an hour and thawed, or null: a visit's reading. */
export function groundNear(points: readonly SoilPoint[], atMs: number, toleranceMs = HOUR_MS): number | null {
  let best: { ms: number; pts: number } | null = null
  let bestOff = Infinity
  for (const p of usable(points)) {
    const off = Math.abs(p.ms - atMs)
    if (off < bestOff) {
      best = p
      bestOff = off
    }
  }
  return best === null || bestOff > toleranceMs ? null : best.pts / 100
}
