/**
 * **How sunny it is, in words** — the sky block on `GET /hourly/:id`, and the
 * copy every surface shows it with.
 *
 * Each daylight hour is sorted into one of three words by how much of a
 * cloudless sky's sunshine the forecast lets through. The sorting is server-side
 * (`apps/api/src/lib/runs/skySeries.ts`) so the Daily row and the Hourly strip
 * cannot disagree, and the reader never sees the watts behind it (owner
 * decision 2026-10-16: a W/m² chart "isn't easily understandable").
 *
 * **Null is a gap, never cloud.** An hour the model's sunlight did not reach is
 * `null`, and a day with any such hour has no summary. Reading a missing hour
 * as cloudy would be the plausible-value defect (`defect-patterns.md` §1) in
 * its most tempting form, because "cloudy" is what a dark chart looks like.
 */

export type SkyCondition = 'sunny' | 'partly_cloudy' | 'cloudy'

/** One daylight hour. Night hours are not in the series at all. */
export type SkyHour = {
  /** UTC instant, ISO 8601 — the same stamp as `HourlySample.valid_at`. */
  valid_at: string
  /** The location's calendar day. Server-derived; a client must not recompute it. */
  local_date: string
  /** Null when the model's sunlight did not reach this hour. */
  sky: SkyCondition | null
}

/**
 * A day in a few words. `sunny_morning` and `sunny_afternoon` exist because
 * "partly cloudy" hides the one thing a climber plans around: which half of
 * the day the sun is out.
 */
export type SkyDaySummary =
  | 'sunny'
  | 'sunny_morning'
  | 'sunny_afternoon'
  | 'partly_cloudy'
  | 'cloudy'

export type SkyDay = {
  local_date: string
  /** Null when any of the day's daylight hours is a gap. */
  summary: SkyDaySummary | null
}

export type SkySeries = {
  /**
   * The model whose sunlight was read — the scoring model's, so the sky on
   * screen is the one the drying clock ran on. Null when it did not answer.
   */
  model: string | null
  /** Daylight hours in the window, ascending. */
  hours: SkyHour[]
  /** One per date in the window, ascending. */
  days: SkyDay[]
}

export const SKY_HOUR_LABEL: Record<SkyCondition, string> = {
  sunny: 'Sunny',
  partly_cloudy: 'Partly cloudy',
  cloudy: 'Cloudy',
}

export const SKY_DAY_LABEL: Record<SkyDaySummary, string> = {
  sunny: 'Sunny',
  sunny_morning: 'Sunny morning',
  sunny_afternoon: 'Sunny afternoon',
  partly_cloudy: 'Partly cloudy',
  cloudy: 'Cloudy',
}

/** The icon a day wears: a half-sunny day is the sun-and-cloud glyph. */
export function skyDayIcon(summary: SkyDaySummary): SkyCondition {
  if (summary === 'sunny') return 'sunny'
  if (summary === 'cloudy') return 'cloudy'
  return 'partly_cloudy'
}
