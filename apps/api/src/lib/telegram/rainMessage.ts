import type { EnsembleRunHour } from '../runs/latestRuns.js'
import {
  HOUR_IN_MS,
  localHourInstant,
  precipCell,
  type IntervalHours,
  type TableUnits,
} from './forecastTable.js'

/**
 * `/rain`: what the 143 ensemble members say about one local day.
 *
 * **Pure** — everything here is arithmetic over `EnsembleRunHour[]`, so each
 * statistic can be tested against a fixture that threatens it.
 *
 * Three decisions that the numbers depend on, all of them because a percentile
 * is not additive:
 *
 * - **The probability is `members_wet / member_count`** — the share of members
 *   over 0.1 mm, computed from the members themselves. It is not
 *   `precipitation_probability`, which Probe A measured to be a blended field
 *   running past the horizon of the model it was requested with.
 * - **A step's percentiles come from one hour of it**, the wettest by ensemble
 *   mean. Summing p50 across three hours is not the median of the three-hour
 *   total, and printing it as though it were would be a fabricated number.
 * - **A total is the sum of hourly means**, which *is* exact: the mean of the
 *   members' totals is the total of the members' means. That is why
 *   `precip_mm_mean` is stored at all.
 */

/** What a step of the day says about rain. Every field is nullable and means it. */
export type RainRow = {
  /** Local wall-clock hour the step starts at. */
  readonly hour: number
  /** Share of members with measurable rain, 0–100, at the step's wettest hour. `null` when no member reported. */
  readonly odds_pct: number | null
  readonly precip_mm_p10: number | null
  readonly precip_mm_p50: number | null
  readonly precip_mm_p90: number | null
  /** The whole step's expected accumulation — the sum of its hourly means. */
  readonly total_mm: number | null
  /** Members behind the step's wettest hour, so a thinning ensemble is visible. */
  readonly member_count: number
}

export type RainDay = {
  readonly rows: readonly RainRow[]
  /** Sum of the day's hourly means. `null` when the day has no ensemble hours at all. */
  readonly total_mm: number | null
  /** Highest hourly chance across the day, 0–100, or `null` when none could be computed. */
  readonly peak_odds_pct: number | null
  /** The step that peak belongs to, or `null` when nothing crossed the threshold. */
  readonly peak_hour: number | null
  /** Member counts seen across the day, for the header line. */
  readonly member_min: number | null
  readonly member_max: number | null
}

/**
 * A day the ensemble said nothing about at all.
 *
 * Distinct from a day of zeroes: `buildRainDay` emits a row per step whether or
 * not data reaches it, which is right for a day that runs past a horizon and
 * wrong for a point with no ensemble run behind it.
 */
export const EMPTY_RAIN_DAY: RainDay = {
  rows: [],
  total_mm: null,
  peak_odds_pct: null,
  peak_hour: null,
  member_min: null,
  member_max: null,
}

/**
 * The hours whose precipitation falls **inside** a step starting at `hour`.
 *
 * Open-Meteo stamps precipitation at the end of the hour it fell in, so the step
 * 12:00–15:00 is the hours stamped 13, 14 and 15. The forecast table uses the
 * same convention, and the two views have to agree about which rain belongs to
 * which row.
 */
function stepHours(
  byInstant: Map<number, EnsembleRunHour>,
  localDate: string,
  hour: number,
  interval: number,
  utcOffsetSeconds: number,
): EnsembleRunHour[] {
  const start = localHourInstant(localDate, hour, utcOffsetSeconds)
  if (start === null) return []

  const out: EnsembleRunHour[] = []
  for (let step = 1; step <= interval; step++) {
    const found = byInstant.get(start + step * HOUR_IN_MS)
    if (found) out.push(found)
  }
  return out
}

/**
 * The share of members with measurable rain, as a percentage.
 *
 * `null` when the wet count was never recorded (a run stored before the column
 * existed) or when no member reached this hour. **Not 0** — "no member expects
 * rain" and "nobody was asked" are different answers and only one of them is a
 * forecast.
 */
export function oddsPct(hour: EnsembleRunHour): number | null {
  if (hour.members_wet === null || hour.member_count <= 0) return null
  return (hour.members_wet / hour.member_count) * 100
}

/** The hour a step is summarised by: the wettest by ensemble mean, earliest on a tie. */
function wettestHour(hours: readonly EnsembleRunHour[]): EnsembleRunHour | null {
  let best: EnsembleRunHour | null = null
  let bestMean = -Infinity
  for (const h of hours) {
    if (h.precip_mm_mean === null) continue
    if (h.precip_mm_mean > bestMean) {
      best = h
      bestMean = h.precip_mm_mean
    }
  }
  // Every hour of the step had a null mean: fall back to the first hour that
  // reported members at all, so odds and member counts are still shown.
  return best ?? hours.find((h) => h.member_count > 0) ?? null
}

function sumMeans(hours: readonly EnsembleRunHour[]): number | null {
  let total: number | null = null
  for (const h of hours) {
    if (h.precip_mm_mean === null) continue
    total = (total ?? 0) + h.precip_mm_mean
  }
  return total
}

/**
 * Slice one local day of ensemble hours into steps.
 *
 * Rows are emitted for every step of the day, present in the data or not, for
 * the same reason the forecast table does it: a table that stops at the model's
 * horizon looks like a day that stops there.
 */
export function buildRainDay(
  hours: readonly EnsembleRunHour[],
  utcOffsetSeconds: number,
  localDate: string,
  interval: IntervalHours,
): RainDay {
  const byInstant = new Map<number, EnsembleRunHour>()
  for (const h of hours) byInstant.set(h.valid_at.getTime(), h)

  const rows: RainRow[] = []
  const dayHours: EnsembleRunHour[] = []

  for (let hour = 0; hour < 24; hour += interval) {
    const inStep = stepHours(byInstant, localDate, hour, interval, utcOffsetSeconds)
    dayHours.push(...inStep)

    const wettest = wettestHour(inStep)
    rows.push({
      hour,
      odds_pct: wettest === null ? null : oddsPct(wettest),
      precip_mm_p10: wettest?.precip_mm_p10 ?? null,
      precip_mm_p50: wettest?.precip_mm_p50 ?? null,
      precip_mm_p90: wettest?.precip_mm_p90 ?? null,
      total_mm: sumMeans(inStep),
      member_count: wettest?.member_count ?? 0,
    })
  }

  let peakOdds: number | null = null
  let peakHour: number | null = null
  for (const row of rows) {
    if (row.odds_pct === null) continue
    if (peakOdds === null || row.odds_pct > peakOdds) {
      peakOdds = row.odds_pct
      peakHour = row.hour
    }
  }

  const counts = dayHours.map((h) => h.member_count).filter((n) => n > 0)

  return {
    rows,
    total_mm: sumMeans(dayHours),
    peak_odds_pct: peakOdds,
    // Nothing crossed the threshold anywhere in the day: there is no timing to
    // report, and reporting hour 0 at 0% would read as a forecast for midnight.
    peak_hour: peakOdds !== null && peakOdds > 0 ? peakHour : null,
    member_min: counts.length === 0 ? null : Math.min(...counts),
    member_max: counts.length === 0 ? null : Math.max(...counts),
  }
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const GAP = '—'

function oddsCell(pct: number | null): string {
  return (pct === null ? GAP : `${Math.round(pct)}%`).padStart(5)
}

/**
 * The table body, unescaped and without the `<pre>` wrapper.
 *
 * `null` for a day with no steps at all — a header with nothing under it reads
 * as a day with no rain rather than a day with no data.
 */
export function renderRainTable(day: RainDay, units: TableUnits): string | null {
  if (day.rows.length === 0) return null

  // Five-wide value columns, so the whole row is 32 characters. A `<pre>` block
  // scrolls sideways on a phone rather than wrapping, and the nine-column width
  // finding in telegram-render.md was measured on a *rich* table, not this path.
  const unit = units === 'imperial' ? 'in' : 'mm'
  const header = [
    'hh',
    'odds'.padStart(5),
    `tot${unit}`.padStart(5),
    'p10'.padStart(5),
    'p50'.padStart(5),
    'p90'.padStart(5),
  ].join(' ')

  const body = day.rows.map((row) =>
    [
      String(row.hour).padStart(2, '0'),
      oddsCell(row.odds_pct),
      precipCell(row.total_mm, units, 5),
      precipCell(row.precip_mm_p10, units, 5),
      precipCell(row.precip_mm_p50, units, 5),
      precipCell(row.precip_mm_p90, units, 5),
    ].join(' '),
  )

  return [header, ...body].join('\n')
}

/**
 * What the columns mean, in one sentence, because none of them is obvious.
 *
 * The percentiles describe one hour and the total describes the whole step; a
 * reader who assumes the percentiles are step totals would read them as three to
 * twelve times the rain they represent.
 */
export function rainTableNote(interval: IntervalHours): string {
  const span = interval === 1 ? 'the hour' : `the ${interval} h`
  return `odds and p10/p50/p90 are the wettest hour of ${span} after each row; tot is that whole step.`
}

/**
 * An amount of precipitation as prose, for a sentence rather than a cell.
 *
 * Wraps `precipCell` so the table and the lines under it round identically, and
 * turns its `t` into words — "t in" is not a sentence, and the distinction it
 * marks is worth keeping: a trace is not `0.00 in`, which is the value that
 * means it did not rain.
 */
export function describePrecip(mm: number, units: TableUnits): string {
  const cell = precipCell(mm, units, 0).trim()
  if (cell === 't') return 'a trace'
  return `${cell} ${units === 'imperial' ? 'in' : 'mm'}`
}

export type LastRain = {
  /** `YYYY-MM-DD`, the local calendar day the rain was recorded against. */
  readonly date: string
  readonly precip_mm: number
}

/**
 * The "time since last rain" line.
 *
 * Three outcomes, and they must read differently. A **failed** lookup says so —
 * this is issue #34's lesson: a swallowed rainfall error that renders as a dry
 * spell is an upstream outage improving the forecast. A **successful** lookup
 * with nothing in it says the window is dry and names the window, because "no
 * rain" is only meaningful with a horizon on it. Anything else names the day and
 * the amount.
 *
 * Days, not hours: the source is a daily record, and an hours figure would
 * assert a precision the measurement does not have.
 */
export function formatLastRain(
  lastRain: LastRain | null,
  lookupFailed: boolean,
  windowDays: number,
  today: string,
  units: TableUnits,
): string {
  if (lookupFailed) return 'Last rain: the rainfall record could not be read just now.'
  if (lastRain === null) return `Last rain: none recorded in the past ${windowDays} days.`

  const amount = describePrecip(lastRain.precip_mm, units)
  const days = daysBetween(lastRain.date, today)
  const when =
    days === null ? '' : days <= 0 ? ' (today)' : days === 1 ? ' (yesterday)' : ` (${days} days ago)`
  return `Last rain: ${lastRain.date}, ${amount}${when}.`
}

/**
 * Whole days between two `YYYY-MM-DD` strings, or `null` if either is not one.
 *
 * Both are local calendar days already, so they are compared as dates and never
 * converted through a clock — the offset was applied when they were built.
 */
export function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00Z`)
  const b = Date.parse(`${to}T00:00:00Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round((b - a) / (24 * HOUR_IN_MS))
}
