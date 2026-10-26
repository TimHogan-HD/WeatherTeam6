import { isClimbHours, type ClimbHours } from '@weatherteam6/types'

type ClimbHourColumns = { climb_first_hour: number | null; climb_last_hour: number | null }

/**
 * A body's `climbHours`: an hours pair `isClimbHours` accepts, or null for the
 * owner's Profile hours. A pair missing an end, or carrying any other key, is
 * refused, so one end can never be stored without the other.
 */
export function isTripClimbHours(v: unknown): v is ClimbHours | null {
  if (v === null) return true
  if (typeof v !== 'object' || Array.isArray(v)) return false
  const h = v as Record<string, unknown>
  if (Object.keys(h).length !== 2 || typeof h.first !== 'number' || typeof h.last !== 'number') return false
  return isClimbHours({ first: h.first, last: h.last })
}

/** A trip row's own hours, or null when it follows Profile. */
export function tripClimbHours(row: ClimbHourColumns): ClimbHours | null {
  if (row.climb_first_hour === null || row.climb_last_hour === null) return null
  return { first: row.climb_first_hour, last: row.climb_last_hour }
}

/**
 * `GET /hourly`'s `climbFirst` and `climbLast`, which a trip screen sends so its
 * day scores read the trip's hours. Neither: `hours: null`, the reader's Profile
 * hours. One without the other, or anything `isClimbHours` refuses, is not ok.
 */
export function climbHoursFromQuery(
  query: Record<string, unknown>,
): { ok: true; hours: ClimbHours | null } | { ok: false } {
  const first = query['climbFirst']
  const last = query['climbLast']
  if (first === undefined && last === undefined) return { ok: true, hours: null }
  const hour = (v: unknown): number | null => (typeof v === 'string' && /^\d{1,2}$/.test(v) ? Number(v) : null)
  const firstHour = hour(first)
  const lastHour = hour(last)
  if (firstHour === null || lastHour === null) return { ok: false }
  const hours = { first: firstHour, last: lastHour }
  return isClimbHours(hours) ? { ok: true, hours } : { ok: false }
}

/** A trip as the recorder sees it: its dates and its own hours, if any. */
export type HoursTrip = { start: string; end: string; climbHours: ClimbHours | null }

const hoursKey = (h: ClimbHours): string => `${h.first}-${h.last}`

/**
 * The hours one date at one location is recorded under: those of the trips
 * covering it, each its own or else the owner's Profile hours. **Two covering
 * trips that disagree record the date under Profile hours**: the record is per
 * location and day, so it holds one score, and neither trip's hours is more
 * right than the other's.
 */
export function climbHoursOn(date: string, trips: readonly HoursTrip[], profile: ClimbHours): ClimbHours {
  const covering = trips.filter((t) => date >= t.start && date <= t.end).map((t) => t.climbHours ?? profile)
  const [first] = covering
  if (first === undefined) return profile
  return covering.every((h) => hoursKey(h) === hoursKey(first)) ? first : profile
}

/** Every hours `climbHoursOn` can answer for these trips: one series is read for each. */
export function climbHoursNeeded(trips: readonly HoursTrip[], profile: ClimbHours): ClimbHours[] {
  const needed = new Map<string, ClimbHours>()
  for (const t of trips) {
    const h = t.climbHours ?? profile
    needed.set(hoursKey(h), h)
  }
  const disagree = trips.some((a, i) =>
    trips
      .slice(i + 1)
      .some(
        (b) =>
          a.start <= b.end &&
          b.start <= a.end &&
          hoursKey(a.climbHours ?? profile) !== hoursKey(b.climbHours ?? profile),
      ),
  )
  if (disagree) needed.set(hoursKey(profile), profile)
  return [...needed.values()]
}

/**
 * Each date's day from the series read under that date's hours (`climbHoursOn`).
 * `series` pairs each of `climbHoursNeeded` with its days. A date no trip
 * covers falls to Profile hours and is left out when no series was read under
 * them; the recorder writes no such date anyway.
 */
export function daysUnderTripHours<D extends { local_date: string }>(
  series: readonly { hours: ClimbHours; days: readonly D[] }[],
  trips: readonly HoursTrip[],
  profile: ClimbHours,
): D[] {
  const byKey = new Map(series.map((s) => [hoursKey(s.hours), new Map(s.days.map((d) => [d.local_date, d]))]))
  const dates = [...new Set(series.flatMap((s) => s.days.map((d) => d.local_date)))].sort()
  return dates.flatMap((date) => {
    const day = byKey.get(hoursKey(climbHoursOn(date, trips, profile)))?.get(date)
    return day === undefined ? [] : [day]
  })
}

export function climbHourColumns(h: ClimbHours | null): ClimbHourColumns {
  return { climb_first_hour: h?.first ?? null, climb_last_hour: h?.last ?? null }
}
