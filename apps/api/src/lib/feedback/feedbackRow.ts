import type { Feedback } from '@weatherteam6/types'
import type { feedback } from '../../db/schema.js'
import { parseAppReadings } from './parseFeedback.js'

type FeedbackRow = typeof feedback.$inferSelect

/**
 * A stored row as the API returns it. `app_readings` is `jsonb`, typed
 * `unknown` by Drizzle, and goes back through the same validator that let it
 * in — a row that no longer parses reads as "no snapshot", never as a cast.
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
    created_at: row.created_at.toISOString(),
  }
}
