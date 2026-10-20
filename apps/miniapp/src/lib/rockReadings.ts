import {
  ROCK_LABELS,
  SCORE_MODEL_FACTS,
  cToFDelta,
  readingNow,
  type HourlyReading,
  type HourlyReadings,
} from '@weatherteam6/types'

/**
 * What the Precip and Rock tabs read from `/hourly`'s readings: the rock's
 * Dryness now, when it is next dry, and how far it sits above its dew point
 * over the next two days. Pure, so every rule is reachable by a test.
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

/** Crag A's condensation edge, °F of margin: below it condensation costs grip. */
export const CONDENSATION_EDGE_F = cToFDelta(SCORE_MODEL_FACTS.condensationClearMarginC)

export type MarginHour = {
  t: number
  /** The rock's margin over its dew point, °F; `null` where it could not be read. */
  marginF: number | null
}

/** Hours of margin drawn: six back, so a reader sees what the night did, and 42 ahead. */
export const MARGIN_BACK_HOURS = 6
export const MARGIN_AHEAD_HOURS = 42

/**
 * The rock's margin over its dew point from six hours back to 42 ahead, the
 * Rock tab's condensation chart. Only the hours the readings carry: a missing
 * hour is absent, a null margin a gap.
 */
export function marginSeries(readings: HourlyReadings | undefined, nowMs: number): MarginHour[] {
  const hours = usable(readings)
  if (hours === null) return []
  const from = nowMs - MARGIN_BACK_HOURS * HOUR_MS - HOUR_MS / 2
  const to = nowMs + MARGIN_AHEAD_HOURS * HOUR_MS + HOUR_MS / 2
  return hours
    .map((h) => ({
      t: Date.parse(h.valid_at),
      marginF: h.condensation_margin_c === null ? null : cToFDelta(h.condensation_margin_c),
    }))
    .filter((h) => Number.isFinite(h.t) && h.t >= from && h.t <= to)
}

/** Hours ahead of now whose margin sits under the condensation edge. Unread hours are not counted. */
export function condensationHoursAhead(series: readonly MarginHour[], nowMs: number): number {
  return series.filter((h) => h.t > nowMs && h.marginF !== null && h.marginF < CONDENSATION_EDGE_F).length
}
