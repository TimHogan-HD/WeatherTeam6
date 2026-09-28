import { FRICTION_LABELS, type FrictionLevel, type HourlyDay, type HourlySeries } from '@weatherteam6/types'
import { dayIsDrawable, hoursOnDay } from '../components/charts/hourlySeries.js'
import { formatWeekday } from './forecast.js'
import { formatLocalHour24 } from './format.js'

/**
 * The decisions behind the Hourly tab, from the WT6 Figma "V2" page's Hourly
 * frame — which days get a chip, how far out a day is, and what the friction
 * strip draws. Pure, so each one is tested without a DOM.
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

export type FrictionCell = {
  valid_at: string
  /** `06`, on the location's clock. */
  hour: string
  /** Whether the axis under the strip labels this cell. */
  tick: boolean
  /** `null` when the model did not read this hour — drawn as a gap, never as a level. */
  level: FrictionLevel | null
}

/** Every sixth hour gets a label, and so does the last, as drawn. */
const TICK_STEP = 6

/**
 * The day's friction, one cell per hour the weather run carries.
 *
 * **Joined on `valid_at`, never on position** — the readings and the hours are
 * built by different paths, and an index join holds until one side drops an
 * hour. An hour with no reading is a cell with no level, so a gap in the model
 * is a visible gap in the strip rather than a strip that quietly closes up.
 *
 * Only the level reaches this, never the 0-1 factor behind it: words and
 * ordering reach a screen and magnitudes do not (the magnitude fence).
 */
export function frictionCells(series: HourlySeries, localDate: string): FrictionCell[] {
  const byInstant = new Map((series.readings?.hours ?? []).map((r) => [r.valid_at, r]))
  const hours = hoursOnDay(series.hours, localDate)
  const out: FrictionCell[] = []
  hours.forEach((h, i) => {
    const hour = formatLocalHour24(Date.parse(h.valid_at), series.utc_offset_seconds)
    if (hour === null) return
    out.push({
      valid_at: h.valid_at,
      hour,
      tick: Number(hour) % TICK_STEP === 0 || i === hours.length - 1,
      level: byInstant.get(h.valid_at)?.friction?.level ?? null,
    })
  })
  return out
}

/**
 * The strip in words, for a screen reader — runs of one level collapsed, so
 * twenty-four cells read as `00–02 Fair, 03–23 Great`. A colour cannot be read
 * aloud; this is the strip for anyone who cannot see it.
 */
export function frictionSummary(cells: readonly FrictionCell[]): string {
  const runs: { from: string; to: string; level: FrictionLevel | null }[] = []
  for (const c of cells) {
    const last = runs[runs.length - 1]
    if (last !== undefined && last.level === c.level) last.to = c.hour
    else runs.push({ from: c.hour, to: c.hour, level: c.level })
  }
  const parts = runs.map((r) => {
    const span = r.from === r.to ? r.from : `${r.from}–${r.to}`
    return `${span} ${r.level === null ? 'no reading' : FRICTION_LABELS[r.level]}`
  })
  return `Friction by hour: ${parts.join(', ')}`
}
