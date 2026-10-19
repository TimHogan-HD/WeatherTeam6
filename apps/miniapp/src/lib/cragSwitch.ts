import type { Location } from '@weatherteam6/types'

/** Which way the switcher moved: toward a place later in the row, or earlier. */
export type SwipeDirection = 1 | -1

const SWIPE_KEY = 'swipe'

/**
 * The places across a crag's top, in saved order. The one being read is
 * always among them: a place saved a moment ago can be missing from a list
 * fetched before it.
 */
export function switcherOptions(saved: readonly Location[], current: Location): { id: string; name: string }[] {
  const options = saved.map((l) => ({ id: l.id, name: l.name }))
  return options.some((o) => o.id === current.id) ? options : [...options, { id: current.id, name: current.name }]
}

export function swipeDirection(order: readonly string[], from: string, to: string): SwipeDirection {
  return order.indexOf(to) > order.indexOf(from) ? 1 : -1
}

/**
 * The router state for the next place: the current state kept whole, so back
 * still returns to the map when a pin opened the first one, and the direction
 * for the content to arrive from.
 */
export function switchState(state: unknown, direction: SwipeDirection): Record<string, unknown> {
  const kept = typeof state === 'object' && state !== null ? (state as Record<string, unknown>) : {}
  return { ...kept, [SWIPE_KEY]: direction }
}

export function swipeOf(state: unknown): SwipeDirection | null {
  if (typeof state !== 'object' || state === null) return null
  const value = (state as Record<string, unknown>)[SWIPE_KEY]
  return value === 1 || value === -1 ? value : null
}
