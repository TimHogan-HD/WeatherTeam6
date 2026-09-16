import { isRockType, type RockType } from '@weatherteam6/types'

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

// Lookback window includes today + N prior days to check for rain.
// granite/limestone/basalt_dense: rain day + 1 day after blocked → window of 2
// basalt/basalt_vesicular: rain day + 2 days after blocked → window of 3
// sandstone/unknown: rain day + 2 days after blocked → window of 3
/**
 * **Typed `Record<RockType, …>`, not `Record<string, …>`.** It was the latter,
 * which meant a rock type added to `ROCK_TYPES` compiled fine here and took the
 * `?? 3` default below — a number that looks like a decision and is not. Now a
 * new rock type fails the typecheck until someone chooses its window.
 *
 * `basalt_dense` gets granite's 2: at 0.1-1.0% porosity it drains like plutonic
 * rock. `basalt_vesicular` keeps 3 with unspecified `basalt`, which is where the
 * single value already sat.
 */
const LOOKBACK_DAYS: Record<RockType, number> = {
  granite: 2,
  limestone: 2,
  basalt: 3,
  basalt_dense: 2,
  basalt_vesicular: 3,
  sandstone: 3,
  unknown: 3,
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
  const lookback = LOOKBACK_DAYS[isRockType(rockType) ? rockType : 'unknown']

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
