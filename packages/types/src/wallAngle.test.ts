import { describe, it, expect } from 'vitest'
import { cliffAngleFromWallAngle, compassDegrees, wallAngleFromCliffAngle, wallAngleLabel } from './index.js'

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

describe('wallAngleLabel', () => {
  it('names the side of vertical, so a bare number cannot be read backwards', () => {
    expect(wallAngleLabel(0)).toBe('Vertical')
    expect(wallAngleLabel(-20)).toBe('20° slab')
    expect(wallAngleLabel(30)).toBe('30° overhang')
    expect(wallAngleLabel(-90)).toBe('Flat')
    expect(wallAngleLabel(90)).toBe('Roof')
  })

  it('reads -0.4 as vertical rather than "0° slab"', () => {
    expect(wallAngleLabel(-0.4)).toBe('Vertical')
  })

  it('says nothing for an unrecorded angle', () => {
    expect(wallAngleLabel(null)).toBeNull()
    expect(wallAngleLabel(Number.NaN)).toBeNull()
  })
})

describe('compassDegrees', () => {
  it('maps the 16 points to exact multiples of 22.5°', () => {
    expect(compassDegrees('N')).toBe(0)
    expect(compassDegrees('nne')).toBe(22.5)
    expect(compassDegrees('S')).toBe(180)
    expect(compassDegrees('NNW')).toBe(337.5)
  })

  it('returns null for anything else, never a default south face', () => {
    expect(compassDegrees(null)).toBeNull()
    expect(compassDegrees('south')).toBeNull()
    expect(compassDegrees('')).toBeNull()
  })
})
