import { describe, expect, it } from 'vitest'
import {
  bandPath,
  contiguousRuns,
  extent,
  linePath,
  linearScale,
  padExtent,
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
