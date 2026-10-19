import { useEffect, useRef } from 'react'
import { isEdgeSwipe, ownsEdgeSwipe, type TouchPoint } from '../lib/edgeSwipe.js'

/**
 * Calls `onBack` when the reader swipes in from the left edge (`lib/edgeSwipe.ts`
 * decides), in an installed app only. Passive listeners: the swipe never
 * blocks a scroll or a pull to refresh, it only answers once the touch ends.
 */
export function useEdgeSwipeBack(onBack: () => void): void {
  const latest = useRef(onBack)
  useEffect(() => {
    latest.current = onBack
  }, [onBack])

  useEffect(() => {
    const nav = navigator as Navigator & { standalone?: boolean }
    if (!ownsEdgeSwipe(window.matchMedia('(display-mode: standalone)').matches, nav.standalone)) return
    let start: TouchPoint | null = null
    let last: TouchPoint | null = null
    const point = (e: TouchEvent): TouchPoint | null => {
      const t = e.touches[0] ?? e.changedTouches[0]
      return t === undefined ? null : { x: t.clientX, y: t.clientY }
    }
    const onStart = (e: TouchEvent) => {
      start = e.touches.length === 1 ? point(e) : null
      last = start
    }
    const onMove = (e: TouchEvent) => {
      if (start !== null) last = point(e)
    }
    const onCancel = () => {
      start = null
      last = null
    }
    const onEnd = () => {
      const swiped = start !== null && last !== null && isEdgeSwipe(start, last)
      onCancel()
      if (swiped) latest.current()
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onCancel)
    }
  }, [])
}
