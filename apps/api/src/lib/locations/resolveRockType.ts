import { matchKnownCrag, type Location } from '@weatherteam6/types'

/**
 * **The rock type that gets stored, and whether it is locked** — owner
 * decision 2026-09-23. A climbing location on a `KNOWN_CRAGS` entry takes the
 * research's rock type, *whatever the request asked for*; anything else keeps
 * the caller's. This is the only place the lock is applied, so a route cannot
 * forget it. Its own module, apart from the insert, so it can be tested
 * without a database.
 *
 * A non-climbing location is never locked and never carries a rock type, even
 * standing on a crag: a town saved for its weather is not a wall.
 */
export function resolveRockType(input: {
  readonly lat: number
  readonly lon: number
  readonly is_climbing_location: boolean
  readonly rock_type: Location['rock_type']
}): { rock_type: Location['rock_type']; known_crag: string | null } {
  if (!input.is_climbing_location) return { rock_type: null, known_crag: null }
  const crag = matchKnownCrag(input.lat, input.lon)
  if (crag === null) return { rock_type: input.rock_type, known_crag: null }
  return { rock_type: crag.rock_type, known_crag: crag.slug }
}
