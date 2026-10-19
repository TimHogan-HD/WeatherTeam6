import { barGivesWay, isSectionRoot, sectionFor } from './bottomNav.js'

/**
 * How a change of screen moves (owner, 2026-10-19, from the hybrid mockup):
 * `in` slides the new screen in from the right as the old drifts left, `back`
 * is the same run the other way, and `fade` is a crag opened from a section's
 * first screen or left back to one, where the old screen fades and settles.
 * Null is no motion: one section to another by the bar, and one crag to the
 * next by the switcher, which moves its own content (`wt6-swipe`).
 */
export type PageMotion = 'in' | 'back' | 'fade'

/**
 * A section's first screen is the floor and a task screen (`sectionFor` null:
 * add, feedback, an editor, a new trip) the top, so opening one is always
 * forward and leaving it always back. Anything else is as deep as its path.
 */
function depth(pathname: string): number {
  if (isSectionRoot(pathname)) return 0
  if (sectionFor(pathname) === null) return TASK_DEPTH
  return pathname.split('/').filter((part) => part !== '').length
}

const TASK_DEPTH = 100

export function pageMotion(from: string, to: string): PageMotion | null {
  if (from === to) return null
  if ((isSectionRoot(from) && barGivesWay(to)) || (barGivesWay(from) && isSectionRoot(to))) return 'fade'
  const a = depth(from)
  const b = depth(to)
  if (b > a) return 'in'
  if (b < a) return 'back'
  return null
}
