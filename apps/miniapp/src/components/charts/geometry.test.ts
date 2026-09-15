import { describe, expect, it } from 'vitest'
import {
  bandPath,
  contiguousRuns,
  extent,
  linePath,
  linearScale,
  padExtent,
  niceTicks,
  unionExtent,
} from './geometry.js'

/**
 * Every assertion here is aimed at a specific line of the implementation, and
 * the fixtures are built to reach it. The trap this repo keeps falling into is
 * a green test whose input never touches the branch its name describes — a
 * non-negativity assertion run against an early return, a model-attribution
 * assertion run against a fixture with one model in it.
 */

const alwaysAdjacent = () => true

describe('contiguousRuns', () => {
  it('breaks a run at an undefined value', () => {
    const present = [true, true, false, true]
    const runs = contiguousRuns(4, (i) => present[i] === true, alwaysAdjacent)
    expect(runs).toEqual([
      { start: 0, end: 1 },
      { start: 3, end: 3 },
    ])
  })

  it('breaks a run between two present values that are not adjacent', () => {
    // Both values are there. Only the gap in *time* separates them — this is
    // the missing-row case, and joining across it draws a line through an hour
    // nothing was forecast for.
    const runs = contiguousRuns(
      3,
      () => true,
      (previous) => previous !== 0,
    )
    expect(runs).toEqual([
      { start: 0, end: 0 },
      { start: 1, end: 2 },
    ])
  })

  it('returns nothing when no index is defined', () => {
    expect(contiguousRuns(3, () => false, alwaysAdjacent)).toEqual([])
  })
})

describe('extent', () => {
  it('ignores nulls', () => {
    expect(extent([null, 4, null, -2])).toEqual({ min: -2, max: 4 })
  })

  it('ignores a NaN rather than letting it poison the domain', () => {
    // Math.min(NaN, 1) is NaN, and every scale built from it returns NaN for
    // every point — one bad sample erasing the chart instead of itself.
    expect(extent([1, Number.NaN, 3])).toEqual({ min: 1, max: 3 })
  })

  it('ignores an Infinity', () => {
    expect(extent([1, Number.POSITIVE_INFINITY])).toEqual({ min: 1, max: 1 })
  })

  it('is null when nothing is measurable', () => {
    expect(extent([null, null])).toBeNull()
    expect(extent([])).toBeNull()
  })

  it('keeps a real zero, which is not the same as a missing value', () => {
    expect(extent([0, 0])).toEqual({ min: 0, max: 0 })
  })
})

describe('unionExtent', () => {
  it('covers every extent it is given and skips the nulls', () => {
    expect(unionExtent([{ min: 2, max: 5 }, null, { min: -1, max: 3 }])).toEqual({
      min: -1,
      max: 5,
    })
  })

  it('is null when every input is', () => {
    expect(unionExtent([null, null])).toBeNull()
  })
})

describe('padExtent', () => {
  it('pads by a fraction of the span', () => {
    expect(padExtent({ min: 0, max: 10 }, 0.1, 2)).toEqual({ min: -1, max: 11 })
  })

  it('gives a flat series a span of its own', () => {
    // Without this the padding is zero, the domain stays degenerate, and the
    // flat line is drawn along the top edge where it reads as a maximum.
    expect(padExtent({ min: 7, max: 7 }, 0.1, 2)).toEqual({ min: 6, max: 8 })
  })
})

describe('linearScale', () => {
  it('maps the domain onto the range', () => {
    const scale = linearScale({ min: 0, max: 10 }, 0, 100)
    expect(scale(0)).toBe(0)
    expect(scale(5)).toBe(50)
    expect(scale(10)).toBe(100)
  })

  it('inverts when the range does — that is how y grows downwards', () => {
    const scale = linearScale({ min: 0, max: 10 }, 100, 0)
    expect(scale(0)).toBe(100)
    expect(scale(10)).toBe(0)
  })

  it('returns the middle of the range for a zero-width domain, never NaN', () => {
    // A NaN coordinate makes the whole path render nothing, silently.
    const scale = linearScale({ min: 5, max: 5 }, 0, 100)
    expect(scale(5)).toBe(50)
    expect(Number.isNaN(scale(5))).toBe(false)
  })
})

describe('linePath', () => {
  it('draws a move and a line per point', () => {
    expect(linePath([{ x: 0, y: 1 }, { x: 2, y: 3 }])).toBe('M0,1 L2,3')
  })

  it('is empty for a single point, because one point paints nothing', () => {
    // `M x,y` alone is invisible at any stroke width. The empty string is what
    // tells the caller to draw a dot instead of trusting an invisible path.
    expect(linePath([{ x: 1, y: 1 }])).toBe('')
    expect(linePath([])).toBe('')
  })

  it('rounds coordinates', () => {
    expect(linePath([{ x: 1.23456, y: 2 }, { x: 3, y: 4 }])).toBe('M1.23,2 L3,4')
  })
})

describe('bandPath', () => {
  it('runs along the upper edge and back along the lower one', () => {
    const upper = [{ x: 0, y: 0 }, { x: 10, y: 0 }]
    const lower = [{ x: 0, y: 5 }, { x: 10, y: 5 }]
    expect(bandPath(upper, lower)).toBe('M0,0 L10,0 L10,5 L0,5 Z')
  })

  it('is empty when the two edges are different lengths', () => {
    expect(bandPath([{ x: 0, y: 0 }], [])).toBe('')
    expect(bandPath([], [])).toBe('')
  })
})

describe('niceTicks', () => {
  it('lands on round numbers, not on even fractions of the span', () => {
    // A domain of 51.2-74.8 divided evenly into four gives 57.1 / 63.0 / 68.9 —
    // arithmetically even and useless to read a bar against.
    expect(niceTicks({ min: 51.2, max: 74.8 }, 4)).toEqual([55, 60, 65, 70])
  })

  it('includes zero for a magnitude scale', () => {
    // 25 is not a 1/2/5/10 step, so the ramp lands on twenties.
    expect(niceTicks({ min: 0, max: 100 }, 4)).toEqual([0, 20, 40, 60, 80, 100])
  })

  it('never prints a negative zero', () => {
    // `-0` survives arithmetic and reaches a formatter as "-0".
    const ticks = niceTicks({ min: -10, max: 10 }, 4)
    expect(ticks).toContain(0)
    expect(ticks.some((t) => Object.is(t, -0))) .toBe(false)
  })

  it('drops ticks that would fall outside the domain rather than drawing off-frame', () => {
    const ticks = niceTicks({ min: 2.4, max: 3.1 }, 3)
    expect(ticks.every((t) => t >= 2.4 && t <= 3.1)).toBe(true)
  })

  it('is empty for a domain with no width, rather than looping forever', () => {
    expect(niceTicks({ min: 5, max: 5 }, 3)).toEqual([])
    expect(niceTicks({ min: 0, max: Number.NaN }, 3)).toEqual([])
  })
})

describe('niceTicks — fewer ticks on a short plot', () => {
  it('honours the count it is asked for, so the caller can cut it down', () => {
    // `VALUE_TICKS` is an aim, not a promise: the 70-unit chance chart asked
    // for four and got six, 8.8 units apart under a 10px label. The caller
    // divides its plot height by `MIN_TICK_GAP` and asks for fewer.
    expect(niceTicks({ min: 0, max: 100 }, 2)).toEqual([0, 50, 100])
    expect(niceTicks({ min: 0, max: 100 }, 4)).toEqual([0, 20, 40, 60, 80, 100])
  })
})
