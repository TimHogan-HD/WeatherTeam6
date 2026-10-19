import { motion } from '@weatherteam6/design/tokens'

/** Marks the element a figure flies from and to: the hero's day score, the slim header's figure. */
export const FLIP_ATTR = 'data-flip'

export type FlipRect = { left: number; top: number; height: number }

/** Where the marked figure is now, before the screen under it changes. Null when none is on screen. */
export function flipSource(name: string): FlipRect | null {
  const el = document.querySelector(`[${FLIP_ATTR}="${name}"]`)
  if (el === null) return null
  const { left, top, height } = el.getBoundingClientRect()
  return height === 0 ? null : { left, top, height }
}

/**
 * Plays the marked figure in from where it stood a moment ago (FLIP): drawn at
 * the old place and size, then let go to its own. Nothing to do under reduced
 * motion, or when there was nothing to fly from.
 */
export function flyFrom(name: string, from: FlipRect | null, reduced: boolean): void {
  if (from === null || reduced) return
  const el = document.querySelector<HTMLElement>(`[${FLIP_ATTR}="${name}"]`)
  if (el === null) return
  const to = el.getBoundingClientRect()
  if (to.height === 0) return
  el.style.transformOrigin = '0 0'
  el.style.transition = 'none'
  el.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.height / to.height})`
  void el.offsetWidth
  el.style.transition = `transform ${motion.headerFlyMs}ms ${motion.easeOut}`
  el.style.transform = ''
  window.setTimeout(() => {
    el.style.transition = ''
    el.style.transformOrigin = ''
  }, motion.headerFlyMs + 60)
}
