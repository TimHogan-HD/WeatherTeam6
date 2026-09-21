import { CURRENT_HOUR_TOLERANCE_MS } from '@weatherteam6/types'
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
 * One hour's mark: the instant, and every gap normalised to `null`.
 *
 * Drops any hour whose instant cannot be read. `Date.parse` answers `NaN` for a
 * malformed timestamp, and a NaN x coordinate takes the whole path with it
 * rather than just its own point.
 *
 * **`?? null` is not belt-and-braces here, and it was found in production.**
 * The types say `number | null`, but a response served by an API deployment
 * older than the client simply omits a column that has just been added — and
 * `undefined` is not `null`, so every `=== null` guard downstream waves it
 * through. The rain whiskers went straight to `y(undefined)` and stroked
 * `y1="NaN"`: no error, no warning in the browser, just a chart missing marks
 * it believed it had drawn. The two deploys are never simultaneous, so this
 * window happens on every release that adds a field.
 */
function toDatum(
  hour: HourlySample,
  value: number | null | undefined,
  low: number | null | undefined,
  high: number | null | undefined,
): SeriesDatum | null {
  const t = Date.parse(hour.valid_at)
  if (!Number.isFinite(t)) return null
  return {
    t,
    localDate: hour.local_date,
    value: value ?? null,
    low: low ?? null,
    high: high ?? null,
  }
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
 * **A point marks the hour it is stamped at, which is the hour it *ends*.**
 * Rain stamped 15:00 fell between 14:00 and 15:00 (architecture rule); as bars
 * these spanned that interval, and as a line they sit at its end. Plotting them
 * half an hour earlier — the bar's old centre — is more faithful to a single
 * point but shifts this chart's whole x-domain half a slot against the
 * temperature chart stacked above it, which is worse on a phone than thirty
 * minutes on a 24-hour axis. The axis is labelled and the convention is the
 * API's own.
 *
 * `precip_mm_mean` is the only precipitation figure in the response that can be
 * added up: the mean of the members' totals is the total of the hourly means,
 * whereas a sum of hourly p50s is the median of nothing and reads three to
 * twelve times high (architecture rule). The bars are per-hour, but the moment a
 * reader adds two of them by eye the same rule applies.
 *
 * **The band is `precip_mm_p10`-`precip_mm_p90` for that one hour**, and the
 * mean can sit outside it. When nine members in ten are dry and one forecasts a
 * downpour, both percentiles are 0 while the mean is not — a band flat on the
 * floor under a line that lifts off it, which is exactly the disagreement a
 * reader needs to see. Neither percentile may be summed or printed as a total;
 * see `HourlySample`.
 */
export function rainSeries(hours: readonly HourlySample[]): SeriesDatum[] {
  return hours
    .map((h) => toDatum(h, h.precip_mm_mean, h.precip_mm_p10, h.precip_mm_p90))
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

/**
 * Chance of rain, as a percentage of ensemble members.
 *
 * `precip_chance_pct` is `members_wet / member_count`, divided **server-side** so
 * there is one rounding rule rather than one per client. It is deliberately not
 * Open-Meteo's `precipitation_probability`, which is a blended field no single
 * model owns (architecture rule).
 *
 * **Null means unknown, not 0%** — a row stored before `members_wet` existed has
 * no wet count, and so does an hour no member reached. `toDatum` carries the
 * null through and every mark drops it, so an unknown hour is a gap rather than
 * a confident "no chance of rain".
 */
export function chanceSeries(hours: readonly HourlySample[]): SeriesDatum[] {
  return hours
    .map((h) => toDatum(h, h.precip_chance_pct, null, null))
    .filter((d): d is SeriesDatum => d !== null)
}

/**
 * Wind, as the ensemble median with the **deterministic gust** as the upper edge.
 *
 * `low` is the median itself rather than `wind_kmh_p10`, so the mark spans
 * sustained-to-gusting rather than the ensemble spread — that is what the
 * design asks for, and it is the pair a climber reads together.
 *
 * **Two sources in one mark, and it is labelled as such.** `wind_kmh_p50` is
 * pooled across members; `wind_gust_kmh` is the single chosen deterministic
 * model, because the ensemble carries no gust field at all. A gust below the
 * median is the two disagreeing, and the edge is clamped rather than drawn
 * inverted — an upside-down whisker would read as a negative gust.
 */
export function windSeries(hours: readonly HourlySample[]): SeriesDatum[] {
  return hours
    .map((h) => toDatum(h, h.wind_kmh_p50, null, null))
    .filter((d): d is SeriesDatum => d !== null)
}

/**
 * The ensemble's own spread in sustained wind — p10 to p90 for each hour.
 *
 * **A separate series from `windSeries`, because the two mean different
 * things.** That one's low/high are sustained-to-gust: a gust is a different
 * variable, not a disagreement between forecasts. This one is the
 * disagreement, and the chart draws both — a band for how much the runs differ,
 * a whisker for how hard it may blow inside any one of them.
 *
 * `value` carries p50 so the band and the marks line up on the same hours; the
 * chart reads only `low` and `high` from it.
 */
export function windSpreadSeries(hours: readonly HourlySample[]): SeriesDatum[] {
  return hours
    .map((h) => toDatum(h, h.wind_kmh_p50, h.wind_kmh_p10, h.wind_kmh_p90))
    .filter((d): d is SeriesDatum => d !== null)
}

/**
 * How far from `now` an hour may be and still be called the current conditions.
 *
 * **Re-exported, not redeclared.** `readingNow` in `packages/types` answers the
 * same question about the v2 readings, and two copies of this number is how one
 * surface comes to call an hour "now" that another has already moved past.
 */
export { CURRENT_HOUR_TOLERANCE_MS }

/**
 * The hour covering `now`, or `null` when the run does not reach it.
 *
 * **This is the first thing in the app entitled to say "now".** Every other
 * surface shows `temp_c_max`, a daily *maximum*, and labelling that a present
 * reading is a factual error the design spec names explicitly — Red Rock's
 * 39.5 °C is today's high, not the temperature outside. The hourly run is the
 * first source with an hour in it.
 *
 * `null` rather than the nearest hour when nothing is close: a stored run can be
 * an hour old and a stale one much older, and "now" attached to a reading from
 * three hours ago is the same class of claim as naming a model that did not
 * answer. The caller shows the daily figures instead.
 */
export function currentHour(
  hours: readonly HourlySample[],
  now: number,
): HourlySample | null {
  let best: HourlySample | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const hour of hours) {
    const t = Date.parse(hour.valid_at)
    if (!Number.isFinite(t)) continue
    const distance = Math.abs(t - now)
    if (distance < bestDistance) {
      bestDistance = distance
      best = hour
    }
  }
  return bestDistance <= CURRENT_HOUR_TOLERANCE_MS ? best : null
}

/**
 * One local day's ensemble spread in temperature, from the hourly run.
 *
 * **The daily rows have no spread of their own to draw.** `ForecastSnapshot`
 * carries `temp_c_min`/`temp_c_max`, which are already the *median* of each
 * member's own daily extreme (architecture rule — never a global `Math.max`),
 * so there is no p10 or p90 on that row to widen them with. The hourly
 * response, which the Daily tab already fetches for its drill-down, has one per
 * hour; the coldest p10 and the warmest p90 of a day are that day's spread.
 *
 * `null` when the run does not reach the day, which is the common case for the
 * far end of the week — and it must stay distinguishable from a day the models
 * agree exactly on, where the band is real and narrow.
 */
export function daySpread(
  hours: readonly HourlySample[],
  localDate: string,
): { from: number; to: number } | null {
  const own = hours.filter((h) => h.local_date === localDate)
  const low = extent(own.map((h) => h.temp_c_p10))
  const high = extent(own.map((h) => h.temp_c_p90))
  if (low === null || high === null) return null
  return { from: low.min, to: high.max }
}

/**
 * The gusts, as their own line over the sustained one.
 *
 * **A second series rather than a second field, because the charts are lines
 * now and a line has one value per hour.** The gust used to be the upper end of
 * a whisker over each bar; with bars gone it needs somewhere to live, and the
 * band under it is the ensemble's disagreement — a different thing that must
 * not be confused with how hard it may blow.
 */
export function gustSeries(hours: readonly HourlySample[]): SeriesDatum[] {
  return hours
    .map((h) => {
      const gust = h.wind_gust_kmh
      const sustained = h.wind_kmh_p50
      // A gust below the sustained wind is not a gust. Clamping rather than
      // dropping it keeps the line continuous through an hour where the
      // deterministic model and the ensemble median disagree slightly.
      const top = gust === null || sustained === null ? gust : Math.max(gust, sustained)
      return toDatum(h, top, null, null)
    })
    .filter((d): d is SeriesDatum => d !== null)
}
