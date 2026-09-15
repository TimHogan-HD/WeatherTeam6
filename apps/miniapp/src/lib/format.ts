/**
 * Small display helpers with no React in them, kept out of the components so
 * their boundaries can be tested directly.
 */

/**
 * §5's stale/offline line. `updatedAt` is React Query's `dataUpdatedAt`, which
 * is 0 until something has actually loaded — that case renders nothing rather
 * than "Updated 56 years ago".
 */
export function formatUpdatedAt(updatedAt: number, now: number): string | null {
  if (updatedAt === 0) return null

  const minutes = Math.floor((now - updatedAt) / 60_000)
  if (minutes < 1) return 'Updated just now'
  if (minutes < 60) return `Updated ${minutes} min ago`
  return `Updated ${Math.floor(minutes / 60)} h ago`
}

/**
 * How old the stored run behind the hourly charts is.
 *
 * Not the same thing as `formatUpdatedAt`, which measures how long ago *this
 * client* fetched. A response served in 80 ms can be carrying a run collected
 * an hour ago, and the charts are only as current as the run — the bot's panels
 * print the same thing for the same reason.
 *
 * Returns `null` rather than a string for every input it cannot measure:
 * a run with no `fetched_at`, an unparseable timestamp, and a run stamped in
 * the future (clock skew), which would otherwise render as "-3 min ago".
 */
export function formatRunAge(fetchedAt: string | null, now: number): string | null {
  if (fetchedAt === null) return null

  const at = Date.parse(fetchedAt)
  if (!Number.isFinite(at)) return null

  const minutes = Math.floor((now - at) / 60_000)
  if (minutes < 0) return null
  if (minutes < 1) return 'Forecast fetched just now'
  if (minutes < 60) return `Forecast fetched ${minutes} min ago`
  return `Forecast fetched ${Math.floor(minutes / 60)} h ago`
}

/**
 * The wall-clock hour at the **location**, for an hourly axis tick.
 *
 * `utcOffsetSeconds` comes from `HourlySeries`, which got it from Open-Meteo's
 * `timezone=auto` for that point. The viewer's own offset is never used: the
 * hours belong to the crag, and reading them in the phone's timezone is how a
 * 3 PM hour becomes 11 PM for anyone travelling — the same class of mistake as
 * issue #33, and the reason `local_date` is server-derived too.
 *
 * Implemented by shifting the instant and reading it back in UTC, which is
 * exactly how the server bucketed the days. `Intl` with a timezone name is not
 * an option: the response carries an offset, not a zone id.
 *
 * Returns `null` for an instant or an offset that cannot be read, rather than
 * the literal string `Invalid Date` or `NaN AM`.
 */
export function formatLocalHour(t: number, utcOffsetSeconds: number): string | null {
  if (!Number.isFinite(t) || !Number.isFinite(utcOffsetSeconds)) return null

  const shifted = new Date(t + utcOffsetSeconds * 1000)
  const hour = shifted.getUTCHours()
  if (!Number.isFinite(hour)) return null

  const suffix = hour < 12 ? 'AM' : 'PM'
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${twelve} ${suffix}`
}

/**
 * The same hour, compact enough for an axis tick: `12a`, `6a`, `12p`, `11p`.
 *
 * Four of these fit across a 24-hour chart at 375px where `12 AM` crowds. The
 * long form stays for anywhere a label is read as words rather than scanned as
 * a position.
 */
export function formatLocalHourShort(t: number, utcOffsetSeconds: number): string | null {
  if (!Number.isFinite(t) || !Number.isFinite(utcOffsetSeconds)) return null

  const hour = new Date(t + utcOffsetSeconds * 1000).getUTCHours()
  if (!Number.isFinite(hour)) return null

  const suffix = hour < 12 ? 'a' : 'p'
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${twelve}${suffix}`
}
