import type { Location } from '@weatherteam6/types'

/** Which way the switcher moved: toward a place later in the row, or earlier. */
export type SwipeDirection = 1 | -1

const SWIPE_KEY = 'swipe'
const RECENT_KEY = 'recent'

/**
 * The places across a crag's top, most recently read first: the one being read,
 * then the one just left, one tap back (owner, 2026-10-21; first is what keeps
 * the scroll one way, 2026-10-20). `recent` is the order the row showed before
 * this switch, carried in router state; places it does not name follow in saved
 * order, and places no longer saved drop out. The one being read is always
 * among them: a place saved a moment ago can be missing from a list fetched
 * before it.
 */
export function switcherOptions(
  saved: readonly Location[],
  current: Location,
  recent: readonly string[],
): { id: string; name: string }[] {
  const names = new Map(saved.map((l) => [l.id, l.name]))
  names.set(current.id, current.name)
  const options: { id: string; name: string }[] = []
  for (const id of [current.id, ...recent, ...saved.map((l) => l.id)]) {
    const name = names.get(id)
    if (name === undefined || options.some((o) => o.id === id)) continue
    options.push({ id, name })
  }
  return options
}

export function swipeDirection(order: readonly string[], from: string, to: string): SwipeDirection {
  return order.indexOf(to) > order.indexOf(from) ? 1 : -1
}

/**
 * The router state for the next place: the current state kept whole, so back
 * still returns to the map when a pin opened the first one, and the direction
 * for the content to arrive from, and the row's order for the next place to
 * reorder from.
 */
export function switchState(
  state: unknown,
  direction: SwipeDirection,
  order: readonly string[],
): Record<string, unknown> {
  const kept = typeof state === 'object' && state !== null ? (state as Record<string, unknown>) : {}
  return { ...kept, [SWIPE_KEY]: direction, [RECENT_KEY]: order }
}

/** The row's order before the last switch; none on a plain arrival or a reload with no state. */
export function recentOf(state: unknown): string[] {
  if (typeof state !== 'object' || state === null) return []
  const value = (state as Record<string, unknown>)[RECENT_KEY]
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

export function swipeOf(state: unknown): SwipeDirection | null {
  if (typeof state !== 'object' || state === null) return null
  const value = (state as Record<string, unknown>)[SWIPE_KEY]
  return value === 1 || value === -1 ? value : null
}
