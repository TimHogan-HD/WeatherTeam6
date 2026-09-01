import { describe, expect, it } from 'vitest'
import { SPARK_GAP, sparkline } from './sparkline.js'

describe('sparkline', () => {
  it('draws no bar for an hour nobody forecast', () => {
    // A flat run of low bars across a model's horizon reads as "no rain", which
    // is a forecast. No members is not.
    expect(sparkline([null, 50, null], 100)).toBe(`${SPARK_GAP}▄${SPARK_GAP}`)
  })

  it('separates a zero from a gap', () => {
    expect(sparkline([0], 100)).toBe('▁')
    expect(sparkline([0], 100)).not.toBe(SPARK_GAP)
  })

  it('reaches the tallest block only at the top of the scale', () => {
    expect(sparkline([100], 100)).toBe('█')
    expect(sparkline([99], 100)).toBe('█')
    expect(sparkline([87], 100)).toBe('▇')
  })

  it('gives the smallest present value a visible bar', () => {
    // `Math.floor` here would put 1% at the same height as 0%, and a rounded
    // index would give a real 1% chance no bar at all.
    expect(sparkline([1], 100)).toBe('▁')
    expect(sparkline([13], 100)).toBe('▂')
  })

  it('clamps rather than wrapping past the scale', () => {
    // An index past the end would be `undefined` and join as an empty string,
    // silently shortening the bar and misaligning every hour after it.
    expect(sparkline([250], 100)).toBe('█')
  })

  it('does not divide by a scale of zero', () => {
    // 0/0 is NaN, which would draw as a gap and claim the hour was unmeasured.
    expect(sparkline([5, 0, null], 0)).toBe(`▁▁${SPARK_GAP}`)
  })

  it('draws one character per value', () => {
    expect(sparkline([0, 10, 20, 30, null, 50, 60, 70], 100)).toHaveLength(8)
  })

  it('treats a non-finite value as missing', () => {
    expect(sparkline([Number.NaN, Number.POSITIVE_INFINITY], 100)).toBe(
      `${SPARK_GAP}${SPARK_GAP}`,
    )
  })
})
