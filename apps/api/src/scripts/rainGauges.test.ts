import { describe, expect, it } from 'vitest'
import { hourKey, windowRain, zonedHourToUtc } from './rainGauges.js'

describe('zonedHourToUtc', () => {
  it('reads 7 am in Minnesota as 12:00 UTC in summer and 13:00 UTC in winter', () => {
    expect(zonedHourToUtc('2026-10-30', 7, 'America/Chicago').toISOString()).toBe('2026-10-30T12:00:00.000Z')
    expect(zonedHourToUtc('2026-11-02', 7, 'America/Chicago').toISOString()).toBe('2026-11-02T13:00:00.000Z')
  })

  it('lands on the hour the morning after the clocks go back', () => {
    // Daylight saving ended at 2 am on 1 Nov 2026; 7 am that day is already standard time.
    expect(zonedHourToUtc('2026-11-01', 7, 'America/Denver').toISOString()).toBe('2026-11-01T14:00:00.000Z')
  })
})

describe('windowRain', () => {
  const end = new Date('2026-10-30T12:00:00Z')
  const hourly = (over: Record<string, number | null>) => (k: string) => (k in over ? over[k]! : 0)

  it('sums the 24 hours ending at the reading, the end hour in and the start hour out', () => {
    const rain = hourly({
      [hourKey(end)]: 1, // the hour 11-12 UTC, the last in the window
      [hourKey(new Date(end.getTime() - 23 * 3_600_000))]: 2, // the first
      [hourKey(new Date(end.getTime() - 24 * 3_600_000))]: 100, // the hour before the window
      [hourKey(new Date(end.getTime() + 3_600_000))]: 100, // the hour after
    })
    expect(windowRain(rain, end)).toBe(3)
  })

  it('withholds the window when any hour is unknown, never reads it as dry', () => {
    expect(windowRain(hourly({ [hourKey(new Date(end.getTime() - 5 * 3_600_000))]: null }), end)).toBeNull()
  })
})
