import { useId } from 'react'
import { chartGlow, colors, colorsV2 } from '@weatherteam6/design/tokens'
import { MAX_HOURS, MIN_HOURS, type RockType } from '@weatherteam6/types'
import { GlowFilter, DISPLAY, MONO } from './charts/liquid.js'

/**
 * The drying clock (hybrid mockup's `dryClock`, owner 2026-10-19): a wavy ring
 * that fills with the hours since real rain against the rock's slowest drying
 * time (`MAX_HOURS`), a tick where its fastest (`MIN_HOURS`) falls, and the
 * hours in the middle. The ring takes the Dryness word's colour.
 *
 * **Display only.** The score's own drying runs on eight walls with sun, wind
 * and humidity; this draws the table it starts from, and says so in the line
 * beside it. `hours` null — no real rain in the window, or no window — draws
 * an empty ring with a dash, never a full one.
 */

/** A ring whose radius ripples, from twelve o'clock clockwise through `frac` of a turn. */
function wavyArc(cx: number, cy: number, r: number, frac: number, amp: number, k: number): string {
  if (frac <= 0) return ''
  const n = Math.max(2, Math.round(160 * frac))
  let d = ''
  for (let i = 0; i <= n; i++) {
    const t = -Math.PI / 2 + (i / n) * frac * Math.PI * 2
    const rr = r + amp * Math.sin(k * t)
    d += `${i === 0 ? 'M' : 'L'}${(cx + Math.cos(t) * rr).toFixed(1)} ${(cy + Math.sin(t) * rr).toFixed(1)}`
  }
  return d
}

const DRYNESS_COLOR: Record<string, string> = {
  Dry: colors.good,
  Drying: colors.fair,
  Wet: colorsV2.rainMark,
}

export function DryingClock({
  hours,
  rockType,
  dryness,
  size = 96,
  label,
}: {
  /** Whole hours since real rain, or null when the window held none. */
  hours: number | null
  rockType: RockType
  /** The Dryness word, for the ring's colour. */
  dryness: string | null
  size?: number
  /** What the clock says, for a screen reader. */
  label: string
}) {
  const glow = useId()
  const min = MIN_HOURS[rockType]
  const max = MAX_HOURS[rockType]
  const frac = hours === null ? 0 : Math.min(1, hours / max)
  const tick = -Math.PI / 2 + (min / max) * Math.PI * 2
  const color = (dryness === null ? null : DRYNESS_COLOR[dryness]) ?? colorsV2.txt2
  return (
    <svg width={size} height={size} viewBox="0 0 110 110" role="img" aria-label={label} style={{ flex: 'none', overflow: 'visible' }}>
      <defs>
        <GlowFilter id={glow} />
      </defs>
      <circle cx={55} cy={55} r={40} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth={7} />
      <line
        x1={55 + Math.cos(tick) * 31}
        y1={55 + Math.sin(tick) * 31}
        x2={55 + Math.cos(tick) * 49}
        y2={55 + Math.sin(tick) * 49}
        stroke={colorsV2.txtMuted}
        strokeWidth={2}
        strokeLinecap="round"
      />
      {frac > 0 ? (
        <path
          d={wavyArc(55, 55, 40, frac, 2.6, 12)}
          fill="none"
          stroke={color}
          strokeWidth={7 * chartGlow.strokeScale * 1.8}
          strokeLinecap="round"
          filter={`url(#${glow})`}
        />
      ) : null}
      <text x={55} y={58} textAnchor="middle" fontFamily={DISPLAY} fontWeight={700} fontSize={24} fill={colorsV2.txt1}>
        {hours === null ? '—' : hours >= 48 ? `${Math.floor(hours / 24)} d` : `${hours} h`}
      </text>
      <text x={55} y={72} textAnchor="middle" fontFamily={MONO} fontSize={8} fill={colorsV2.txtMuted}>
        since rain
      </text>
    </svg>
  )
}
