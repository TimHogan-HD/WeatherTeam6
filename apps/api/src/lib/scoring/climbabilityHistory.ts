import { isRockType, type RockType } from '@weatherteam6/types'
import { MAX_HOURS } from './dryingModel.js'

export type DailyPrecip = {
  date: string       // YYYY-MM-DD
  precip_mm: number
}

export type MonthlyClimbability = {
  month: number
  year: number
  climbable_days: number
  total_days: number
}

/**
 * Lookback window: today plus the prior days whose rain still blocks it — the
 * rain day itself and every day the rock type's drying ceiling reaches into.
 *
 * **Derived from `MAX_HOURS`, not a third table.** It was a hand-written
 * `Record<RockType, number>` of seven values that already disagreed with the
 * drying model for sandstone (3 days against a 72-hour ceiling). At twenty-seven
 * rock types a hand-kept copy is a drift waiting to happen, and **nothing calls
 * this function today** (issue #25), so there is no live number for the
 * derivation to move.
 */
function lookbackDays(rockType: RockType): number {
  return 1 + Math.ceil(MAX_HOURS[rockType] / 24)
}

export function computeClimbabilityHistory(
  rows: DailyPrecip[],
  rockType: string | null,
): MonthlyClimbability[] {
  if (rows.length === 0) return []

  // A `text`-typed value from the database, so it is narrowed by asking the
  // list. A string this build does not recognise — a row written by a newer
  // deploy, or an imported crag's free-text type — falls to `unknown`'s window,
  // which is the widest. It must never fall to a *shorter* one.
  const lookback = lookbackDays(isRockType(rockType) ? rockType : 'unknown')

  const precipByDate = new Map<string, number>()
  for (const row of rows) {
    precipByDate.set(row.date, row.precip_mm)
  }

  const monthly = new Map<string, MonthlyClimbability>()

  for (const row of rows) {
    const year = parseInt(row.date.slice(0, 4), 10)
    const month = parseInt(row.date.slice(5, 7), 10)
    const key = `${year}-${month}`

    if (!monthly.has(key)) {
      monthly.set(key, { month, year, climbable_days: 0, total_days: 0 })
    }
    const entry = monthly.get(key)!
    entry.total_days++

    let climbable = true
    for (let d = 0; d < lookback; d++) {
      const checkDate = offsetDate(row.date, -d)
      const precip = precipByDate.get(checkDate)
      if (precip !== undefined && precip >= 2) {
        climbable = false
        break
      }
    }
    if (climbable) entry.climbable_days++
  }

  return Array.from(monthly.values()).sort((a, b) =>
    a.year !== b.year ? a.year - b.year : a.month - b.month,
  )
}

function offsetDate(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
