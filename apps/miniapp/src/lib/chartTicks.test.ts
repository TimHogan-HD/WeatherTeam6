import { describe, expect, it } from 'vitest'
import { chanceAxisTop, niceTicks } from './chartTicks.js'

describe('niceTicks', () => {
  const cases: [number, number][] = [
    [48, 71],
    [3, 37.3],
    [0, 29.2],
    [61, 61],
    [-4, 12],
    [0, 0.4],
    [30, 90],
  ]

  it.each(cases)('puts the top tick above every value and the bottom at or below (%s to %s)', (lo, hi) => {
    const ticks = niceTicks(lo, hi)
    expect(ticks[0]).toBeLessThanOrEqual(lo)
    expect(ticks[ticks.length - 1]).toBeGreaterThan(hi)
  })

  it.each(cases)('steps evenly by a whole 1, 2 or 5 times a power of ten (%s to %s)', (lo, hi) => {
    const ticks = niceTicks(lo, hi)
    const step = (ticks[1] ?? 0) - (ticks[0] ?? 0)
    expect(step).toBeGreaterThanOrEqual(1)
    expect(String(step)).toMatch(/^[125]0*$/)
    ticks.forEach((t, i) => expect(t).toBe((ticks[0] ?? 0) + i * step))
  })

  it('keeps at least two ticks on a flat day', () => {
    expect(niceTicks(61, 61).length).toBeGreaterThanOrEqual(2)
  })

  it('spends no more than one step on headroom', () => {
    expect(niceTicks(48, 71)).toEqual([40, 50, 60, 70, 80])
    expect(niceTicks(3, 37.3)).toEqual([0, 10, 20, 30, 40])
    // The UI check's day: dew point 37°F to a 67°F high, not 20-80.
    expect(niceTicks(37, 67)).toEqual([30, 40, 50, 60, 70])
  })
})

describe('chanceAxisTop', () => {
  it('is the smallest of 10, 20, 50 and 100 at or above the highest chance', () => {
    expect(chanceAxisTop(0)).toBe(10)
    expect(chanceAxisTop(2)).toBe(10)
    expect(chanceAxisTop(10)).toBe(10)
    expect(chanceAxisTop(11)).toBe(20)
    expect(chanceAxisTop(30)).toBe(50)
    expect(chanceAxisTop(51)).toBe(100)
    expect(chanceAxisTop(100)).toBe(100)
  })

  it('keeps 0-100% when no chance was read', () => {
    expect(chanceAxisTop(null)).toBe(100)
  })
})
