import { useEffect, useState, type RefObject } from 'react'

/**
 * How far down the page `ref` starts, in px, so a caller can size it to fill
 * the rest of the screen: `calc(100dvh - ${top}px)`. `null` while disabled or
 * before the first measurement.
 *
 * Re-measured whenever the page resizes, because what sits above it does: a
 * location name that wraps, an alert banner that arrives after the first paint.
 * Setting the height below `ref` changes the page's height but not `ref`'s
 * top, so the measurement settles rather than looping.
 */
export function useScreenRemainder(ref: RefObject<HTMLElement | null>, enabled: boolean): number | null {
  const [top, setTop] = useState<number | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!enabled || el === null) {
      setTop(null)
      return
    }
    const measure = () => setTop(Math.round(el.getBoundingClientRect().top + window.scrollY))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(document.body)
    return () => observer.disconnect()
  }, [ref, enabled])

  return top
}
