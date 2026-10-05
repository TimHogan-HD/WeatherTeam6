import {
  agreementShare,
  ROCK_LABELS,
  cToFDelta,
  formatPrecipIn,
  mmToIn,
  rainChanceShare,
  summarizeReadings,
  type HourlyReading,
  type OutlookDay,
  type ReadingsSummary,
  type Trip,
  type TripDayForecast,
  type TripOutlook,
  type TripTrendPoint,
} from '@weatherteam6/types'
import type { DayReadings } from './overview.js'

/**
 * The Trips tab's logic, apart from its markup. Pure, so each rule is reachable
 * by a test; the app's tests have no DOM.
 *
 * **Two sources, one per figure.** A day's score and its Dryness and Friction
 * words come from the crag's own `/hourly` readings, through `summarizeReadings`
 * exactly as the crag screens read them; its high, low, chance and amount come
 * from the trip outlook for every day, so no tile mixes two sources for one
 * figure. Both are joined on `local_date`, never on position.
 *
 * **"Today" is the device's date** wherever a trip-level phrase needs one ("in 6
 * days", "Forecast opens"): a future trip's outlook carries no `is_today` row to
 * read, and a crag a time zone away is off by a day at most around midnight.
 */

const DAY_MS = 86_400_000

/** Readings reach today and six days on (`/hourly`), so a day is scored six days ahead. */
export const SCORED_DAYS_AHEAD = 6
/** The outlook reaches today and fifteen days on. */
export const OUTLOOK_DAYS_AHEAD = 15

function parseIso(iso: string): number | null {
  const [y, m, d] = iso.split('-').map(Number)
  if (y === undefined || m === undefined || d === undefined) return null
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  return Date.UTC(y, m - 1, d)
}

/** `YYYY-MM-DD` plus `n` calendar days. */
export function addDays(iso: string, n: number): string {
  const t = parseIso(iso)
  if (t === null) return iso
  return new Date(t + n * DAY_MS).toISOString().slice(0, 10)
}

/** Whole days from `from` to `to`. */
export function daysBetween(from: string, to: string): number | null {
  const a = parseIso(from)
  const b = parseIso(to)
  if (a === null || b === null) return null
  return Math.round((b - a) / DAY_MS)
}

/** The device's calendar date. */
export function deviceToday(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Every date of the trip, first to last. Empty for dates that cannot be read or run backwards. */
export function tripDates(start: string, end: string): string[] {
  const n = daysBetween(start, end)
  if (n === null || n < 0) return []
  return Array.from({ length: n + 1 }, (_, i) => addDays(start, i))
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** `{ weekday: 'Thu', day: 8, month: 'Oct' }`, read in UTC to match the date it came from. */
export function dateParts(iso: string): { weekday: string; day: number; month: string } | null {
  const t = parseIso(iso)
  if (t === null) return null
  const date = new Date(t)
  return {
    weekday: WEEKDAYS[date.getUTCDay()] ?? '',
    day: date.getUTCDate(),
    month: MONTHS[date.getUTCMonth()] ?? '',
  }
}

/** `Thu 8`. */
export function shortDayLabel(iso: string): string {
  const p = dateParts(iso)
  return p === null ? iso : `${p.weekday} ${p.day}`
}

/** `Thu 8 Oct`. */
export function dayMonthLabel(iso: string): string {
  const p = dateParts(iso)
  return p === null ? iso : `${p.weekday} ${p.day} ${p.month}`
}

/** `8 Oct`. */
export function dateLabel(iso: string): string {
  const p = dateParts(iso)
  return p === null ? iso : `${p.day} ${p.month}`
}

/** `Thu 8 – Sat 10 Oct`, or `Wed 30 Sep – Sat 3 Oct` across a month, or one day alone. */
export function formatTripDates(start: string, end: string): string {
  const a = dateParts(start)
  const b = dateParts(end)
  if (a === null || b === null) return `${start} – ${end}`
  if (start === end) return dayMonthLabel(start)
  const first = a.month === b.month ? `${a.weekday} ${a.day}` : dayMonthLabel(start)
  return `${first} – ${dayMonthLabel(end)}`
}

/** `in 6 days`, `tomorrow`, `today`, `underway` or `ended`, from `today`. */
export function tripTiming(trip: Pick<Trip, 'startDate' | 'endDate'>, today: string): string | null {
  const toStart = daysBetween(today, trip.startDate)
  const toEnd = daysBetween(today, trip.endDate)
  if (toStart === null || toEnd === null) return null
  if (toEnd < 0) return 'ended'
  if (toStart > 1) return `in ${toStart} days`
  if (toStart === 1) return 'tomorrow'
  if (toStart === 0) return 'today'
  return 'underway'
}

/**
 * The date a trip's first day enters the outlook, or `null` when it already
 * has. A trip with no day in range yet has nothing to show, and says when it will.
 */
export function forecastOpens(startDate: string, today: string): string | null {
  const opens = addDays(startDate, -OUTLOOK_DAYS_AHEAD)
  return opens > today ? opens : null
}

/** `1 crag`, `3 crags`. */
export function cragCount(n: number): string {
  return n === 1 ? '1 crag' : `${n} crags`
}

/** One day's weather, from the trip outlook only. Every figure nullable: a gap is a gap. */
export type DayWeather = {
  highC: number | null
  lowC: number | null
  /** `members_wet / member_count`, 0-1. */
  chance: number | null
  precipMm: number | null
  /** `agreementShare`, 0.5-1. `null` withholds the chip. */
  agreement: number | null
}

export function dayWeather(day: OutlookDay): DayWeather {
  return {
    highC: day.temp_c_max,
    lowC: day.temp_c_min,
    chance: rainChanceShare(day),
    precipMm: day.precip_mm_mean,
    agreement: agreementShare(day),
  }
}

export type TripDayTile =
  /** Inside the crag's readings: the words and the score, suppressed as every surface suppresses it. */
  | {
      kind: 'scored'
      local_date: string
      weather: DayWeather | null
      summary: ReadingsSummary
      /** The day's representative hour, for the words' colours. */
      reading: HourlyReading | null
    }
  /**
   * Not inside the readings. `scoredFrom` is the date it will be, or `null` when
   * that date has come and the readings simply do not have it (still loading,
   * failed, or the model stopped short).
   */
  | { kind: 'unscored'; local_date: string; weather: DayWeather | null; scoredFrom: string | null }

/**
 * One tile per trip date. `readings` is `null` while `/hourly` is in flight, on
 * its failure, and for a location that is not a crag: those days are unscored
 * rather than given an invented score. A location that is not a crag is never
 * scored, so its days promise no date.
 */
export function tripDayTiles(input: {
  dates: readonly string[]
  outlook: readonly OutlookDay[]
  readings: DayReadings | null
  isCrag: boolean
  today: string
}): TripDayTile[] {
  const outlookByDate = new Map(input.outlook.map((d) => [d.local_date, d]))
  const readingsByDate = new Map((input.readings?.days ?? []).map((d) => [d.local_date, d]))
  return input.dates.map((local_date) => {
    const outlookDay = outlookByDate.get(local_date)
    const weather = outlookDay === undefined ? null : dayWeather(outlookDay)
    const day = readingsByDate.get(local_date)
    if (input.readings !== null && day !== undefined) {
      const summary = summarizeReadings({
        reading: day.best,
        window: day.window,
        utcOffsetSeconds: input.readings.utcOffsetSeconds,
        severeAlertEvent: input.readings.severeAlertEvent,
        alertsPending: input.readings.alertsPending,
        unavailableReason: null,
      })
      return { kind: 'scored', local_date, weather, summary, reading: day.best }
    }
    const from = addDays(local_date, -SCORED_DAYS_AHEAD)
    return { kind: 'unscored', local_date, weather, scoredFrom: input.isCrag && from > input.today ? from : null }
  })
}

/** `Dry · Great`, the day's two words. `null` when neither was read. */
export function readingWords(summary: ReadingsSummary): string | null {
  if (summary.readings.length === 0) return null
  return summary.readings.map((f) => f.value).join(' · ')
}

/** A share as `18%`. */
export function formatShare(share: number | null): string | null {
  return share === null ? null : `${Math.round(share * 100)}%`
}

/**
 * What the rain-over-the-trip card says about how much of the trip the total
 * covers: `All 3 days`, or `2 of 3 days` when the horizon or the trip's start
 * cuts it short.
 */
export function coverageLabel(daysCovered: number, tripDays: number): string {
  if (daysCovered >= tripDays) return tripDays === 1 ? 'The whole day' : `All ${tripDays} days`
  return `${daysCovered} of ${tripDays} days`
}

/** One crag's outlook, as the screen reads it. */
export type OutlookState =
  /** `days: null`: the outlook could not be read. */
  | { kind: 'unavailable' }
  /** `days: []`: no trip day inside the horizon yet. */
  | { kind: 'notYet' }
  | { kind: 'days'; outlook: Extract<TripOutlook, { days: OutlookDay[] }> }

export function outlookState(outlook: TripOutlook | undefined): OutlookState {
  if (outlook === undefined || outlook.days === null) return { kind: 'unavailable' }
  if (outlook.days.length === 0) return { kind: 'notYet' }
  return { kind: 'days', outlook }
}

/** One recording on the trend chart. */
export type TrendMark = {
  ms: number
  rainMm: number | null
  p10Mm: number | null
  p90Mm: number | null
  highC: number | null
  /**
   * The total covered only part of the trip. Drawn hollow: the total jumps when
   * the next day enters the horizon, and a solid bar would read that as the
   * forecast getting wetter.
   */
  partial: boolean
}

export function trendMarks(points: readonly TripTrendPoint[]): TrendMark[] {
  const marks: TrendMark[] = []
  for (const p of points) {
    const ms = Date.parse(p.recorded_at)
    if (!Number.isFinite(ms)) continue
    marks.push({
      ms,
      rainMm: p.mean_mm,
      p10Mm: p.p10_mm,
      p90Mm: p.p90_mm,
      highC: p.high_c_max,
      partial: p.days_covered === null || p.days_covered < p.trip_days,
    })
  }
  return marks.sort((a, b) => a.ms - b.ms)
}

/**
 * How a figure moved, from the oldest recording to the newest **that covered
 * the same days**. A total over two days set against one over three is not a
 * change in the forecast, so a comparison across coverage is withheld.
 */
function change(points: readonly TripTrendPoint[], pick: (p: TripTrendPoint) => number | null): number | null {
  const last = points[points.length - 1]
  if (last === undefined) return null
  const lastValue = pick(last)
  if (lastValue === null) return null
  const first = points.find(
    (p) => p !== last && p.days_covered === last.days_covered && p.trip_days === last.trip_days && pick(p) !== null,
  )
  if (first === undefined) return null
  const firstValue = pick(first)
  return firstValue === null ? null : lastValue - firstValue
}

/** `Rain: down 0.16 in`, `Rain: no change`; `null` with nothing comparable. */
export function rainChangeChip(points: readonly TripTrendPoint[]): string | null {
  const mm = change(points, (p) => p.mean_mm)
  if (mm === null) return null
  const inches = mmToIn(mm)
  if (Math.abs(inches) < 0.005) return 'Rain: no change'
  return `Rain: ${inches > 0 ? 'up' : 'down'} ${Math.abs(inches).toFixed(2)} in`
}

/** `High: up 5°`, `High: no change`; `null` with nothing comparable. */
export function highChangeChip(points: readonly TripTrendPoint[]): string | null {
  const c = change(points, (p) => p.high_c_max)
  if (c === null) return null
  const f = Math.round(cToFDelta(c))
  if (f === 0) return 'High: no change'
  return `High: ${f > 0 ? 'up' : 'down'} ${Math.abs(f)}°`
}

/**
 * A trip whose last day is behind the device's today. Its screen reads what was
 * stored (`/trips/:tripId/summary`) and asks for no forecast.
 */
export function tripIsOver(trip: Pick<Trip, 'endDate'>, today: string): boolean {
  const toEnd = daysBetween(today, trip.endDate)
  return toEnd !== null && toEnd < 0
}

/** `On the day`, `1 day out`, `5 days out`. */
export function leadLabel(leadDays: number): string {
  if (leadDays <= 0) return 'On the day'
  return leadDays === 1 ? '1 day out' : `${leadDays} days out`
}

/**
 * What one recording said, as words: `Dry · 100`, or for a recording past the
 * scored days, its rain: `Rain 35% · 0.12 in`. `null` when it said nothing.
 */
export function forecastWords(f: TripDayForecast): string | null {
  if (f.score !== null || f.dryness !== null) {
    return [f.dryness === null ? null : ROCK_LABELS[f.dryness], f.score === null ? null : String(f.score)]
      .filter((p): p is string => p !== null)
      .join(' · ')
  }
  const chance = formatShare(
    f.member_count === null ? null : rainChanceShare({ members_wet: f.members_wet, member_count: f.member_count }),
  )
  if (chance === null && f.precip_mm_mean === null) return null
  return `Rain ${chance === null ? '' : `${chance} · `}${formatPrecipIn(f.precip_mm_mean)}`
}
