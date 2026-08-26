import type { ForecastSnapshot, WeatherAlert } from '@weatherteam6/types'
import { isSevereAlert } from '@weatherteam6/types'

/**
 * The row for today, or `null` when the feed starts at tomorrow.
 *
 * **The server decides which row this is, and the client must not re-derive
 * it** (issue #33, fixed 2026-08-26). `forecast_date` is now the location's own
 * local calendar day — Open-Meteo is asked for `timezone=auto` — so a client
 * comparing against a date built from its own clock cannot get this right for
 * any location outside its own timezone.
 *
 * What it used to do was worse than merely wrong: it matched a UTC date against
 * UTC buckets, so client and server were wrong *in the same direction* and
 * agreed with each other. Nothing could detect it, and in the Americas today's
 * high silently became tomorrow's every afternoon.
 *
 * `is_today` is optional on the type for compatibility with a response cached
 * from before the fix. A row that does not carry it is **unknown, not false** —
 * hence the fallback, which reproduces the old behaviour rather than reporting
 * "no reading for today yet" for a whole feed.
 *
 * `null` remains a real state, not an error: it renders as "no reading for
 * today yet" rather than an em-dash row that reads like missing instrumentation,
 * and never by relabelling tomorrow's numbers as today's.
 */
export function findToday(
  snapshots: readonly ForecastSnapshot[] | undefined,
): ForecastSnapshot | null {
  if (snapshots === undefined) return null

  const flagged = snapshots.find((s) => s.is_today === true)
  if (flagged !== undefined) return flagged

  // No row carries the flag at all — a pre-fix cached response. Fall back to the
  // old UTC comparison rather than showing an empty screen.
  if (snapshots.every((s) => s.is_today === undefined)) {
    const utcToday = new Date().toISOString().slice(0, 10)
    return snapshots.find((s) => s.forecast_date === utcToday) ?? null
  }

  // Rows are flagged and none is today: the feed genuinely starts tomorrow.
  return null
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
