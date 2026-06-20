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
// granite/limestone: rain day + 1 day after blocked → window of 2
// basalt: rain day + 2 days after blocked → window of 3
// sandstone/unknown: rain day + 2 days after blocked → window of 3
const LOOKBACK_DAYS: Record<string, number> = {
  granite: 2,
  limestone: 2,
  basalt: 3,
  sandstone: 3,
  unknown: 3,
}

export function computeClimbabilityHistory(
  rows: DailyPrecip[],
  rockType: string | null,
): MonthlyClimbability[] {
  if (rows.length === 0) return []

  const lookback = LOOKBACK_DAYS[rockType ?? 'unknown'] ?? 3

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
