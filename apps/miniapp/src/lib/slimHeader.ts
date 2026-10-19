import {
  EM_DASH,
  WINDOW_LABEL,
  cToF,
  formatPrecipIn,
  formatTempF,
  kmhToMph,
  readingNow,
  summarizeReadings,
  type ForecastSnapshot,
  type HourlyReading,
  type HourlySample,
} from '@weatherteam6/types'
import type { DetailTab } from '../components/DetailView.js'
import { formatLocalHour, formatTempDeg } from './format.js'
import { formatWeekday } from './forecast.js'
import { dayChance, dayTitle, scoredDays, type DayReadings } from './overview.js'

/**
 * The slim header's figure: the key number of the tab under it, beside the
 * crag's name (`docs/handoffs/miniapp-hybrid-transition-v1.md`, owner
 * 2026-10-19). Overview has none of its own: the hero is its header.
 */
export type SlimFigure = {
  /** Rounded. `null` renders a dash — a gap, never a 0. */
  value: number | null
  unit: '%' | '°' | null
  /** What the figure is, under it: `best day`, `chance today`. */
  label: string
  /** How it is coloured: by the score's rung, as rain, or as plain ink. */
  tone: 'score' | 'rain' | 'plain'
  /** The line under the name: labelled values, never a sentence. `null` when there is nothing to say. */
  line: string | null
}

export type SlimInputs = {
  isClimbingLocation: boolean
  forecast: readonly ForecastSnapshot[] | undefined
  /** The location's local today, from the forecast's `is_today`. */
  todayDate: string | null
  /**
   * The day scores, suppressed through `summarizeReadings` as everywhere else.
   * `null` for a city and while `/hourly` is in flight.
   */
  readings: DayReadings | null
  /** The hourly run's hours; empty while it loads. */
  hours: readonly HourlySample[]
  /** The day open on Hourly. */
  selectedDate: string | null
  /** The hour Hourly is reading, epoch ms: the scrub, or its default. `null` while `/hourly` loads. */
  readMs: number | null
  /** The hourly readings, joined to `hours` on `valid_at`. Empty for a city and while `/hourly` loads. */
  hourReadings: readonly HourlyReading[]
  /** The hourly run's, for the read hour's clock. `null` while `/hourly` loads. */
  utcOffsetSeconds: number | null
  nowMs: number
}

/**
 * Daily: the best day ahead by its score. Hourly: the hour the charts are
 * reading, with every figure they draw for it. Precip: today's highest hourly
 * chance of rain. Rock: how far air sits above its dew point, now. Crag:
 * today's score. A city has no score, so its Daily carries the day's high and
 * its Hourly the hour's air temperature.
 */
export function slimFigure(tab: Exclude<DetailTab, 'overview'>, i: SlimInputs): SlimFigure {
  switch (tab) {
    case 'daily':
      return i.isClimbingLocation ? bestDay(i) : dayHigh(i, i.todayDate, 'high today')
    case 'hourly':
      return hourRead(i)
    case 'precip':
      return {
        value: i.todayDate === null ? null : dayChance(i.hours, i.todayDate),
        unit: '%',
        label: 'chance today',
        tone: 'rain',
        line: null,
      }
    case 'rock':
      return dewMargin(i)
    case 'crag':
      return dayScore(i, i.todayDate, 'today')
  }
}

function rowsFrom(i: SlimInputs, fromDate: string | null): ForecastSnapshot[] {
  if (i.forecast === undefined || fromDate === null) return []
  return [...i.forecast]
    .filter((row) => row.forecast_date >= fromDate)
    .sort((a, b) => a.forecast_date.localeCompare(b.forecast_date))
}

function dayLine(title: string, window: string | null): string {
  return window === null ? title : `${title} · ${WINDOW_LABEL}: ${window}`
}

/** The highest-scoring day from today on; the earlier of two that tie. */
function bestDay(i: SlimInputs): SlimFigure {
  let best: { score: number; title: string; window: string | null } | null = null
  for (const day of scoredDays(rowsFrom(i, i.todayDate), i.readings)) {
    if (day.score !== null && (best === null || day.score > best.score)) best = { ...day, score: day.score }
  }
  return {
    value: best?.score ?? null,
    unit: null,
    label: 'best day',
    tone: 'score',
    line: best === null ? null : dayLine(best.title, best.window),
  }
}

function dayScore(i: SlimInputs, date: string | null, label: string): SlimFigure {
  const row = date === null ? undefined : i.forecast?.find((r) => r.forecast_date === date)
  const day = row === undefined ? null : (scoredDays([row], i.readings)[0] ?? null)
  return {
    value: day?.score ?? null,
    unit: null,
    label,
    tone: 'score',
    line: day === null ? null : dayLine(day.title, day.window),
  }
}

const mph = (kmh: number | null): string => (kmh === null ? EM_DASH : String(Math.round(kmhToMph(kmh))))

/**
 * The hour the Hourly charts are reading: its score, suppressed as everywhere
 * else, and one line of what the charts draw at it. Air and dew point share a
 * label, as they share the readout row in the mockup.
 *
 * A city has no score, so its figure is the hour's air temperature.
 */
function hourRead(i: SlimInputs): SlimFigure {
  const sample = i.readMs === null ? undefined : i.hours.find((h) => Date.parse(h.valid_at) === i.readMs)
  const offset = i.utcOffsetSeconds
  if (sample === undefined || offset === null || i.readMs === null) {
    return { value: null, unit: null, label: 'hour', tone: i.isClimbingLocation ? 'score' : 'plain', line: null }
  }
  const day = sample.local_date === i.todayDate ? 'Today' : formatWeekday(sample.local_date)
  const label = `${day} ${formatLocalHour(i.readMs, offset) ?? EM_DASH}`
  const line = [
    `Air / dew: ${formatTempDeg(sample.temp_c)} / ${formatTempDeg(sample.dewpoint_c)}`,
    `Rain: ${formatPrecipIn(sample.precip_mm_mean)}, ${sample.precip_chance_pct === null ? EM_DASH : `${sample.precip_chance_pct}%`}`,
    `Humidity: ${sample.humidity_pct === null ? EM_DASH : `${Math.round(sample.humidity_pct)}%`}`,
    `Wind / gusts: ${mph(sample.wind_kmh)} / ${mph(sample.wind_gust_kmh)} mph`,
  ].join(' · ')

  if (!i.isClimbingLocation) {
    return {
      value: sample.temp_c === null ? null : Math.round(cToF(sample.temp_c)),
      unit: '°',
      label,
      tone: 'plain',
      line,
    }
  }
  const reading = i.hourReadings.find((r) => r.valid_at === sample.valid_at) ?? null
  const score =
    i.readings === null
      ? null
      : summarizeReadings({
          reading,
          window: null,
          utcOffsetSeconds: offset,
          severeAlertEvent: i.readings.severeAlertEvent,
          alertsPending: i.readings.alertsPending,
          unavailableReason: null,
        }).score
  const withheld =
    i.readings !== null && i.readings.severeAlertEvent !== null && reading !== null && reading.score !== null
  return {
    value: score,
    unit: null,
    label,
    tone: 'score',
    line: withheld ? `${line} · Alert: score withheld` : line,
  }
}

function dayHigh(i: SlimInputs, date: string | null, label: string): SlimFigure {
  const row = date === null ? undefined : i.forecast?.find((r) => r.forecast_date === date)
  const high = row?.temp_c_max ?? null
  return {
    value: high === null ? null : Math.round(cToF(high)),
    unit: '°',
    label,
    tone: 'plain',
    line: row === undefined ? null : dayTitle(row.forecast_date),
  }
}

/**
 * Air minus dew point, now, in °F. **Taken from the two figures as printed** —
 * each rounded to a whole °F first — so the margin always equals the
 * difference of the numbers on the line beside it. Rounding the raw interval
 * instead puts `16°` beside `Air 54°F · Dew point 39°F`.
 */
function dewMargin(i: SlimInputs): SlimFigure {
  const hour = readingNow(i.hours, i.nowMs)
  const air = hour?.temp_c ?? null
  const dew = hour?.dewpoint_c ?? null
  return {
    value: air === null || dew === null ? null : Math.round(cToF(air)) - Math.round(cToF(dew)),
    unit: '°',
    label: 'above dew point',
    tone: 'plain',
    line: hour === null ? null : `Air: ${formatTempF(air)} · Dew point: ${formatTempF(dew)}`,
  }
}
