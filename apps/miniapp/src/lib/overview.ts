import {
  summarizeReadings,
  type ForecastSnapshot,
  type HourlyReading,
  type HourlySample,
  type HourlySeries,
  type ReadingsDay,
} from '@weatherteam6/types'
import { formatSince, type PrecipSummary } from './precipHistory.js'

/**
 * The Overview tab's logic, apart from its markup: which hours the Today chart
 * draws and what score each carries, which days "Next 3 days" lists, and when
 * rain is next likely. Pure, so each rule is reachable by a test — the Mini
 * App's tests have no DOM.
 *
 * **Every date here is one the server decided.** Today is the forecast row the
 * server flagged `is_today`, and an hour belongs to a day by its server-derived
 * `local_date`. The only thing computed on this side is an hour's clock label,
 * from the location's own `utc_offset_seconds` — never the viewer's (#33).
 */

/**
 * The Today chart's span on the location's clock, 06:00 to 22:00 inclusive.
 * Fixed rather than "from now", so the chart reads as the shape of the day and
 * a reader at 15:00 still sees the morning they missed, drawn as past.
 */
export const TODAY_CHART_FROM = 6
export const TODAY_CHART_TO = 22

/** One hour of the Today chart. Every figure is nullable: a gap is drawn as a gap. */
export type ChartHour = {
  valid_at: string
  /** The hour on the location's clock, 6-22. */
  hour: number
  /** The deterministic run's, so it and the dew point are one model's pair. */
  tempC: number | null
  dewC: number | null
  /** Share of ensemble members wet, 0-100. `null` is unknown, never 0%. */
  chancePct: number | null
  windKmh: number | null
  /**
   * The hour's Crag A score, **suppressed exactly as every surface suppresses
   * it** (`summarizeReadings`): `null` under a Severe+ alert, while alerts
   * load, for a city, and for an hour the model did not read.
   */
  score: number | null
}

/** The location-clock hour of a UTC instant, or `null` when either input cannot be read. */
function localHour(validAt: string, utcOffsetSeconds: number): number | null {
  const t = Date.parse(validAt)
  if (!Number.isFinite(t) || !Number.isFinite(utcOffsetSeconds)) return null
  return new Date(t + utcOffsetSeconds * 1000).getUTCHours()
}

/**
 * Today's hours for the chart, 06:00-22:00, oldest first.
 *
 * `alerts` is `null` for a city — every hour then has no score
 * rather than an invented one. Readings join the hours **on `valid_at`**,
 * never on position, and an API older than `readings` scores nothing.
 */
export function todayChart(
  series: HourlySeries,
  todayDate: string,
  alerts: { severeAlertEvent: string | null; alertsPending: boolean } | null,
): ChartHour[] {
  const byInstant = new Map<string, HourlyReading>()
  if (alerts !== null) {
    for (const r of series.readings?.hours ?? []) byInstant.set(r.valid_at, r)
  }
  const out: ChartHour[] = []
  for (const h of series.hours) {
    if (h.local_date !== todayDate) continue
    const hour = localHour(h.valid_at, series.utc_offset_seconds)
    if (hour === null || hour < TODAY_CHART_FROM || hour > TODAY_CHART_TO) continue
    const reading = byInstant.get(h.valid_at) ?? null
    const score =
      alerts === null || reading === null
        ? null
        : summarizeReadings({
            reading,
            window: null,
            utcOffsetSeconds: series.utc_offset_seconds,
            severeAlertEvent: alerts.severeAlertEvent,
            alertsPending: alerts.alertsPending,
            unavailableReason: null,
          }).score
    out.push({
      valid_at: h.valid_at,
      hour,
      tempC: h.temp_c,
      dewC: h.dewpoint_c,
      chancePct: h.precip_chance_pct,
      windKmh: h.wind_kmh,
      score,
    })
  }
  return out
}

/**
 * The chart hour nearest `hour` (fractional, on the location's clock) that the
 * chart actually carries — what a tap at that point selects. Before anyone
 * taps, the readout shows `readingNow`'s hour instead, the one the hero prints.
 * `null` only for an empty chart.
 *
 * **The hour covering the moment, not the nearest mark**: 14:40 is the 14:00
 * hour. A missing hour is skipped for the nearest one present, so a gap in the
 * run never leaves the readout on nothing.
 */
export function chartHourAt(hours: readonly ChartHour[], hour: number): ChartHour | null {
  const want = Math.floor(hour)
  let best: ChartHour | null = null
  for (const h of hours) {
    if (best === null || Math.abs(h.hour - want) < Math.abs(best.hour - want)) best = h
  }
  return best
}

/**
 * A day's highest hourly chance of rain, the share of ensemble members wet.
 * `null` when no hour of that day carries a chance: unknown, never "0%".
 */
export function dayChance(hours: readonly HourlySample[], localDate: string): number | null {
  let max: number | null = null
  for (const h of hours) {
    if (h.local_date !== localDate || h.precip_chance_pct === null) continue
    max = max === null ? h.precip_chance_pct : Math.max(max, h.precip_chance_pct)
  }
  return max
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
  /** The day's good-hours span, `5am–11pm` or `None`. `null` where the day has no readings. */
  window: string | null
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
 * `null` for a city and while `/hourly` is in flight —
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
function dayReading(localDate: string, readings: DayReadings | null): { score: number | null; window: string | null } {
  const day = readings?.days.find((d) => d.local_date === localDate) ?? null
  if (readings === null || day === null) return { score: null, window: null }
  const summary = summarizeReadings({
    reading: day.best,
    window: day.window,
    utcOffsetSeconds: readings.utcOffsetSeconds,
    severeAlertEvent: readings.severeAlertEvent,
    alertsPending: readings.alertsPending,
    unavailableReason: null,
  })
  return { score: summary.score, window: summary.window?.value ?? null }
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
    const { score, window } = dayReading(row.forecast_date, readings)
    out.push({
      local_date: row.forecast_date,
      title,
      lowC: row.temp_c_min,
      highC: row.temp_c_max,
      score,
      window,
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

/**
 * `Today`, or `Tue 10/6`. The weekday alone is ambiguous a week out: on a
 * Wednesday, "None through Tue" read as yesterday.
 */
export function shortDate(isoDate: string, todayDate: string): string {
  const day = shortDay(isoDate, todayDate)
  if (day === 'Today' || day === isoDate) return day
  const [, m, d] = isoDate.split('-').map(Number)
  return `${day} ${m}/${d}`
}

/**
 * The Overview's "Last rain", **from the same summary as the Precip tab's
 * headline** — the four-model median and `REWETTING_PRECIP_MM`, hour by hour.
 * It once read the five-component drying model's archive figure, which counts
 * only days over 2 mm and measures from the end of the UTC day, so the two
 * tabs could name different storms for the same crag.
 *
 * `null` when the window has no hours: a gap in the record, not a dry week.
 */
export function lastRainText(summary: PrecipSummary, windowDays: number): string | null {
  const { lastReal, hoursSinceReal, endingLocal } = summary
  if (endingLocal === null) return null
  if (lastReal === null || hoursSinceReal === null) return `None in ${windowDays} days`
  // Real rain in the window's newest hour is still falling, as the Precip tab reads it.
  if (lastReal.valid_at_local === endingLocal) return 'Now'
  return `${formatSince(hoursSinceReal)} ago`
}
