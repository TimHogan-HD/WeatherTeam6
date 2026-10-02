import type { TripOutlook, TripRainTotal } from '@weatherteam6/types'
import { computePercentile } from '../weather/openMeteo.js'
import type { Outlook, ParsedOutlook } from '../weather/ensembleOutlook.js'

const DAY_MS = 86_400_000

/** Calendar days from `start` to `end`, both included. Dates are `YYYY-MM-DD`. */
export function tripDayCount(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS) + 1
}

/**
 * Sum each member's precipitation over the trip days the outlook reached, then
 * take the spread of those totals.
 *
 * A member is summed only if it reached every one of those days: a model that
 * runs out mid-trip would otherwise contribute a total that silently stops
 * early and drag the range down.
 */
export function tripRainTotal(
  outlook: ParsedOutlook,
  start: string,
  end: string,
): TripRainTotal | null {
  const covered: number[] = []
  outlook.dates.forEach((date, i) => {
    if (date < start || date > end) return
    if (outlook.member_precip.some((row) => typeof row[i] === 'number')) covered.push(i)
  })
  if (covered.length === 0) return null

  const totals: number[] = []
  for (const row of outlook.member_precip) {
    let total = 0
    let complete = true
    for (const i of covered) {
      const v = row[i]
      if (typeof v !== 'number') {
        complete = false
        break
      }
      total += v
    }
    if (complete) totals.push(total)
  }
  if (totals.length === 0) return null

  totals.sort((a, b) => a - b)
  return {
    mean_mm: totals.reduce((a, b) => a + b, 0) / totals.length,
    p10_mm: computePercentile(totals, 10),
    p90_mm: computePercentile(totals, 90),
    member_count: totals.length,
    days_covered: covered.length,
  }
}

/** One trip location's outlook, cut to the trip. `outlook` null means it could not be read. */
export function summarizeTripOutlook(
  locationId: string,
  outlook: Outlook | null,
  start: string,
  end: string,
): TripOutlook {
  const trip_days = tripDayCount(start, end)
  if (outlook === null) {
    return { locationId, utc_offset_seconds: null, trip_days, days: null, rain_total: null, high_c_range: null }
  }

  const days = outlook.days.filter((d) => d.local_date >= start && d.local_date <= end)
  const highs = days.flatMap((d) => (d.temp_c_max === null ? [] : [d.temp_c_max]))
  return {
    locationId,
    utc_offset_seconds: outlook.utc_offset_seconds,
    trip_days,
    days,
    rain_total: tripRainTotal(outlook, start, end),
    high_c_range: highs.length === 0 ? null : { min: Math.min(...highs), max: Math.max(...highs) },
  }
}
