import type { ConditionsReadings, HourlySeries } from '@weatherteam6/types'
import { readingNow } from '@weatherteam6/types'

/**
 * **`HourlyReadings` → the today-shaped slice that rides on
 * `GET /conditions/:locationId` and the bot's conditions panel.**
 *
 * Pure, and separate from the route for the same reason every other builder in
 * this directory is: the route imports `db`, which throws at import time
 * without `DATABASE_URL`.
 *
 * It exists so that **one crag cannot carry two different numbers on two
 * screens**. The Mini App's list card reads `/conditions` and its detail screen
 * reads `/hourly`; both must be the same run of the same model, picked by the
 * same rule. Deriving "now" independently on each surface is how one screen
 * comes to show an hour the other has already moved past.
 *
 * Two things it deliberately does not do:
 *
 * - **It does not fall back to the day's best hour when the run does not reach
 *   now.** `now: null` means the model has nothing to say about this moment;
 *   substituting the best hour of the day would present the sunniest hour of a
 *   wet morning as the current reading (defect class 1).
 * - **It does not pick today by position.** `days[0]` is today in every
 *   response `buildHourlyReadings` produces today, and would silently become
 *   tomorrow the first time the window started a day late. The join is on
 *   `local_date`, exactly as the per-day score join is on `forecast_date`.
 */
/**
 * What a **non-crag** carries.
 *
 * Named rather than left as a literal in each caller, because the two things it
 * has to be right about are easy to get subtly different: the reason is
 * `not_a_climbing_location` (nothing went wrong — the reader chose this), and
 * the offset is never read, because there is no window and therefore no clock
 * time to format.
 */
export const NOT_A_CRAG_READINGS: ConditionsReadings = {
  model: null,
  unavailable_reason: 'not_a_climbing_location',
  utc_offset_seconds: 0,
  now: null,
  today: null,
}

/**
 * What a crag carries when the hourly run could not be read at all.
 *
 * **Distinct from the one above, and a surface says something different for
 * each.** "Saved as a place" is a choice; "the model didn't answer" is a gap.
 */
export const READINGS_UNAVAILABLE: ConditionsReadings = {
  model: null,
  unavailable_reason: 'model_unavailable',
  utc_offset_seconds: 0,
  now: null,
  today: null,
}

export function toConditionsReadings(
  series: Pick<HourlySeries, 'readings' | 'utc_offset_seconds'>,
  todayStr: string,
  now: Date,
): ConditionsReadings {
  const { readings } = series
  return {
    model: readings.model,
    unavailable_reason: readings.unavailable_reason,
    // The location's own clock, carried with the readings rather than looked up
    // beside them — it is what the window's times are rendered against.
    utc_offset_seconds: series.utc_offset_seconds,
    now: readingNow(readings.hours, now.getTime()),
    today: readings.days.find((d) => d.local_date === todayStr) ?? null,
  }
}
