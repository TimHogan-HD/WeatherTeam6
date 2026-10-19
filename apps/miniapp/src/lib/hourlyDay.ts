import type { HourlyDay, HourlySample } from '@weatherteam6/types'
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

const HOUR_MS = 3_600_000
const NOON = 12

/**
 * The hour Hourly reads before anyone scrubs: the hour now is in when the open
 * day holds it, else noon on the location's clock, else the day's first hour.
 * `null` when the day has no hours.
 */
export function defaultReadHour(
  hours: readonly HourlySample[],
  localDate: string,
  utcOffsetSeconds: number,
  nowMs: number,
): number | null {
  const day = hours
    .filter((h) => h.local_date === localDate)
    .map((h) => Date.parse(h.valid_at))
    .filter((ms) => Number.isFinite(ms))
    .sort((a, b) => a - b)
  if (day.length === 0) return null
  const current = day.find((ms) => ms <= nowMs && nowMs < ms + HOUR_MS)
  if (current !== undefined) return current
  const noon = day.find((ms) => new Date(ms + utcOffsetSeconds * 1000).getUTCHours() === NOON)
  return noon ?? day[0]!
}

/** A day whose every hourly chance of rain is below this is drawn as dry. */
export const DRY_DAY_MAX_CHANCE_PCT = 10

export type DryDay = { peakChancePct: number; peakMs: number }

/**
 * "Dry all day" (hybrid look, owner 2026-10-19): every hour's chance of rain is
 * under `DRY_DAY_MAX_CHANCE_PCT`. Fewer than one ensemble member in ten
 * measures rain in any hour, so every hour's median amount is below measurable too.
 *
 * **Every hour has to have been read.** An hour missing its chance or its
 * amount could be the wet one, so a day with a gap is not called dry.
 */
export function dryDay(hours: readonly HourlySample[], localDate: string): DryDay | null {
  const day = hours.filter((h) => h.local_date === localDate)
  if (day.length === 0) return null
  let peak: DryDay | null = null
  for (const h of day) {
    if (h.precip_mm_mean === null || h.precip_chance_pct === null) return null
    if (h.precip_chance_pct >= DRY_DAY_MAX_CHANCE_PCT) return null
    if (peak === null || h.precip_chance_pct > peak.peakChancePct) {
      peak = { peakChancePct: h.precip_chance_pct, peakMs: Date.parse(h.valid_at) }
    }
  }
  return peak
}
