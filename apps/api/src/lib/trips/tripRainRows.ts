import type { Outlook } from '../weather/ensembleOutlook.js'
import { recordingHour } from './tripDayRows.js'
import { summarizeTripOutlook } from './tripOutlook.js'

/** One `trip_rain_records` row, as written. */
export type TripRainRow = {
  trip_id: string
  location_id: string
  recorded_at: Date
  mean_mm: number | null
  p10_mm: number | null
  p90_mm: number | null
  member_count: number | null
  days_covered: number | null
  trip_days: number
  high_c_max: number | null
}

export type DatedTrip = { id: string; start: string; end: string }

/**
 * The trend points one location records at one firing: one per trip, from the
 * same summary `GET /trips/:tripId/forecast` answers with.
 *
 * A trip with no day inside the horizon yet writes nothing: a point of nulls
 * would draw as a gap in a trend that has not started.
 */
export function tripRainRows(input: {
  locationId: string
  now: Date
  trips: DatedTrip[]
  outlook: Outlook
}): TripRainRow[] {
  const recorded_at = recordingHour(input.now)
  const rows: TripRainRow[] = []
  for (const trip of input.trips) {
    const summary = summarizeTripOutlook(input.locationId, input.outlook, trip.start, trip.end)
    if (summary.days === null || summary.days.length === 0) continue
    const total = summary.rain_total
    rows.push({
      trip_id: trip.id,
      location_id: input.locationId,
      recorded_at,
      mean_mm: total?.mean_mm ?? null,
      p10_mm: total?.p10_mm ?? null,
      p90_mm: total?.p90_mm ?? null,
      member_count: total?.member_count ?? null,
      days_covered: total?.days_covered ?? null,
      trip_days: summary.trip_days,
      high_c_max: summary.high_c_range?.max ?? null,
    })
  }
  return rows
}
