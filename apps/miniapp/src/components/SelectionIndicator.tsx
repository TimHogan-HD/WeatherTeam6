import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react'
import { motion } from '@weatherteam6/design/tokens'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js'

/** `moved` is false for the first measurement, so the mark does not slide into its first place. */
export type SelectedRect = { left: number; width: number; moved: boolean }

/**
 * Where the child matching `selector` sits inside `row`, which must be
 * `position: relative`. Measured before paint and again whenever the row or a
 * child resizes (a web font arriving widens every label). Null until then, and
 * always in static markup, where the caller paints the selection on the child
 * itself instead.
 */
export function useSelectedRect(
  row: RefObject<HTMLElement | null>,
  selector: string,
  selected: string,
): SelectedRect | null {
  const [rect, setRect] = useState<SelectedRect | null>(null)
  useLayoutEffect(() => {
    const el = row.current
    if (el === null) return
    const measure = () => {
      const target = el.querySelector<HTMLElement>(selector)
      setRect((before) =>
        target === null ? null : { left: target.offsetLeft, width: target.offsetWidth, moved: before !== null },
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    for (const child of Array.from(el.children)) observer.observe(child)
    return () => observer.disconnect()
  }, [row, selector, selected])
  return rect
}

/**
 * One mark that slides to the selected choice: the location tabs' underline,
 * the Hourly day chips' fill. It does not slide into its first place, and
 * under `prefers-reduced-motion` it never slides.
 */
export function SelectionIndicator({ rect, style }: { rect: SelectedRect | null; style: CSSProperties }) {
  const reduced = usePrefersReducedMotion()
  if (rect === null) return null
  const animate = rect.moved && !reduced
  const ease = `${motion.slideMs}ms ${motion.easeOut}`
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute',
        left: 0,
        pointerEvents: 'none',
        ...style,
        width: `${rect.width}px`,
        transform: `translateX(${rect.left}px)`,
        transition: animate ? `transform ${ease}, width ${ease}` : 'none',
      }}
    />
  )
}
