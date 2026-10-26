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

export function climbHourColumns(h: ClimbHours | null): ClimbHourColumns {
  return { climb_first_hour: h?.first ?? null, climb_last_hour: h?.last ?? null }
}
