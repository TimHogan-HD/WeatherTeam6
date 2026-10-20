import { MEASURABLE_PRECIP_MM, readingNow, type HourlyDay, type HourlySample } from '@weatherteam6/types'
import { dayIsDrawable } from '../components/charts/hourlySeries.js'
import { formatWeekday } from './forecast.js'

/**
 * The decisions behind the Hourly tab, from the WT6 Figma "V2" page's Hourly
 * frame — which days get a chip, how far out a day is. Pure, so each one is tested without a DOM.
 */

export type DayChip = {
  local_date: string
  label: string
  /** False for a day the ensemble never reached: the chip is shown and disabled. */
  drawable: boolean
}

/**
 * One chip per day in the window, **all of them, disabled where the charts
 * cannot draw the day.** A chip row that drops a day shifts every later chip
 * left, and a reader counting days from Today lands on the wrong one.
 *
 * The first day is `Today` because the server built the window from the
 * location's today (issue #33) — never from the viewer's clock.
 */
export function dayChips(days: readonly HourlyDay[]): DayChip[] {
  return days.map((d, i) => ({
    local_date: d.local_date,
    label: i === 0 ? 'Today' : formatWeekday(d.local_date),
    drawable: dayIsDrawable(d),
  }))
}

/** How far out the open day is, in the words the reader uses. Counted from the window's first day. */
export function daysOutPhrase(days: readonly HourlyDay[], selectedDate: string): string | null {
  const index = days.findIndex((d) => d.local_date === selectedDate)
  if (index < 0) return null
  if (index === 0) return 'today'
  if (index === 1) return 'tomorrow'
  return `in ${index} days`
}

const NOON = 12

/**
 * The hour Hourly reads before anyone scrubs: `readingNow`'s hour when the open
 * day holds it, so the header and the Overview's "now" agree; else noon on the
 * location's clock, else the day's first hour. `null` when the day has no hours.
 */
export function defaultReadHour(
  hours: readonly HourlySample[],
  localDate: string,
  utcOffsetSeconds: number,
  nowMs: number,
): number | null {
  const dayHours = hours.filter((h) => h.local_date === localDate)
  const day = dayHours
    .map((h) => Date.parse(h.valid_at))
    .filter((ms) => Number.isFinite(ms))
    .sort((a, b) => a - b)
  if (day.length === 0) return null
  const current = readingNow(dayHours, nowMs)
  if (current !== null && readingNow(hours, nowMs) === current) return Date.parse(current.valid_at)
  const noon = day.find((ms) => new Date(ms + utcOffsetSeconds * 1000).getUTCHours() === NOON)
  return noon ?? day[0]!
}

/**
 * "Dry all day" (hybrid look, owner 2026-10-19): **no ensemble member has
 * measurable rain in any hour** — every hour's chance is 0% — and the day's
 * summed mean is below measurable. Any chance at all is drawn as its column
 * (owner, 2026-10-20: "the data exists, we shouldn't leave it blank unless
 * it's truly that low"); a 6% hour is not hidden behind "dry".
 *
 * **Every hour has to have been read.** An hour missing its chance or its
 * amount could be the wet one, so a day with a gap is not called dry.
 */
export function dryDay(hours: readonly HourlySample[], localDate: string): boolean {
  return dryHours(hours.filter((h) => h.local_date === localDate))
}

/** `dryDay`'s rule over any run of hours: the Precip tab's next 48 hours use it too. */
export function dryHours(hours: readonly HourlySample[]): boolean {
  if (hours.length === 0) return false
  let totalMm = 0
  for (const h of hours) {
    if (h.precip_mm_mean === null || h.precip_chance_pct === null) return false
    if (h.precip_chance_pct > 0) return false
    totalMm += h.precip_mm_mean
  }
  return totalMm < MEASURABLE_PRECIP_MM
}
