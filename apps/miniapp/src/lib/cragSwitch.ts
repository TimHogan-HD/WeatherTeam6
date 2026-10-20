import type { Location } from '@weatherteam6/types'

/** Which way the switcher moved: toward a place later in the row, or earlier. */
export type SwipeDirection = 1 | -1

const SWIPE_KEY = 'swipe'

/**
 * The places across a crag's top: the one being read first, then the rest in
 * saved order, wrapping round (owner, 2026-10-20: "so we only have to scroll
 * one way"). The one being read is always among them: a place saved a moment
 * ago can be missing from a list fetched before it.
 */
export function switcherOptions(saved: readonly Location[], current: Location): { id: string; name: string }[] {
  const options = saved.map((l) => ({ id: l.id, name: l.name }))
  const at = options.findIndex((o) => o.id === current.id)
  return at < 0
    ? [{ id: current.id, name: current.name }, ...options]
    : [...options.slice(at), ...options.slice(0, at)]
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
