import type { HourlyDay, HourlySample } from '@weatherteam6/types'
import { contiguousRuns, extent, unionExtent, type Extent, type Run } from './geometry.js'

/**
 * The wire shape turned into something a chart can draw, and nothing more.
 *
 * Kept separate from the components so the two decisions that actually carry
 * risk — which field is drawn, and what happens to a null — are testable
 * without rendering anything.
 */

/**
 * One hour, positioned in time.
 *
 * **Values stay in the canonical metric units the API returns** — °C and mm —
 * and are converted only by the formatter that writes a label. Unit conversion
 * is monotonic, so it changes nothing about the shape; doing it here instead
 * would mean thresholds (a measurable 0.1 mm, the rain-intensity ramp) had to
 * be restated in the other unit, which is how two numbers that must agree stop
 * agreeing.
 */
export type SeriesDatum = {
  /** Epoch milliseconds. The x position comes from this, never from the index. */
  t: number
  /** The location's own calendar day, straight from the server (issue #33). */
  localDate: string
  value: number | null
  /** Band edges. Both must be present for the band to draw at this hour. */
  low: number | null
  high: number | null
}

/** One local hour, in milliseconds. */
export const HOUR_MS = 3_600_000

/**
 * How far apart two samples may be and still be joined by a mark.
 *
 * An hour with no values at all is never stored, so a missing row leaves a
 * two-hour step between its neighbours — a real gap in the forecast, not a
 * shortcut between two good readings. 90 minutes joins consecutive hours and
 * breaks on the first one that is absent.
 */
export const MAX_JOIN_MS = 90 * 60_000

/**
 * Drops any hour whose instant cannot be read.
 *
 * `Date.parse` answers `NaN` for a malformed timestamp, and a NaN x coordinate
 * takes the whole path with it rather than just its own point.
 */
function toDatum(
  hour: HourlySample,
  value: number | null,
  low: number | null,
  high: number | null,
): SeriesDatum | null {
  const t = Date.parse(hour.valid_at)
  if (!Number.isFinite(t)) return null
  return { t, localDate: hour.local_date, value, low, high }
}

/**
 * Temperature as the **ensemble median with its p10-p90 band**, in °C.
 *
 * The band is the point of the chart: it is data this app holds and the
 * reference app does not, and a band that visibly narrows as a date approaches
 * is the product's stated purpose drawn rather than described. The deterministic
 * `temp_c` is deliberately not mixed in — a line from one source inside a band
 * from another would agree with it only by luck.
 */
export function temperatureSeries(hours: readonly HourlySample[]): SeriesDatum[] {
  return hours
    .map((h) => toDatum(h, h.temp_c_p50, h.temp_c_p10, h.temp_c_p90))
    .filter((d): d is SeriesDatum => d !== null)
}

/**
 * Hourly rainfall in mm, from the ensemble **mean**.
 *
 * `precip_mm_mean` is the only precipitation figure in the response that can be
 * added up: the mean of the members' totals is the total of the hourly means,
 * whereas a sum of hourly p50s is the median of nothing and reads three to
 * twelve times high (architecture rule). The bars are per-hour, but the moment a
 * reader adds two of them by eye the same rule applies.
 */
export function rainSeries(hours: readonly HourlySample[]): SeriesDatum[] {
  return hours
    .map((h) => toDatum(h, h.precip_mm_mean, null, null))
    .filter((d): d is SeriesDatum => d !== null)
}

/** Whether anything at all can be drawn — an all-null window is an empty state, not a blank chart. */
export function hasValues(data: readonly SeriesDatum[]): boolean {
  return extent(data.map((d) => d.value)) !== null
}

/** The vertical domain covering the line and its band, or `null` when nothing is drawable. */
export function valueExtent(data: readonly SeriesDatum[]): Extent | null {
  return unionExtent([
    extent(data.map((d) => d.value)),
    extent(data.map((d) => d.low)),
    extent(data.map((d) => d.high)),
  ])
}

/** The time span the chart covers, or `null` when there are no hours. */
export function timeExtent(data: readonly SeriesDatum[]): Extent | null {
  return extent(data.map((d) => d.t))
}

const adjacent =
  (data: readonly SeriesDatum[]) =>
  (previous: number, index: number): boolean => {
    const a = data[previous]
    const b = data[index]
    if (a === undefined || b === undefined) return false
    return b.t - a.t <= MAX_JOIN_MS
  }

/** Runs of hours with a value, unbroken in time. */
export function valueRuns(data: readonly SeriesDatum[]): Run[] {
  return contiguousRuns(
    data.length,
    (i) => {
      const d = data[i]
      return d !== undefined && d.value !== null
    },
    adjacent(data),
  )
}

/** Runs of hours where **both** band edges are present — a half-known band is not a band. */
export function bandRuns(data: readonly SeriesDatum[]): Run[] {
  return contiguousRuns(
    data.length,
    (i) => {
      const d = data[i]
      return d !== undefined && d.low !== null && d.high !== null
    },
    adjacent(data),
  )
}

/**
 * The ensemble size, but **only when every hour that has one reports the same
 * size**. Otherwise `null`.
 *
 * `member_count` is how many members reached *that hour*, and the far end of
 * the window is reached by fewer of them. Printing the largest as "143 forecast
 * runs" would attribute the whole band to a sample size most of it does not
 * have — the same class of claim as naming a model that did not answer. When
 * the counts differ, the legend says nothing about how many rather than
 * something that is true of only part of the chart.
 */
export function uniformMemberCount(hours: readonly HourlySample[]): number | null {
  let count: number | null = null
  for (const hour of hours) {
    if (hour.member_count === null) continue
    if (count === null) {
      count = hour.member_count
      continue
    }
    if (count !== hour.member_count) return null
  }
  return count
}

/** The first hour of each local day in the window, in order — the x-axis ticks. */
export function dayStarts(data: readonly SeriesDatum[]): SeriesDatum[] {
  const out: SeriesDatum[] = []
  let previous: string | null = null
  for (const d of data) {
    if (d.localDate !== previous) {
      out.push(d)
      previous = d.localDate
    }
  }
  return out
}

/**
 * The hours belonging to one local calendar day.
 *
 * Filters on the server's `local_date` rather than re-bucketing the instants,
 * for the reason that field exists at all: the day boundary belongs to the
 * crag's timezone, not the viewer's (issue #33).
 */
export function hoursOnDay(
  hours: readonly HourlySample[],
  localDate: string,
): HourlySample[] {
  return hours.filter((h) => h.local_date === localDate)
}

/**
 * Whether a day has anything the charts can draw.
 *
 * **`has_ensemble`, not `has_deterministic`.** Both charts on this screen read
 * the pooled ensemble — the median with its band, and `precip_mm_mean` — so a
 * day the deterministic model reached but no ensemble member did would open a
 * drill-down with two empty charts in it. `days[]` carries both flags precisely
 * because they answer different questions; this is the one the drill-down asks.
 */
export function dayIsDrawable(day: HourlyDay): boolean {
  return day.has_ensemble
}

/**
 * The first day a drill-down should open on: the first drawable one, or `null`
 * when none is.
 *
 * Not simply `days[0]` — the window's first local day is routinely the tail of
 * a run that has already passed, and opening on a day with nothing in it is the
 * same failure as making it tappable.
 */
export function firstDrawableDay(days: readonly HourlyDay[]): string | null {
  return days.find(dayIsDrawable)?.local_date ?? null
}
