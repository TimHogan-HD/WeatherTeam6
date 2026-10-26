import { describe, it, expect } from 'vitest'
import { formatRadarTime, formatRainRate, rainNowCardText, rainNowHeroText, rainNowKind } from './rainNowCopy.js'

const IN = 25.4
const AT = '2026-10-26T21:18:00.000Z'
const CDT = -5 * 3600

describe('rainNowKind', () => {
  it.each([
    [null, null],
    [0, null],
    [-3, null],
    [Number.NaN, null],
    [0.1, 'Drizzle'],
    [0.0199 * IN, 'Drizzle'],
    [0.02 * IN, 'Light'],
    [0.1 * IN, 'Light'],
    [0.1001 * IN, 'Moderate'],
    [0.3 * IN, 'Moderate'],
    [0.3001 * IN, 'Heavy'],
    [175, 'Heavy'],
  ])('%s mm/hr is %s', (rate, kind) => {
    expect(rainNowKind(rate)).toBe(kind)
  })
})

describe('formatRainRate', () => {
  it('prints inches to the hundredth', () => {
    expect(formatRainRate(2.9)).toBe('0.11 in/hr')
  })
  it('never prints 0.00 for rain radar saw', () => {
    expect(formatRainRate(0.1)).toBe('under 0.01 in/hr')
  })
})

describe('formatRadarTime', () => {
  it('is the frame time at the place', () => {
    expect(formatRadarTime(AT, CDT)).toBe('4:18pm')
    expect(formatRadarTime('2026-10-26T05:03:00Z', CDT)).toBe('12:03am')
  })
  it('is null for an unreadable time', () => {
    expect(formatRadarTime('soon', CDT)).toBeNull()
  })
})

describe('rain now copy', () => {
  it('names the band and the radar time', () => {
    expect(rainNowCardText({ rateMmH: 2.9, validAt: AT, utcOffsetSeconds: CDT })).toBe('Raining · moderate · radar 4:18pm')
    expect(rainNowHeroText({ rateMmH: 2.9, validAt: AT, utcOffsetSeconds: CDT })).toBe(
      'Raining now · moderate, 0.11 in/hr · radar 4:18pm',
    )
  })
  it('says Drizzle below the line that zeroes the score', () => {
    expect(rainNowCardText({ rateMmH: 0.3, validAt: AT, utcOffsetSeconds: CDT })).toBe('Drizzle · radar 4:18pm')
    expect(rainNowHeroText({ rateMmH: 0.3, validAt: AT, utcOffsetSeconds: CDT })).toBe(
      'Drizzle now · 0.01 in/hr · radar 4:18pm',
    )
  })
  it('says nothing when nothing is falling or radar has no coverage', () => {
    expect(rainNowCardText({ rateMmH: 0, validAt: AT, utcOffsetSeconds: CDT })).toBeNull()
    expect(rainNowHeroText({ rateMmH: null, validAt: AT, utcOffsetSeconds: CDT })).toBeNull()
  })
  it('leaves the time off rather than guessing a zone', () => {
    expect(rainNowCardText({ rateMmH: 9, validAt: AT, utcOffsetSeconds: null })).toBe('Raining · heavy')
  })
})
