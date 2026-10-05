import type { HourlyDay } from '@weatherteam6/types'
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
