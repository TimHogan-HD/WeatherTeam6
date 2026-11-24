import {
  cToF,
  kmhToMph,
  summarizeReadings,
  type ConditionsWindow,
  type HourlyReading,
  type HourlySeries,
  type SkyCondition,
} from '@weatherteam6/types'
import { HOUR_MS } from '../components/charts/hourlySeries.js'
import { mmToIn } from '../components/charts/rainBlocks.js'
import { dryHours } from './hourlyDay.js'

/**
 * The Hourly tab as rows (owner, 2026-11-24; mockup
 * `docs/handoffs/design-mockups/hourly-rows.html`, chips picker, rain per hour).
 * One row per hour of the open day, and a picker for which reading the rows show.
 *
 * **A row is the hour that starts at its label.** `6 AM` is 6 to 7 AM. The
 * instantaneous figures (temperature, humidity, dew point, wind, the score) are
 * the sample stamped at 6:00. The figures that cover an hour (chance of rain,
 * rain, sun, the sky) are stamped at the hour's **end** (`weather.md`), so they
 * come from the sample stamped 7:00 — the next day's midnight for the 11 PM row.
 * Reading them from the 6:00 stamp would put each shower an hour early.
 *
 * Every figure is `null` when its input is: a row prints a dash, never a zero.
 */

export type HourlyView = 'all' | 'temp' | 'rain' | 'wind' | 'sun'

export const HOURLY_VIEWS: readonly { key: HourlyView; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'temp', label: 'Temp' },
  { key: 'rain', label: 'Rain' },
  { key: 'wind', label: 'Wind' },
  { key: 'sun', label: 'Sun' },
]

export type HourRow = {
  /** The hour's start, epoch ms: the stamp the instantaneous figures carry. */
  ms: number
  validAt: string
  /** Ensemble median and its p10–p90, °F. */
  tempF: number | null
  lowF: number | null
  highF: number | null
  /** The deterministic model's (`HourlySeries.model`). */
  humidityPct: number | null
  dewF: number | null
  /** Share of ensemble members wet in the hour, 0–100. */
  chancePct: number | null
  /** Ensemble mean for the hour, inches. */
  rainIn: number | null
  /** Ensemble median, mph. */
  windMph: number | null
  /** The deterministic gust, never below the median it sits over (`gustSeries`), mph. */
  gustMph: number | null
  /** Where the wind blows from, degrees. Deterministic. */
  windFromDeg: number | null
  /** Minutes of bright sun in the hour; null is no answer. */
  sunMin: number | null
  /** The sun is up for some of the hour. Null when the sky series has no such hour. */
  daylight: boolean | null
  sky: SkyCondition | null
  /** Crag A at the hour's stamp; null for a city and for an unread hour. */
  score: number | null
}

export type HourRows = {
  rows: HourRow[]
  /** Scales printed in the column heads, so a bar's length always has a stated meaning. */
  scale: { lowF: number | null; highF: number | null; rainTopIn: number; windTopMph: number }
  /** The day's good hours, by row stamp, `to` the last good hour's (inclusive); null when no summary would name them. */
  good: { from: number; to: number; label: string } | null
  /**
   * True only when the readings scored this day (its representative hour has a
   * score) and found no window: the one case
   * "No good hours" may be said. A day the readings never reached, or a model that
   * did not answer, is a gap, not a day without good hours (defect class 2).
   */
  noGood: boolean
  /**
   * No member wet in any row's hour, read from the same end-of-hour samples the
   * rows print (`dryHours`). A row without its end sample is not dry.
   */
  dry: boolean
  /** True for a crag whose readings arrived; false for a city or a response without readings. */
  scored: boolean
}

const RAIN_FLOOR_IN = 0.1
const WIND_FLOOR_MPH = 40

const round = (v: number | null | undefined): number | null =>
  v === null || v === undefined || !Number.isFinite(v) ? null : Math.round(v)
const f = (c: number | null | undefined): number | null => (c === null || c === undefined ? null : cToF(c))
const mph = (kmh: number | null | undefined): number | null => (kmh === null || kmh === undefined ? null : kmhToMph(kmh))

/** The smallest step that holds `max`, never under `floor`, so a trace never draws a downpour's length. */
export function scaleTop(max: number, floor: number, steps: readonly number[]): number {
  if (!(max > floor)) return floor
  return steps.find((s) => s >= max) ?? Math.ceil(max)
}

export function hourRows(
  series: HourlySeries,
  localDate: string,
  scoring: { showScore: boolean },
  goodLabel: (window: ConditionsWindow) => string,
): HourRows {
  const byMs = new Map<number, HourlySeries['hours'][number]>()
  for (const h of series.hours) {
    const ms = Date.parse(h.valid_at)
    if (Number.isFinite(ms)) byMs.set(ms, h)
  }
  const sunByMs = new Map<number, NonNullable<HourlySeries['sky']>['sun'][number]>()
  for (const s of series.sky?.sun ?? []) {
    const ms = Date.parse(s.valid_at)
    if (Number.isFinite(ms)) sunByMs.set(ms, s)
  }
  const skyByMs = new Map<number, SkyCondition | null>()
  for (const s of series.sky?.hours ?? []) {
    const ms = Date.parse(s.valid_at)
    if (Number.isFinite(ms)) skyByMs.set(ms, s.sky)
  }

  const scored = scoring.showScore && series.readings !== undefined
  const readingByAt = new Map<string, HourlyReading>()
  for (const r of series.readings?.hours ?? []) readingByAt.set(r.valid_at, r)
  const scoreOf = (validAt: string): number | null => {
    if (!scored) return null
    const reading = readingByAt.get(validAt) ?? null
    if (reading === null) return null
    return summarizeReadings({
      reading,
      window: null,
      utcOffsetSeconds: series.utc_offset_seconds,
      unavailableReason: series.readings?.unavailable_reason ?? null,
    }).score
  }

  const rows: HourRow[] = series.hours
    .filter((h) => h.local_date === localDate)
    .map((h) => ({ h, ms: Date.parse(h.valid_at) }))
    .filter(({ ms }) => Number.isFinite(ms))
    .sort((a, b) => a.ms - b.ms)
    .map(({ h, ms }) => {
      const end = byMs.get(ms + HOUR_MS)
      const sun = sunByMs.get(ms + HOUR_MS)
      const wind = mph(h.wind_kmh_p50)
      const gustRaw = mph(h.wind_gust_kmh)
      const gust = gustRaw === null || wind === null ? gustRaw : Math.max(gustRaw, wind)
      const rainMm = end?.precip_mm_mean ?? null
      return {
        ms,
        validAt: h.valid_at,
        tempF: round(f(h.temp_c_p50)),
        lowF: round(f(h.temp_c_p10)),
        highF: round(f(h.temp_c_p90)),
        humidityPct: round(h.humidity_pct),
        dewF: round(f(h.dewpoint_c)),
        chancePct: round(end?.precip_chance_pct ?? null),
        rainIn: rainMm === null ? null : mmToIn(rainMm),
        windMph: round(wind),
        gustMph: round(gust),
        windFromDeg: h.wind_dir_deg ?? null,
        // Night is `daylight: false`, said as a word; no minutes figure stands in for it.
        sunMin: sun === undefined || !sun.daylight ? null : round(sun.sun_min),
        daylight: sun === undefined ? null : sun.daylight,
        sky: skyByMs.get(ms + HOUR_MS) ?? null,
        score: scoreOf(h.valid_at),
      }
    })

  const ends = rows.map((r) => byMs.get(r.ms + HOUR_MS))
  const dry = ends.every((e) => e !== undefined) && dryHours(ends.filter((e) => e !== undefined))

  const lows = rows.map((r) => r.lowF ?? r.tempF).filter((v): v is number => v !== null)
  const highs = rows.map((r) => r.highF ?? r.tempF).filter((v): v is number => v !== null)
  const maxRain = Math.max(0, ...rows.map((r) => r.rainIn ?? 0))
  const maxWind = Math.max(0, ...rows.map((r) => r.gustMph ?? r.windMph ?? 0))

  // The good hours only while the day's summary would name them, as the charts shaded them.
  let good: HourRows['good'] = null
  let noGood = false
  if (scored) {
    const day = (series.readings?.days ?? []).find((d) => d.local_date === localDate) ?? null
    const summary = summarizeReadings({
      reading: day?.best ?? null,
      window: day?.window ?? null,
      utcOffsetSeconds: series.utc_offset_seconds,
      unavailableReason: series.readings?.unavailable_reason ?? null,
    })
    const w = day?.window ?? null
    const from = w === null ? NaN : Date.parse(w.from)
    const to = w === null ? NaN : Date.parse(w.to)
    if (summary.window !== null && w !== null && Number.isFinite(from) && Number.isFinite(to)) {
      good = { from, to, label: goodLabel(w) }
    }
    // The server sends a day for every date, read or not, so an unread day arrives
    // as `window: null` too. Only a day with a scored representative hour was read.
    noGood = w === null && summary.score !== null
  }

  return {
    rows,
    scale: {
      lowF: lows.length === 0 ? null : Math.min(...lows),
      highF: highs.length === 0 ? null : Math.max(...highs),
      rainTopIn: scaleTop(maxRain, RAIN_FLOOR_IN, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1, 1.5, 2]),
      windTopMph: scaleTop(maxWind, WIND_FLOOR_MPH, [40, 50, 60, 80, 100]),
    },
    good,
    noGood,
    scored,
    dry,
  }
}

/** The first row still ahead: the one whose hour covers now. Rows before it fold away on today. */
export function firstAhead(rows: readonly HourRow[], nowMs: number): number {
  const i = rows.findIndex((r) => r.ms + HOUR_MS > nowMs)
  return i === -1 ? rows.length : i
}

/** A row's rain as a figure: `0`, `tr` under a hundredth, else `.04` or `1.2`. Null is a dash. */
export function rowInches(inches: number | null): string | null {
  if (inches === null) return null
  if (inches === 0) return '0'
  if (inches < 0.005) return 'tr'
  return inches < 0.995 ? inches.toFixed(2).replace(/^0/, '') : inches.toFixed(1)
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const
export function compass(deg: number | null): string | null {
  if (deg === null || !Number.isFinite(deg)) return null
  return COMPASS[((Math.round(deg / 45) % 8) + 8) % 8] ?? null
}

const VIEW_KEY = 'wt6.hourlyView'

/** The picker's view, remembered on this device; storage that throws or holds junk reads as `all`. */
export function savedView(): HourlyView {
  try {
    const v = window.localStorage.getItem(VIEW_KEY)
    return HOURLY_VIEWS.some((o) => o.key === v) ? (v as HourlyView) : 'all'
  } catch {
    return 'all'
  }
}

export function saveView(view: HourlyView): void {
  try {
    window.localStorage.setItem(VIEW_KEY, view)
  } catch {
    // Unavailable storage costs only the view on the next open.
  }
}
