import type { EnsembleRunHour } from '../runs/latestRuns.js'
import {
  bar,
  clockCell,
  HOUR_IN_MS,
  localHourInstant,
  precipCell,
  TIME_COL_WIDTH,
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
/**
 * Whether the ensemble said anything at all about this day.
 *
 * **Rows exist for every step whether or not the data reaches them** — the same
 * padding `dayHasData` guards against on the forecast side. Past the ensemble's
 * 168 h horizon `buildRainDay` still emits eight rows, every value null, and
 * `day.rows.length === 0` is false for all of them. Drawing that table put
 * eight rows of em dashes under the sentence *"No forecast reaches this day
 * yet"*, which contradicts itself.
 *
 * Found by rendering the panel against a live fetch, not by any test.
 */
export function rainDayHasData(day: RainDay): boolean {
  return day.rows.some((r) => r.odds_pct !== null || r.total_mm !== null)
}

export function renderRainTable(day: RainDay, units: TableUnits): string | null {
  if (!rainDayHasData(day)) return null

  const unit = units === 'imperial' ? 'in' : 'mm'
  const header = [
    'time'.padStart(TIME_COL_WIDTH),
    'chance'.padStart(6),
    ' '.repeat(CHANCE_BAR_WIDTH),
    `rain ${unit}`.padStart(8),
  ]
  const body = day.rows.map((row) =>
    [
      clockCell(row.hour),
      oddsCell(row.odds_pct).padStart(6),
      // 0–100 is a real fixed scale, unlike the temperature bar's — a chance
      // needs no "spans this day" caveat because the ends mean the same thing
      // every day.
      bar(row.odds_pct, 0, 100, CHANCE_BAR_WIDTH),
      precipCell(row.total_mm, units, 8),
    ].join(' '),
  )

  return [header.join(' '), ...body].join('\n')
}

/**
 * How wide the chance bar is.
 *
 * The bar replaced a standalone sparkline that drew the same eight values as an
 * unlabelled row of blocks above the table. Beside the number, in the row whose
 * clock time labels it, the same shape needs no legend and no axis: the hour is
 * the x label and the percentage is the y label, both already on screen.
 */
const CHANCE_BAR_WIDTH = 10

/**
 * The `⚙ More` table: how much rain the step's wettest hour brings at the dry,
 * middle and wet end of the forecasts — p10, p50 and p90 without ever printing
 * those names.
 *
 * **A second narrow table rather than three more columns on the first one.**
 * Bolting them on measured 36 characters against the 32 the width test asserts,
 * and `<pre>` scrolls sideways rather than wrapping, so the extra columns would
 * have gone off the edge of a phone silently. The forecast panel's `⚙ More`
 * splits for the same reason and the two now read the same way.
 *
 * `null` for a day with no steps at all, matching `renderRainTable` — a header
 * with nothing under it reads as a day with no rain rather than no data.
 */
export function renderRainSpreadTable(day: RainDay, units: TableUnits): string | null {
  if (!rainDayHasData(day)) return null

  const unit = units === 'imperial' ? 'in' : 'mm'
  const header = [
    'time'.padStart(TIME_COL_WIDTH),
    `dry ${unit}`.padStart(7),
    `mid ${unit}`.padStart(7),
    `wet ${unit}`.padStart(7),
  ].join(' ')
  const body = day.rows.map((row) =>
    [
      clockCell(row.hour),
      precipCell(row.precip_mm_p10, units, 7),
      precipCell(row.precip_mm_p50, units, 7),
      precipCell(row.precip_mm_p90, units, 7),
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
export function rainTableNote(interval: IntervalHours, detail: boolean): string {
  const base =
    interval === 1
      ? 'Each row covers the hour after it.'
      : `Each row covers the ${interval} h after it — chance is its wettest hour, rain is the whole step.`
  return detail
    ? `${base} Dry/mid/wet are that hour at the dry, middle and wet end of the forecasts.`
    : base
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
 * The last unbroken run of wet hours in a recent hourly series.
 *
 * **Why an episode and not just the last wet hour:** "it rained at 3am" and "it
 * rained from 11pm to 3am" are different facts about how wet the rock is, and
 * the second one is the one a climber needs. The run is extended backwards only
 * across hours that are *consecutive* — the series drops unmeasured hours, so
 * adjacency in the array is not adjacency in time, and treating it as such
 * would merge two separate showers into one long one.
 *
 * `total_mm` is the sum over the episode and comes from this same series, never
 * from the daily lookup. A gauge day-total and a reanalysed hourly total
 * disagree for the same date, and quoting one against the other's clock time
 * would put two sources in one sentence.
 */
export type RainEpisode = {
  /** Local date the episode ended on, `YYYY-MM-DD`. */
  readonly date: string
  /**
   * Local wall-clock hour the rain **began**, 0–23.
   *
   * **One hour before the first wet stamp**, because Open-Meteo stamps hourly
   * precipitation at the *end* of the hour it fell in — the same convention
   * `buildRows` and `buildRainDay` already follow. Wet stamps at 02:00 and
   * 03:00 are rain falling from 01:00 to 03:00, so reporting the stamps
   * verbatim would say "2am–3am" for a shower that started at 1am and
   * understate how long the rock has been wet.
   *
   * It can be later than `endHour` when the episode crossed midnight; `date` is
   * the day it *ended*, and the phrasing stays readable either way.
   */
  readonly startHour: number
  /** Local wall-clock hour the rain stopped, 0–23 — the last wet stamp. */
  readonly endHour: number
  readonly total_mm: number
}

type HourlyPrecipPoint = {
  /** `YYYY-MM-DDTHH:mm`, local. */
  readonly valid_at_local: string
  readonly precip_mm: number
}

/** `2026-09-02T03:00` → epoch ms read as UTC, for adjacency only. `null` if unparseable. */
function localStampMs(stamp: string): number | null {
  const ms = Date.parse(`${stamp}:00Z`)
  return Number.isFinite(ms) ? ms : null
}

export function lastRainEpisode(
  hours: readonly HourlyPrecipPoint[],
  thresholdMm: number,
): RainEpisode | null {
  let end = -1
  for (let i = hours.length - 1; i >= 0; i--) {
    const h = hours[i]
    if (h !== undefined && h.precip_mm >= thresholdMm) {
      end = i
      break
    }
  }
  if (end < 0) return null

  const last = hours[end]
  if (last === undefined) return null
  const lastMs = localStampMs(last.valid_at_local)
  if (lastMs === null) return null

  let start = end
  let total = last.precip_mm
  for (let i = end - 1; i >= 0; i--) {
    const h = hours[i]
    if (h === undefined || h.precip_mm < thresholdMm) break
    const ms = localStampMs(h.valid_at_local)
    const prevMs = localStampMs(hours[i + 1]?.valid_at_local ?? '')
    // Consecutive in *time*, not merely adjacent in the array.
    if (ms === null || prevMs === null || prevMs - ms !== HOUR_IN_MS) break
    start = i
    total += h.precip_mm
  }

  const startStamp = hours[start]?.valid_at_local
  if (startStamp === undefined) return null

  const firstStamp = Number(startStamp.slice(11, 13))
  const endHour = Number(last.valid_at_local.slice(11, 13))
  if (!Number.isInteger(firstStamp) || !Number.isInteger(endHour)) return null

  return {
    date: last.valid_at_local.slice(0, 10),
    // The stamp is the *end* of the hour the rain fell in. See `RainEpisode`.
    startHour: (firstStamp - 1 + 24) % 24,
    endHour,
    total_mm: total,
  }
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
  if (lookupFailed) return 'Last rain: couldn’t check the rainfall record just now.'
  if (lastRain === null) return `Last rain: none in the past ${windowDays} days.`

  const amount = describePrecip(lastRain.precip_mm, units)
  return `Last rain: ${relativeDay(lastRain.date, today)}, ${amount}.`
}

/** `today` / `yesterday` / `4 days ago`, each keeping the date it stands for. */
function relativeDay(date: string, today: string): string {
  const days = daysBetween(date, today)
  if (days === null) return date
  if (days <= 0) return `today (${date})`
  if (days === 1) return `yesterday (${date})`
  return `${days} days ago (${date})`
}

/**
 * The last-rain line when an hourly series reached it — a clock time instead of
 * a calendar day.
 *
 * *"Last rain: today"* was the complaint that produced this: rain that stopped
 * at 3am and rain still falling at 5pm read identically, and they are opposite
 * answers to "has the rock had time to dry". A single wet hour reads
 * *"3am today"*; a run reads *"11pm–3am"*, because how long it rained for
 * matters as much as when it stopped.
 *
 * The hour is rendered by `formatClockHour`, which the caller injects rather
 * than this module importing `panels.ts` — that import would be a cycle, since
 * `panels.ts` already imports this file.
 */
export function formatLastRainAt(
  episode: RainEpisode,
  today: string,
  units: TableUnits,
  formatClockHour: (hour: number) => string,
): string {
  const when = relativeDay(episode.date, today)
  const amount = describePrecip(episode.total_mm, units)
  // Always a span, never a single hour: one wet stamp still covers a whole
  // hour of rain, and `startHour` already accounts for the stamp convention.
  const span = `${formatClockHour(episode.startHour)}–${formatClockHour(episode.endHour)}`
  return `Last rain: ${span} ${when}, ${amount}.`
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
