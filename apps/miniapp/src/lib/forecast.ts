import type { ForecastSnapshot, WeatherAlert } from '@weatherteam6/types'
import { clock12, hour12, isSevereAlert, meridiem } from '@weatherteam6/types'

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

/**
 * `YYYY-MM-DD` as a UTC instant, or `null` when it is not one.
 *
 * Finiteness, not just presence: `Number('not')` is NaN, and a NaN date part
 * renders the literal string "Invalid Date" on screen.
 */
function parseIsoDate(isoDate: string): Date | null {
  const [year, month, day] = isoDate.split('-').map(Number)
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day)
  ) {
    return null
  }
  return new Date(Date.UTC(year, month - 1, day))
}

/** `Tue Aug 25`, formatted in UTC to match the bucket the date came from. */
export function formatForecastDate(isoDate: string): string {
  const date = parseIsoDate(isoDate)
  if (date === null) return isoDate
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * `Tue` — the chart's x-axis tick, where the full date would not fit.
 *
 * Same UTC reading as `formatForecastDate`: `local_date` is the *location's*
 * calendar day, already decided by the server, and re-reading it in the
 * viewer's timezone is how a date shifts by one (issue #33).
 */
export function formatWeekday(isoDate: string): string {
  const date = parseIsoDate(isoDate)
  if (date === null) return isoDate
  return date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })
}

/**
 * How old a place's last NWS check may be before its warnings read as not
 * checked. A judgement call: several missed runs of the schedule, and generous
 * because the stamp rides on the location list, which the app caches.
 */
export const ALERTS_CHECK_STALE_MS = 2 * 60 * 60 * 1000

export const ALERTS_UNCHECKED_LINE = 'Warnings not checked recently'

/**
 * Whether a place's warnings went unchecked lately, so an empty list must not
 * read as "no warnings" (defect class 2): a place saved since the last run, or
 * a schedule that stopped. `undefined` is an older API and says nothing.
 */
export function alertsUnchecked(checkedAt: string | null | undefined, now: number): boolean {
  if (checkedAt === undefined) return false
  if (checkedAt === null) return true
  const at = Date.parse(checkedAt)
  return !Number.isFinite(at) || now - at > ALERTS_CHECK_STALE_MS
}

/** Severe and Extreme first, so the banner order matches the ranking §7 uses. */
export function sortBySeverity(alerts: readonly WeatherAlert[]): WeatherAlert[] {
  return [...alerts].sort(
    (a, b) => Number(isSevereAlert(b.severity)) - Number(isSevereAlert(a.severity)),
  )
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The banner's end-time line (#482): `Until 9 PM`, `Until Thu 9 PM`, or
 * `Until Nov 20, 9 PM`, on the **crag's** clock.
 *
 * Read from `ends` only, the hazard's end. `expires` is when the NWS message
 * lapses and is often hours before the hazard does, so it is never printed as
 * "until". Null, so the line is absent, when NWS gave no end, when the crag's
 * offset is not in yet (the reader's own clock would put a travelling reader's
 * 9 PM at 11 PM), or when the time cannot be read. An end already behind `now`
 * says `Ended`, never a past "until".
 */
export function alertUntil(
  ends: string | null | undefined,
  utcOffsetSeconds: number | null,
  now: number,
): string | null {
  if (ends == null || utcOffsetSeconds === null || !Number.isFinite(utcOffsetSeconds) || !Number.isFinite(now)) {
    return null
  }
  const at = Date.parse(ends)
  if (!Number.isFinite(at)) return null

  const shift = utcOffsetSeconds * 1000
  const local = new Date(at + shift)
  const h = local.getUTCHours()
  const m = local.getUTCMinutes()
  const time = m === 0 ? clock12(h, 'upper') : `${hour12(h)}:${String(m).padStart(2, '0')}${meridiem(h, 'upper')}`

  const dayOf = (t: number): number => Math.floor((t + shift) / DAY_MS)
  const daysAhead = dayOf(at) - dayOf(now)
  const day =
    daysAhead === 0
      ? ''
      : daysAhead > 0 && daysAhead < 7
        ? `${local.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })} `
        : `${local.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}, `

  return `${at <= now ? 'Ended' : 'Until'} ${day}${time}`
}

/**
 * An NWS text field as paragraphs. NWS hard-wraps at about 69 characters and
 * separates paragraphs with a blank line, so a single newline is a space and a
 * blank line is a break. `[]` for a missing or blank field.
 */
export function alertParagraphs(text: string | null | undefined): string[] {
  if (text == null) return []
  return text
    .split(/\r?\n[ \t]*\r?\n/)
    .map((p) => p.replace(/\s*\r?\n\s*/g, ' ').trim())
    .filter((p) => p !== '')
}

/**
 * Source attribution now lives in `@weatherteam6/types` — the bot must name the
 * same sources for the same location, and one implementation is the only way
 * that stays true. Re-exported so the screens keep a single import site.
 */
export { forecastSourceLabel } from '@weatherteam6/types'
