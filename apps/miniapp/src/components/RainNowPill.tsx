import type { CSSProperties } from 'react'
import { colorsV2 } from '@weatherteam6/design/tokens'
import { rainNowCardText, rainNowHeroText, rainNowIsCurrent, type RainNow } from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { useNow } from '../hooks/useNow.js'

/**
 * What radar says is falling at a place now (#313, owner's pick 2026-10-26:
 * the rain pill, with the radar time). The list card's is short; the hero's
 * names the rate.
 *
 * Says nothing while radar is loading, failed, has no coverage, or the last
 * frame on screen has gone stale — never "not raining". Never remembered
 * across opens: a raining pill from an hour ago is a stale reading.
 */
export function RainNowPill({
  rainNow,
  locationId,
  utcOffsetSeconds,
  size,
}: {
  rainNow: RainNow | null | undefined
  locationId: string
  /** The place's offset; null prints the pill without the radar time. */
  utcOffsetSeconds: number | null
  size: 'card' | 'hero'
}) {
  const clock = useNow()
  const place = rainNow?.places.find((p) => p.location_id === locationId)
  if (rainNow == null || place === undefined || !rainNowIsCurrent(rainNow.valid_at, clock)) return null
  const input = { rateMmH: place.rate_mm_h, validAt: rainNow.valid_at, utcOffsetSeconds }
  const text = size === 'hero' ? rainNowHeroText(input) : rainNowCardText(input)
  if (text === null) return null

  const style: CSSProperties = {
    ...(size === 'hero' ? typeV2.lead : typeV2.rowSmall),
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    width: 'fit-content',
    maxWidth: '100%',
    marginTop: size === 'hero' ? '8px' : '6px',
    padding: size === 'hero' ? '4px 12px' : '2px 9px',
    borderRadius: '999px',
    border: `1px solid ${colorsV2.rainTintBorder}`,
    background: colorsV2.rainTint,
    color: colorsV2.rain,
    fontWeight: 600,
  }
  return (
    <span data-rain-now="" style={style}>
      <span
        aria-hidden="true"
        style={{ width: '7px', height: '7px', borderRadius: '50%', background: colorsV2.rainMark, flex: 'none' }}
      />
      {text}
    </span>
  )
}
