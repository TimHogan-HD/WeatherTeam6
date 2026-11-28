import {
  EM_DASH,
  ROCK_LABELS,
  cToFDelta,
  readingNow,
  type HourlyReading,
  type HourlyReadings,
  type HourlySample,
} from '@weatherteam6/types'

/**
 * What the Precip and Rock tabs read from `/hourly`'s readings: the rock's
 * Dryness now, when it is next dry, and how far the air sits above its dew
 * point over the next two days. Pure, so every rule is reachable by a test.
 *
 * **A gap stays a gap.** No readings, a reason there are none, or no hour near
 * now answers `null` — never `Dry`, never a margin of 0.
 */

const HOUR_MS = 3_600_000
/** How far the nearest reading may sit from now and still be called now. */
const NOW_TOLERANCE_MS = 90 * 60_000

function usable(readings: HourlyReadings | undefined): readonly HourlyReading[] | null {
  return readings === undefined || readings.unavailable_reason !== null ? null : readings.hours
}

/** The reading for the hour covering now, or `null`. */
export function readingAtNow(readings: HourlyReadings | undefined, nowMs: number): HourlyReading | null {
  const hours = usable(readings)
  if (hours === null) return null
  const hour = readingNow(hours, nowMs)
  return hour !== null && Math.abs(Date.parse(hour.valid_at) - nowMs) <= NOW_TOLERANCE_MS ? hour : null
}

/** `Dry`, `Drying` or `Wet` now; `null` when the rock could not be read. */
export function drynessNow(readings: HourlyReadings | undefined, nowMs: number): string | null {
  const rock = readingAtNow(readings, nowMs)?.rock ?? null
  return rock === null ? null : ROCK_LABELS[rock.level]
}

export type DryAgain =
  /** The rock is dry now. */
  | { kind: 'now' }
  /** The first hour ahead read as dry, epoch ms. */
  | { kind: 'at'; ms: number }
  /** Not dry in any hour the readings reach, which `throughMs` is the last of. */
  | { kind: 'not-in-forecast'; throughMs: number }

/**
 * When the rock is next dry, on the readings' own levels. `null` when now
 * could not be read. An unread hour ahead is skipped, never taken as dry.
 */
export function dryAgain(readings: HourlyReadings | undefined, nowMs: number): DryAgain | null {
  const now = readingAtNow(readings, nowMs)
  if (now === null || now.rock === null) return null
  if (now.rock.level === 'dry') return { kind: 'now' }
  const nowAt = Date.parse(now.valid_at)
  let last = nowAt
  for (const h of usable(readings) ?? []) {
    const t = Date.parse(h.valid_at)
    if (!Number.isFinite(t) || t <= nowAt) continue
    if (h.rock !== null) last = Math.max(last, t) // an unread hour is not a day the rock was read as wet
    if (h.rock?.level === 'dry') return { kind: 'at', ms: t }
  }
  return { kind: 'not-in-forecast', throughMs: last }
}

/**
 * Hours of air-minus-dew drawn: the hour covering now and 42 ahead (owner, 2026-11-02,
 * variant A: the six hours back made a "48 h" chart under a "next 42 hours" line).
 */
export const MARGIN_AHEAD_HOURS = 42

/**
 * The air's temperature minus its dew point, °F, for one forecast hour (#436):
 * two forecast values, one model's pair (`temp_c` and `dewpoint_c` are the
 * deterministic run's columns, the pair the Today chart draws). `null` when
 * either is missing, never a spread of 0.
 *
 * It replaces the rock's modelled margin as the figure on screen: no sensor
 * reads rock, and the model's rock temperature misses ground-surface sensors
 * by about 9°F in daytime (`compare:rock-temp`), so a "+3°F" rock gap cannot
 * tell condensing rock from dry. Since 2026-11-28 the model's estimate is not
 * drawn at all: it called dew far more often than the rock was wet.
 */
export function airDewSpreadF(hour: Pick<HourlySample, 'temp_c' | 'dewpoint_c'>): number | null {
  return hour.temp_c === null || hour.dewpoint_c === null ? null : cToFDelta(hour.temp_c - hour.dewpoint_c)
}

export type SpreadHour = {
  t: number
  /** Air minus dew point, °F; `null` where either was missing. */
  spreadF: number | null
}

/**
 * Air minus dew point from the hour covering now to `MARGIN_AHEAD_HOURS`
 * ahead, the Condensation card's chart. A missing hour is absent, a missing
 * value a gap.
 */
export function spreadSeries(hours: readonly HourlySample[], nowMs: number): SpreadHour[] {
  const from = nowMs - HOUR_MS / 2
  const to = nowMs + MARGIN_AHEAD_HOURS * HOUR_MS + HOUR_MS / 2
  return hours
    .map((h) => ({ t: Date.parse(h.valid_at), spreadF: airDewSpreadF(h) }))
    .filter((h) => Number.isFinite(h.t) && h.t >= from && h.t <= to)
}

/**
 * `12°F` or `at dew point`. Air never sits below its dew point; a model pair
 * that rounds there reads `at dew point`, never a negative spread.
 */
export function spreadWords(spreadF: number | null): string {
  if (spreadF === null) return EM_DASH
  const f = Math.round(spreadF)
  return f <= 0 ? 'at dew point' : `${f}°F`
}
