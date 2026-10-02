import type { FrictionLevel, ReadingsDay, RockLevel } from '@weatherteam6/types'
import { localDateString } from '../weather/openMeteo.js'
import type { Outlook } from '../weather/ensembleOutlook.js'
import { tripDayCount } from './tripOutlook.js'

const HOUR_MS = 3_600_000

/** One `trip_day_records` row, as written. */
export type TripDayRow = {
  location_id: string
  local_date: string
  recorded_at: Date
  lead_days: number
  scored_run_fetched_at: Date | null
  score: number | null
  dryness: RockLevel | null
  friction: FrictionLevel | null
  temp_c_max: number | null
  temp_c_min: number | null
  members_wet: number | null
  member_count: number | null
  precip_mm_mean: number | null
}

export type TripRange = { start: string; end: string }

/** The firing's hour: every run inside one hour writes the same key. */
export function recordingHour(now: Date): Date {
  return new Date(Math.floor(now.getTime() / HOUR_MS) * HOUR_MS)
}

/**
 * The rows one location records at one firing: every day from its local today
 * through the outlook's horizon that falls inside any of its trips.
 *
 * `readings` is null at a location that is not a crag, so those rows carry
 * weather only. A day neither source reached is not written.
 */
export function tripDayRows(input: {
  locationId: string
  now: Date
  ranges: TripRange[]
  outlook: Outlook
  readings: ReadingsDay[] | null
  scoredRunFetchedAt: Date | null
}): TripDayRow[] {
  const today = localDateString(input.now, input.outlook.utc_offset_seconds)
  const recorded_at = recordingHour(input.now)
  const outlookByDate = new Map(input.outlook.days.map((d) => [d.local_date, d]))
  const readingsByDate = new Map((input.readings ?? []).map((d) => [d.local_date, d]))

  const rows: TripDayRow[] = []
  for (const date of input.outlook.dates) {
    if (date < today) continue
    if (!input.ranges.some((r) => date >= r.start && date <= r.end)) continue

    const weather = outlookByDate.get(date)
    const best = readingsByDate.get(date)?.best ?? null
    if (weather === undefined && best === null) continue

    rows.push({
      location_id: input.locationId,
      local_date: date,
      recorded_at,
      lead_days: tripDayCount(today, date) - 1,
      scored_run_fetched_at: best === null ? null : input.scoredRunFetchedAt,
      score: best?.score ?? null,
      dryness: best?.rock?.level ?? null,
      friction: best?.friction?.level ?? null,
      temp_c_max: weather?.temp_c_max ?? null,
      temp_c_min: weather?.temp_c_min ?? null,
      members_wet: weather?.members_wet ?? null,
      member_count: weather?.member_count ?? null,
      precip_mm_mean: weather?.precip_mm_mean ?? null,
    })
  }
  return rows
}
