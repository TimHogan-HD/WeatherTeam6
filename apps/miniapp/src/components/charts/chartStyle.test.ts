import { describe, expect, it } from 'vitest'
import { cToF } from '@weatherteam6/types'
import { IDEAL_TEMP_C, tempColor } from './chartStyle.js'

/**
 * The temperature ramp is **continuous**, so the properties worth asserting are
 * different from the ones a stepped scale has.
 *
 * A stepped ramp is tested by naming each step's colour, which is what the first
 * build did — and that test passed while the two warm steps were ΔE 13.0 apart,
 * below the floor for telling two hues apart, because "is this step `fair`?"
 * cannot detect that. What matters for a continuous scale is that it is ordered,
 * that its ends are unmistakably different, and that nothing in the middle
 * doubles back.
 */

function channels(css: string): [number, number, number] {
  const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(css)
  if (m === null) throw new Error(`not an rgb() colour: ${css}`)
  return [Number(m[1]), Number(m[2]), Number(m[3])]
}

/**
 * How far round the ramp a colour sits, as red-minus-green.
 *
 * **Not red-minus-blue**, which is the obvious choice and is wrong here: the
 * warm end runs amber `#f6ad55` → red `#fc8181`, and the red carries *more*
 * blue than the amber does, so r−b falls across that segment while the ramp is
 * plainly getting hotter. r−g tracks the hue rotation the eye actually reads
 * (blue → neutral → orange → red) and is monotonic across every stop.
 */
function warmth(css: string): number {
  const [r, g] = channels(css)
  return r - g
}

describe('tempColor', () => {
  it('is centred on the middle of the score’s full-marks band', () => {
    // Not the bottom of it. The mockup's 50 °F is 10 °C, which is `idealMin` —
    // centring there would paint the whole range the scorer likes best as warm.
    expect(IDEAL_TEMP_C).toBe(16)
    expect(Math.round(cToF(IDEAL_TEMP_C))).toBe(61)
  })

  it('is the ramp’s neutral at the ideal temperature', () => {
    expect(channels(tempColor(IDEAL_TEMP_C))).toEqual([203, 213, 224])
  })

  it('gets monotonically warmer from freezing to scorching, with no reversal', () => {
    // A ramp that doubles back puts two different temperatures on the same
    // colour and reads as a mistake in the data rather than in the scale.
    const samples = []
    for (let c = -20; c <= 45; c += 1) samples.push(warmth(tempColor(c)))
    for (let i = 1; i < samples.length; i += 1) {
      expect(samples[i]).toBeGreaterThanOrEqual(samples[i - 1] ?? 0)
    }
  })

  it('separates its ends unmistakably', () => {
    // The failure the stepped version had was at the *ends* being too close.
    // Cold is blue-dominant, hot is red-dominant, and nothing subtle about it.
    const cold = channels(tempColor(-15))
    const hot = channels(tempColor(40))
    expect(cold[2]).toBeGreaterThan(cold[0]) // more blue than red
    expect(hot[0]).toBeGreaterThan(hot[2]) // more red than blue
    expect(warmth(tempColor(40)) - warmth(tempColor(-15))).toBeGreaterThan(150)
  })

  it('moves smoothly, so neighbouring hours are not banded', () => {
    // Continuity is the property that makes `fair` and `poor` safe to sit next
    // to each other in this ramp: a reader is comparing position, not naming a
    // category. One degree must never be a visible jump.
    for (let c = -10; c <= 40; c += 1) {
      const step = Math.abs(warmth(tempColor(c + 1)) - warmth(tempColor(c)))
      expect(step).toBeLessThan(20)
    }
  })

  it('clamps rather than extrapolating past its ends', () => {
    expect(tempColor(-60)).toBe(tempColor(-40))
    expect(tempColor(80)).toBe(tempColor(60))
  })

  it('answers a non-finite temperature with the no-data colour, never a real one', () => {
    expect(tempColor(Number.NaN)).not.toMatch(/^rgb\(/)
  })
})
