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
 * **The rest of a gesture is heard on the element it started on**, not the
 * window: a touch keeps that element as its target even after React replaces
 * it (a card's weather arriving mid-pull), and a detached element's events
 * never bubble, so a window listener went deaf two moves into the pull.
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
    let target: EventTarget | null = null

    const listen = (on: EventTarget | null) => {
      on?.addEventListener('touchmove', onMove as EventListener, { passive: false })
      on?.addEventListener('touchend', onEnd)
      on?.addEventListener('touchcancel', onCancel)
    }
    const unlisten = (on: EventTarget | null) => {
      on?.removeEventListener('touchmove', onMove as EventListener)
      on?.removeEventListener('touchend', onEnd)
      on?.removeEventListener('touchcancel', onCancel)
    }

    const onStart = (e: TouchEvent) => {
      unlisten(target)
      startY = !busy.current && window.scrollY <= 0 && e.touches.length === 1 ? (e.touches[0]?.clientY ?? null) : null
      offset = 0
      target = startY === null ? null : e.target
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
    return () => {
      clearTimeout(timer)
      window.removeEventListener('touchstart', onStart)
      unlisten(target)
    }
  }, [])

  return phase
}
