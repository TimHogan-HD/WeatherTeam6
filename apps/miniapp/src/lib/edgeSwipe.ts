/**
 * A swipe in from the screen's left edge is back, on a crag's screen (hybrid
 * look, owner 2026-10-19). The figures are judgement calls, not measurements:
 * an edge strip about a thumb's width, and a travel long enough that a scrub
 * starting near the edge is not mistaken for one.
 */
export const EDGE_SWIPE = {
  /** How close to the left edge a touch must start, in CSS px. */
  edgePx: 24,
  /** How far right it must travel. */
  travelPx: 64,
} as const

export type TouchPoint = { x: number; y: number }

/** Whether a touch that started at `start` and ended at `end` was a swipe in from the edge. */
export function isEdgeSwipe(start: TouchPoint, end: TouchPoint): boolean {
  const dx = end.x - start.x
  const dy = Math.abs(end.y - start.y)
  // More sideways than down, so a scroll that drifts right is still a scroll.
  return start.x <= EDGE_SWIPE.edgePx && dx >= EDGE_SWIPE.travelPx && dy < dx / 2
}

/**
 * Only an installed app hears it. In a browser tab the browser's own edge
 * gesture already goes back, and answering it here too would go back twice.
 */
export function ownsEdgeSwipe(standaloneDisplay: boolean, iosStandalone: boolean | undefined): boolean {
  return standaloneDisplay || iosStandalone === true
}
