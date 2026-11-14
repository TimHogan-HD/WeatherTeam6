import { describe, expect, it } from 'vitest'
import { FRESH_MAX_MS, freshForMs, isFreshAt } from './queryClient.js'

/** Local times, so the hour boundary is this machine's, as it is the phone's. */
const at = (hour: number, minute = 0, second = 0) => new Date(2026, 10, 14, hour, minute, second).getTime()
const MIN = 60_000

describe('freshForMs', () => {
  it('is the full span early in the hour', () => {
    expect(freshForMs(at(10, 5))).toBe(FRESH_MAX_MS)
  })

  it('stops at the next hour late in the hour', () => {
    expect(freshForMs(at(10, 52))).toBe(8 * MIN)
  })

  it('is the full span exactly at the boundary where they meet', () => {
    expect(freshForMs(at(10, 45))).toBe(FRESH_MAX_MS)
    expect(freshForMs(at(10, 46))).toBe(14 * MIN)
  })

  it('is zero with nothing fetched', () => {
    expect(freshForMs(0)).toBe(0)
    expect(freshForMs(Number.NaN)).toBe(0)
  })
})

describe('isFreshAt', () => {
  it('trusts an answer inside its span', () => {
    expect(isFreshAt(at(10, 5), at(10, 19, 59))).toBe(true)
  })

  it('refuses it at the end of its span', () => {
    expect(isFreshAt(at(10, 5), at(10, 20))).toBe(false)
  })

  it('refuses one across the hour, however recent', () => {
    expect(isFreshAt(at(10, 58), at(10, 59, 59))).toBe(true)
    expect(isFreshAt(at(10, 58), at(11, 0, 1))).toBe(false)
  })

  it('refuses one stamped in the future', () => {
    expect(isFreshAt(at(10, 10), at(10, 9))).toBe(false)
  })

  it('refuses no answer at all', () => {
    expect(isFreshAt(0, at(10, 0))).toBe(false)
  })
})
