/**
 * **`GET /api/v1/setup/preview`** — the welcome screen's example week (#543).
 *
 * A made-up week at Red Wing, scored by the real scorer on the reader's draft
 * climbing hours and temperature range, beside the same week on the defaults.
 * Nothing is saved and nothing upstream is called: the week is a fixture, and
 * the screen labels it "Example · sample week".
 */
import type { ScoreLimit } from './hourly.js'

export type SetupPreviewHour = {
  /** Local hour of day, 0-23, the hour ending at it (as every hourly reading). */
  hour: number
  /** The hour's score on the draft range. Null when the scorer withheld it. */
  score: number | null
  air_temp_c: number | null
  precip_mm: number | null
}

export type SetupPreviewDay = {
  /** Local date, `YYYY-MM-DD`. */
  date: string
  /** The day's score on the draft hours and range. Null when no 3-hour run inside the hours was scored. */
  score: number | null
  /** The same day on the default hours and range. */
  default_score: number | null
  /** What holds the draft score below 100, most limiting first; null when `score` is. */
  held_back_by: ScoreLimit[] | null
  /** All 24 local hours, so the screen can light the climbing hours. */
  hours: SetupPreviewHour[]
}

export type SetupPreview = {
  /** The crag the example week is placed at. */
  crag_name: string
  days: SetupPreviewDay[]
}
