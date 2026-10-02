import { useEffect, useRef, useState } from 'react'
import {
  PULL_ARM_PX,
  PULL_MIN_REFRESH_MS,
  PULL_OUTCOME_MS,
  pullOffset,
  type PullPhase,
} from '../lib/pullToRefresh.js'

/**
 * Drives pull-to-refresh from touches. A pull starts only with the page at its
 * top and moving down; then this takes the gesture (`preventDefault`, so the
 * browser's own bounce does not stack on it) and reports the phase. Every other
 * touch is left alone, so scrolling and the bounce at the bottom are the
 * browser's as before. `refresh` resolves to whether it worked.
 *
 * Two things a real finger needs, each learned the hard way:
 *
 * - **A non-passive `touchmove` listener on the window from the start.** The
 *   browser decides at touchdown whether the page may take a drag over, from
 *   the listeners registered then, so one added during `touchstart` may come
 *   too late.
 * - **The element the touch started on is heard too, once it is detached.** A
 *   touch keeps its target after React replaces it (a card's weather arriving
 *   mid-pull), and a detached element's events never reach the window.
 */
export function usePullToRefresh(refresh: () => Promise<boolean>): PullPhase {
  const [phase, setPhase] = useState<PullPhase>({ kind: 'idle' })
  const busy = useRef(false)
  const refreshRef = useRef(refresh)
  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  useEffect(() => {
    let startY: number | null = null
    let offset = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let target: Node | null = null

    // Only while detached: a connected target's events also reach the window.
    const detachedMove = (e: Event) => {
      if (target?.isConnected === false) onMove(e as TouchEvent)
    }
    const detachedEnd = () => {
      if (target?.isConnected === false) onEnd()
    }
    const detachedCancel = () => {
      if (target?.isConnected === false) onCancel()
    }
    const listen = (on: Node | null) => {
      on?.addEventListener('touchmove', detachedMove, { passive: false })
      on?.addEventListener('touchend', detachedEnd)
      on?.addEventListener('touchcancel', detachedCancel)
    }
    const unlisten = (on: Node | null) => {
      on?.removeEventListener('touchmove', detachedMove)
      on?.removeEventListener('touchend', detachedEnd)
      on?.removeEventListener('touchcancel', detachedCancel)
    }

    const onStart = (e: TouchEvent) => {
      unlisten(target)
      // Under 1, not <= 0: a high-density screen can rest at a fractional offset.
      startY = !busy.current && window.scrollY < 1 && e.touches.length === 1 ? (e.touches[0]?.clientY ?? null) : null
      offset = 0
      target = startY !== null && e.target instanceof Node ? e.target : null
      listen(target)
    }
    const onMove = (e: TouchEvent) => {
      if (startY === null) return
      const finger = (e.touches[0]?.clientY ?? startY) - startY
      if (finger <= 0 && offset === 0) {
        startY = null
        return
      }
      if (e.cancelable) e.preventDefault()
      offset = pullOffset(finger)
      setPhase({ kind: 'pulling', offset })
    }
    const onCancel = () => {
      unlisten(target)
      target = null
      if (startY === null) return
      startY = null
      if (offset > 0) setPhase({ kind: 'idle' })
    }
    const onEnd = () => {
      if (startY === null) return
      if (offset < PULL_ARM_PX) {
        onCancel()
        return
      }
      startY = null
      unlisten(target)
      target = null
      busy.current = true
      setPhase({ kind: 'refreshing' })
      const minimum = new Promise((resolve) => setTimeout(resolve, PULL_MIN_REFRESH_MS))
      void Promise.all([refreshRef.current().catch(() => false), minimum]).then(([ok]) => {
        setPhase({ kind: 'settled', ok })
        timer = setTimeout(() => {
          busy.current = false
          setPhase({ kind: 'idle' })
        }, PULL_OUTCOME_MS)
      })
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onCancel)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onCancel)
      unlisten(target)
    }
  }, [])

  return phase
}
