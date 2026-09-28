import { describe, it, expect } from 'vitest'
import { cliffAngleFromWallAngle, compassDegrees, wallAngleFromCliffAngle } from './index.js'

describe('wall angle conventions', () => {
  it('flips the sign between climbers’ degrees and the stored column', () => {
    // climbing-terminology-research.md §1: a "30° wall" overhangs; the column
    // stores a slab as positive.
    expect(cliffAngleFromWallAngle(30)).toBe(-30)
    expect(cliffAngleFromWallAngle(-20)).toBe(20)
    expect(wallAngleFromCliffAngle(20)).toBe(-20)
    expect(wallAngleFromCliffAngle(-90)).toBe(90)
  })

  it('keeps vertical as 0 rather than -0, and unset as null', () => {
    expect(Object.is(cliffAngleFromWallAngle(0), 0)).toBe(true)
    expect(Object.is(wallAngleFromCliffAngle(0), 0)).toBe(true)
    expect(wallAngleFromCliffAngle(null)).toBeNull()
    expect(wallAngleFromCliffAngle(Number.NaN)).toBeNull()
  })
})

describe('compassDegrees', () => {
  it('maps the 16 points to exact multiples of 22.5°', () => {
    expect(compassDegrees('N')).toBe(0)
    expect(compassDegrees('nne')).toBe(22.5)
    expect(compassDegrees('S')).toBe(180)
    expect(compassDegrees('NNW')).toBe(337.5)
  })

  it('returns null for anything else, where aspectToDegrees would say 180', () => {
    expect(compassDegrees(null)).toBeNull()
    expect(compassDegrees('south')).toBeNull()
    expect(compassDegrees('')).toBeNull()
  })
})
