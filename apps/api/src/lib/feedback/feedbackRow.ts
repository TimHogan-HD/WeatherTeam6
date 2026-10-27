import type { Feedback, ForecastStop } from '@weatherteam6/types'
import type { feedback } from '../../db/schema.js'
import { parseAppReadings, parseStops } from './parseFeedback.js'

type FeedbackRow = typeof feedback.$inferSelect

/** The row's stops, through the validator that let them in; a list that no longer parses is none. */
function storedStops(row: FeedbackRow): ForecastStop[] {
  if (row.stops === null || row.observed_at === null) return []
  const stops = parseStops(row.stops, row.observed_at.getTime(), Number.POSITIVE_INFINITY)
  return 'error' in stops ? [] : stops
}

/**
 * A stored row as the API returns it. `app_readings` and `stops` are `jsonb`,
 * typed `unknown` by Drizzle, and go back through the same validators that let
 * them in — a row that no longer parses reads as "no snapshot" or "no stops",
 * never as a cast.
 */
export function toFeedback(row: FeedbackRow): Feedback {
  const readings = row.app_readings === null ? null : parseAppReadings(row.app_readings)
  return {
    id: row.id,
    kind: row.kind,
    location_id: row.location_id,
    location_name: row.location_name,
    message: row.message,
    observed_at: row.observed_at === null ? null : row.observed_at.toISOString(),
    observed_conditions: row.observed_conditions,
    verdict: row.verdict,
    app_readings: readings !== null && 'error' in readings ? null : readings,
    stops: storedStops(row),
    created_at: row.created_at.toISOString(),
  }
}
