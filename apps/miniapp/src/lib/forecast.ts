import type { ForecastSnapshot, WeatherAlert } from '@weatherteam6/types'
import { isSevereAlert } from '@weatherteam6/types'

/**
 * "Today" as the API defines it: a **UTC** date.
 *
 * `liveForecast.ts` derives its own `todayStr` from `new Date().toISOString()`
 * and both Open-Meteo calls request `timezone=UTC`, so every daily bucket is a
 * UTC day. The client has to use the same definition or it will look for a row
 * the API never labelled that way.
 *
 * This is knowingly wrong for the user, not for the code: in the Americas the
 * day labelled "today" rolls over in the late afternoon local time. The fix is
 * server-side — pass `locations.timezone`, which is stored and read by nothing —
 * and is tracked as miniapp-design-v1.md §10.5. Do not paper over it here by
 * picking a different day than the API scored.
 */
export function todayUtcIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/**
 * The row for today, or `null` when the feed starts at tomorrow.
 *
 * `null` is a real state, not an error: it must render as "no reading for today
 * yet" rather than as an em-dash row that reads like missing instrumentation,
 * and never by relabelling tomorrow's numbers as today's.
 */
export function findToday(
  snapshots: readonly ForecastSnapshot[] | undefined,
  now?: Date,
): ForecastSnapshot | null {
  if (snapshots === undefined) return null
  const today = todayUtcIso(now)
  return snapshots.find((s) => s.forecast_date === today) ?? null
}

/** `Tue Aug 25`, formatted in UTC to match the bucket the date came from. */
export function formatForecastDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  // Finiteness, not just presence: `Number('not')` is NaN, and a NaN date part
  // renders the literal string "Invalid Date" on screen.
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return isoDate
  }
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/** Severe and Extreme first, so the banner order matches the ranking §7 uses. */
export function sortBySeverity(alerts: readonly WeatherAlert[]): WeatherAlert[] {
  return [...alerts].sort(
    (a, b) => Number(isSevereAlert(b.severity)) - Number(isSevereAlert(a.severity)),
  )
}

/** The event name of an active Severe+ alert, for §7's suppression rule. */
export function severeAlertEvent(alerts: readonly WeatherAlert[] | undefined): string | null {
  return alerts?.find((a) => isSevereAlert(a.severity))?.event ?? null
}

/**
 * Source attribution now lives in `@weatherteam6/types` — the bot must name the
 * same sources for the same location, and one implementation is the only way
 * that stays true. Re-exported so the screens keep a single import site.
 */
export { forecastSourceLabel, rainfallSourceLabel } from '@weatherteam6/types'
