import { useEffect, useRef, useState } from 'react'
import { motion } from '@weatherteam6/design/tokens'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js'

const DIGITS = /^\d+$/

/** A blank cell below 9, for a digit position one value has and the other lacks. */
const BLANK = 10

/**
 * The score this figure showed before it changed on screen, for `wasHoldMs`;
 * null otherwise. **Only a change**: a figure drawn for the first time, or one
 * coming back after it was withheld (its component unmounts), has nothing to
 * have been.
 */
export function usePreviousFigure(value: string): string | null {
  const shown = useRef(value)
  const [was, setWas] = useState<string | null>(null)
  useEffect(() => {
    const before = shown.current
    shown.current = value
    if (before === value || !DIGITS.test(before) || !DIGITS.test(value)) return
    setWas(before)
    const timer = setTimeout(() => setWas(null), motion.wasHoldMs)
    return () => clearTimeout(timer)
  }, [value])
  return was
}

/**
 * A figure whose digits roll from `from` to `value`, odometer-style, when a
 * new run changes it while it is on screen; plain text otherwise, and always
 * under `prefers-reduced-motion`. The real value stays in the text, transparent,
 * so it sizes the figure and is what a screen reader reads.
 */
export function RollingFigure({ value, from }: { value: string; from: string | null }) {
  const reduced = usePrefersReducedMotion()
  if (from === null || reduced || !DIGITS.test(value) || !DIGITS.test(from)) return <>{value}</>
  // Keyed, so each change starts a fresh roll from its own start position.
  return <Roll key={`${from}>${value}`} from={from} value={value} />
}

function Roll({ value, from }: { value: string; from: string }) {
  const [landed, setLanded] = useState(false)
  useEffect(() => {
    // Two frames, so the start position is painted before it moves.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => setLanded(true))
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  const width = Math.max(value.length, from.length)
  const cells = (s: string) => s.padStart(width, ' ').split('').map((c) => (c === ' ' ? BLANK : Number(c)))
  const start = cells(from)
  const end = cells(value)

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <span style={{ color: 'transparent' }}>{value}</span>
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        <span style={{ display: 'flex', height: '1.2em', overflow: 'hidden' }}>
          {end.map((digit, i) => (
            <span
              key={i}
              style={{
                display: 'flex',
                flexDirection: 'column',
                transform: `translateY(${-1.2 * (landed ? digit : (start[i] ?? BLANK))}em)`,
                transition: landed ? `transform ${motion.rollMs}ms ${motion.easeOut}` : 'none',
              }}
            >
              {Array.from({ length: BLANK + 1 }, (_, d) => (
                <span key={d} style={{ height: '1.2em', lineHeight: '1.2em' }}>
                  {d === BLANK ? ' ' : d}
                </span>
              ))}
            </span>
          ))}
        </span>
      </span>
    </span>
  )
}
