import { describe, expect, it } from 'vitest'
import type { RecentPrecip } from '@weatherteam6/types'
import { trimToObservedHours } from './recentPrecipWindow.js'

/**
 * The cut between what was measured and what is forecast.
 *
 * Every fixture here straddles it — a window entirely in the past would pass
 * against an implementation that returned its input untouched, which is the
 * class-11 mistake this file exists to avoid.
 */

function window(hours: string[], utc_offset_seconds: number): RecentPrecip {
  return {
    hours: hours.map((valid_at_local, i) => ({ valid_at_local, precip_mm: i + 1 })),
    utc_offset_seconds,
    from_date: hours[0]?.slice(0, 10) ?? null,
  }
}

describe('trimToObservedHours', () => {
  it('drops the forecast tail and keeps the measured hours', () => {
    // 12:00Z, and the location is on UTC, so 12:00 local.
    const now = new Date('2026-09-15T12:20:00Z')
    const trimmed = trimToObservedHours(
      window(['2026-09-15T11:00', '2026-09-15T12:00', '2026-09-15T13:00', '2026-09-16T00:00'], 0),
      now,
    )
    expect(trimmed.hours.map((h) => h.valid_at_local)).toEqual([
      '2026-09-15T11:00',
      '2026-09-15T12:00',
    ])
  })

  it('keeps the hour stamped exactly now, because it has finished', () => {
    // An hour stamped T covers T-1h to T. At 13:00 the 13:00 row is complete;
    // treating it as future would throw away a measured hour of rain.
    const trimmed = trimToObservedHours(
      window(['2026-09-15T13:00', '2026-09-15T14:00'], 0),
      new Date('2026-09-15T13:00:00Z'),
    )
    expect(trimmed.hours.map((h) => h.valid_at_local)).toEqual(['2026-09-15T13:00'])
  })

  it('cuts at the location clock, not at UTC', () => {
    // Las Vegas in September: UTC-7. 02:30Z on the 16th is 19:30 on the 15th
    // there, so the local 20:00 and 21:00 rows are still forecast — under a
    // UTC comparison both would be drawn as measured rain.
    const trimmed = trimToObservedHours(
      window(['2026-09-15T19:00', '2026-09-15T20:00', '2026-09-15T21:00'], -7 * 3600),
      new Date('2026-09-16T02:30:00Z'),
    )
    expect(trimmed.hours.map((h) => h.valid_at_local)).toEqual(['2026-09-15T19:00'])
  })

  it('treats a non-finite offset as UTC rather than emptying the window', () => {
    const trimmed = trimToObservedHours(
      { ...window(['2026-09-15T11:00', '2026-09-15T13:00'], 0), utc_offset_seconds: Number.NaN },
      new Date('2026-09-15T12:00:00Z'),
    )
    expect(trimmed.hours.map((h) => h.valid_at_local)).toEqual(['2026-09-15T11:00'])
  })

  it('leaves from_date alone, because the window still starts where it started', () => {
    // The oldest date covered is what tells a reader that "no rain" means "none
    // in this window". Trimming the future end says nothing about the past one.
    const trimmed = trimToObservedHours(
      window(['2026-09-10T00:00', '2026-09-15T23:00'], 0),
      new Date('2026-09-15T12:00:00Z'),
    )
    expect(trimmed.from_date).toBe('2026-09-10')
    expect(trimmed.hours).toHaveLength(1)
  })
})
