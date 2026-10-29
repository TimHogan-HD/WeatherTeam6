import { describe, expect, it } from 'vitest'
import { clock12, hour12 } from './clock.js'

describe('clock12', () => {
  it('puts midnight and noon at 12, on the right side of the day', () => {
    expect(clock12(0, 'compact')).toBe('12am')
    expect(clock12(12, 'compact')).toBe('12pm')
    expect(clock12(11, 'compact')).toBe('11am')
    expect(clock12(23, 'compact')).toBe('11pm')
  })

  it('writes each style', () => {
    expect(clock12(15, 'tick')).toBe('3p')
    expect(clock12(15, 'compact')).toBe('3pm')
    expect(clock12(15, 'spaced')).toBe('3 pm')
    expect(clock12(15, 'upper')).toBe('3 PM')
    expect(clock12(6, 'upper')).toBe('6 AM')
  })
})

describe('hour12', () => {
  it('maps every hour onto 1–12', () => {
    expect(Array.from({ length: 24 }, (_, h) => hour12(h))).toEqual([
      12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ])
  })
})
