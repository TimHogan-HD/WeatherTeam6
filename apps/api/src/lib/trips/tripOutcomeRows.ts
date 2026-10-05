import type { PastReadingsDay, RockLevel } from '@weatherteam6/types'
import { recordingHour, type TripRange } from './tripDayRows.js'
import { tripDayCount } from './tripOutlook.js'

/**
 * How many days after a trip day its outcome is still rewritten. The look back
 * reaches seven days (`TRAILING_DAYS`); three leaves room for missed firings
 * and for the analysis to settle, and then the day's row is final.
 */
export const OUTCOME_DAYS = 3

/** One `trip_day_outcomes` row, as written. */
export type TripOutcomeRow = {
  location_id: string
  local_date: string
  recorded_at: Date
  score: number | null
  dryness: RockLevel | null
  rain_mm: number | null
  temp_c_max: number | null
  temp_c_min: number | null
}

/**
 * The outcome rows one location writes at one firing: each trip day that is
 * over and at most `OUTCOME_DAYS` behind the location's today. A day the look
 * back has nothing for writes nothing, so a gap never overwrites a reading.
 */
export function tripOutcomeRows(input: {
  locationId: string
  now: Date
  today: string
  ranges: TripRange[]
  pastDays: readonly PastReadingsDay[]
}): TripOutcomeRow[] {
  const recorded_at = recordingHour(input.now)
  const rows: TripOutcomeRow[] = []
  for (const day of input.pastDays) {
    const behind = tripDayCount(day.local_date, input.today) - 1
    if (behind < 1 || behind > OUTCOME_DAYS) continue
    if (!input.ranges.some((r) => day.local_date >= r.start && day.local_date <= r.end)) continue
    if (day.best === null && day.rain_mm === null && day.temp_c_max === null && day.temp_c_min === null) continue
    rows.push({
      location_id: input.locationId,
      local_date: day.local_date,
      recorded_at,
      score: day.best?.score ?? null,
      dryness: day.best?.rock?.level ?? null,
      rain_mm: day.rain_mm,
      temp_c_max: day.temp_c_max,
      temp_c_min: day.temp_c_min,
    })
  }
  return rows
}
