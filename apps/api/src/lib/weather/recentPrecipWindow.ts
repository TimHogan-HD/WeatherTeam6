import type { RecentPrecip } from '@weatherteam6/types'

/**
 * Trim a recent-precipitation window to the hours that have actually happened.
 *
 * **`fetchRecentHourlyPrecip` asks for `forecast_days=1` on purpose** — the bot
 * reads it to find the last wet hour, and rain falling right now is the case it
 * exists for. That makes the tail of the series a *forecast*, and a chart
 * captioned "recent rain" must not draw one: a predicted shower rendered beside
 * measured ones is defect class 3, a reading the data does not support.
 *
 * The cut is at the location's own local clock, derived from the response's
 * `utc_offset_seconds` — the same shift `localDateString` uses, and for the same
 * reason (issue #33). Comparing `YYYY-MM-DDTHH:mm` strings is safe because the
 * format is fixed-width and lexicographic order is chronological order.
 *
 * **An hour stamped `T` covers `T-1h` to `T`**, so the hour stamped exactly now
 * is complete and is kept. A non-finite offset degrades to UTC rather than
 * producing `Invalid Date`, matching `localDateString`.
 */
export function trimToObservedHours(recent: RecentPrecip, now: Date): RecentPrecip {
  const offset = Number.isFinite(recent.utc_offset_seconds) ? recent.utc_offset_seconds : 0
  const localNow = new Date(now.getTime() + offset * 1000).toISOString().slice(0, 16)
  const hours = recent.hours.filter((h) => h.valid_at_local <= localNow)
  return { ...recent, hours }
}
