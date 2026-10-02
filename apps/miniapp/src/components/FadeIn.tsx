import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { motion } from '@weatherteam6/design/tokens'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js'

/**
 * Fades its children in once, on mount — for a card's weather arriving after
 * the card was drawn (`design-system-v1.md` § CSS and motion). Under
 * `prefers-reduced-motion` it appears at once.
 *
 * Two frames before the opacity flips, so the browser has painted the 0 it is
 * transitioning from; one frame can land in the same paint and skip the fade.
 */
export function FadeIn({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  const reduced = usePrefersReducedMotion()
  const [shown, setShown] = useState(false)
  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setShown(true))
    })
    return () => cancelAnimationFrame(frame)
  }, [])
  return (
    <div
      style={{
        ...style,
        opacity: reduced || shown ? 1 : 0,
        transition: reduced ? 'none' : `opacity ${motion.fadeMs}ms ${motion.easeOut}`,
      }}
    >
      {children}
    </div>
  )
}
