import {
  summarizeReadings,
  type ForecastSnapshot,
  type HourlyReading,
  type HourlySample,
  type HourlySeries,
  type ReadingsDay,
} from '@weatherteam6/types'

/**
 * The Overview tab's logic, apart from its markup: which hours the Today strip
 * shows, which days "Next 3 days" lists and what score each carries, and when
 * rain is next likely. Pure, so each rule is reachable by a test — the Mini
 * App's tests have no DOM.
 *
 * **Every date here is one the server decided.** Today is the forecast row the
 * server flagged `is_today`, and an hour belongs to a day by its server-derived
 * `local_date`. The only thing computed on this side is an hour's clock label,
 * from the location's own `utc_offset_seconds` — never the viewer's (#33).
 */

/**
 * The Today strip's hours, on the location's clock: morning to evening every
 * three hours, the Figma frame's five. Fixed rather than "the next five hours"
 * so the strip reads as the shape of the day, and a reader at 13:00 still sees
 * the morning they may have missed.
 */
export const TODAY_STRIP_HOURS = [9, 12, 15, 18, 21] as const

export type TodayCell = {
  valid_at: string
  /** `09`, on the location's clock. */
  hourLabel: string
  tempC: number | null
  /** Joined by instant from `readings.hours`. `null` for a city, or an hour the model did not read. */
  reading: HourlyReading | null
}

/** The location-clock hour of a UTC instant, or `null` when either input cannot be read. */
function localHour(validAt: string, utcOffsetSeconds: number): number | null {
  const t = Date.parse(validAt)
  if (!Number.isFinite(t) || !Number.isFinite(utcOffsetSeconds)) return null
  return new Date(t + utcOffsetSeconds * 1000).getUTCHours()
}

/**
 * The strip's cells for `todayDate`.
 *
 * **An hour the run does not carry is left out, not dashed.** The strip is a
 * sample of the day, and five cells with two empty reads as a broken
 * instrument; three cells reads as a run that starts later. A carried hour
 * whose temperature is null keeps its cell, and the renderer dashes it.
 *
 * `readings` is `undefined` for a city and for an API older than the field;
 * both give cells with no reading rather than an invented one.
 */
export function todayCells(
  series: HourlySeries,
  todayDate: string,
  withReadings: boolean,
): TodayCell[] {
  const byInstant = new Map<string, HourlyReading>()
  if (withReadings) {
    for (const r of series.readings?.hours ?? []) byInstant.set(r.valid_at, r)
  }

  const cells: TodayCell[] = []
  for (const wanted of TODAY_STRIP_HOURS) {
    const hour: HourlySample | undefined = series.hours.find(
      (h) => h.local_date === todayDate && localHour(h.valid_at, series.utc_offset_seconds) === wanted,
    )
    if (hour === undefined) continue
    cells.push({
      valid_at: hour.valid_at,
      hourLabel: String(wanted).padStart(2, '0'),
      tempC: hour.temp_c,
      reading: byInstant.get(hour.valid_at) ?? null,
    })
  }
  return cells
}

export type NextDay = {
  local_date: string
  /** `Thursday · 9/24`. */
  title: string
  lowC: number | null
  highC: number | null
  /**
   * The day's Crag A score, **suppressed exactly as every other surface
   * suppresses it** — through `summarizeReadings`. `null` for a city, a day
   * the model did not reach, under a Severe+ alert, and while alerts load.
   */
  score: number | null
}

/**
 * `Thursday · 9/24` from `YYYY-MM-DD`, formatted in UTC to match the bucket
 * the date came from. `null` for a date that is not one.
 */
export function dayTitle(isoDate: string): string | null {
  const [y, m, d] = isoDate.split('-').map(Number)
  if (y === undefined || m === undefined || d === undefined) return null
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  const weekday = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  })
  return `${weekday} · ${m}/${d}`
}

/**
 * The three days after today.
 *
 * **The rows are the forecast's, the scores are the readings'**, joined on the
 * date. The forecast row carries a `score` of its own, and it is the
 * five-component scorer that renders nowhere (Crag A is the score on every
 * screen, owner decision 2026-09-24) — printing it here would put a second
 * number beside the one the Hourly tab shows for the same day. Joining on the
 * date, never on position, because the two lists are built by different paths
 * and the first day one side drops would shift every score after it.
 */
export function nextDays(
  forecast: readonly ForecastSnapshot[],
  todayDate: string,
  readings: DayReadings | null,
  count = 3,
): NextDay[] {
  const rows = [...forecast]
    .filter((row) => row.forecast_date > todayDate)
    .sort((a, b) => a.forecast_date.localeCompare(b.forecast_date))
    .slice(0, count)
  return scoredDays(rows, readings)
}

/**
 * What a day's score is read from: the hourly response's per-day readings,
 * and the two alert facts `summarizeReadings` suppresses the number on.
 * `null` for a city, the `/add` preview, and while `/hourly` is in flight —
 * every one of which gives rows with no score rather than an invented one.
 */
export type DayReadings = {
  days: readonly ReadingsDay[]
  utcOffsetSeconds: number
  severeAlertEvent: string | null
  alertsPending: boolean
}

/**
 * The day's Crag A score, **suppressed exactly as every other surface
 * suppresses it** — through `summarizeReadings`, so a Severe+ alert or an
 * alerts query still in flight drops the number here as it does on the hero.
 * Joined on the date, never on position.
 */
function dayScore(localDate: string, readings: DayReadings | null): number | null {
  const day = readings?.days.find((d) => d.local_date === localDate) ?? null
  if (readings === null || day === null) return null
  return summarizeReadings({
    reading: day.best,
    window: day.window,
    utcOffsetSeconds: readings.utcOffsetSeconds,
    severeAlertEvent: readings.severeAlertEvent,
    alertsPending: readings.alertsPending,
    unavailableReason: null,
  }).score
}

/** Forecast rows, in the order given, as titled days carrying their suppressed score. */
export function scoredDays(
  rows: readonly ForecastSnapshot[],
  readings: DayReadings | null,
): NextDay[] {
  const out: NextDay[] = []
  for (const row of rows) {
    const title = dayTitle(row.forecast_date)
    if (title === null) continue
    const score = dayScore(row.forecast_date, readings)
    out.push({
      local_date: row.forecast_date,
      title,
      lowC: row.temp_c_min,
      highC: row.temp_c_max,
      score,
    })
  }
  return out
}

/**
 * The chance of rain at which an hour counts as **likely**: at least half the
 * ensemble's members are wet. That is what the word means — not a tuned
 * threshold — and it is why the figure beside it is the members' own share.
 */
export const LIKELY_RAIN_PCT = 50

export type NextRain =
  /** The first day, from now on, with an hour at or above `LIKELY_RAIN_PCT`, and that day's highest hourly chance. */
  | { kind: 'likely'; local_date: string; chancePct: number }
  /** No such hour through `throughDate`, the last day the ensemble reached. */
  | { kind: 'none'; throughDate: string }
  /** No hour from now on carries a chance at all — the ensemble said nothing, which is not "dry". */
  | { kind: 'unknown' }

/**
 * When rain is next likely, from the ensemble's per-hour share of wet members.
 *
 * **Only hours still to come.** Rain is stamped at the end of the hour it fell
 * in, so the hour stamped after `now` is the one in progress and counts; an hour
 * stamped at or before `now` has already happened.
 *
 * **`null` chance is unknown, never 0%** (`precip_chance_pct`'s contract): an
 * hour no member reached is skipped, and a run where every coming hour is null
 * answers `unknown` rather than "no rain".
 */
export function nextLikelyRain(hours: readonly HourlySample[], now: number): NextRain {
  const coming = hours.filter((h) => {
    const t = Date.parse(h.valid_at)
    return Number.isFinite(t) && t > now && h.precip_chance_pct !== null
  })
  const last = coming[coming.length - 1]
  if (last === undefined) return { kind: 'unknown' }

  const first = coming.find((h) => (h.precip_chance_pct ?? 0) >= LIKELY_RAIN_PCT)
  if (first === undefined) return { kind: 'none', throughDate: last.local_date }

  const chancePct = Math.max(
    ...coming
      .filter((h) => h.local_date === first.local_date)
      .map((h) => h.precip_chance_pct ?? 0),
  )
  return { kind: 'likely', local_date: first.local_date, chancePct }
}

/** `Today`, or `Sat`, for a `YYYY-MM-DD` in the location's calendar. */
export function shortDay(isoDate: string, todayDate: string): string {
  if (isoDate === todayDate) return 'Today'
  const [y, m, d] = isoDate.split('-').map(Number)
  if (y === undefined || m === undefined || d === undefined) return isoDate
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return isoDate
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  })
}
