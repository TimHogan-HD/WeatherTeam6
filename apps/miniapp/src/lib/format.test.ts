import { describe, expect, it } from 'vitest'
import { formatLocalHour, formatRunAge, formatUpdatedAt } from './format.js'

const NOW = Date.parse('2026-08-25T12:00:00.000Z')

describe('formatUpdatedAt', () => {
  it('renders nothing before anything has loaded', () => {
    // dataUpdatedAt is 0 until the first success — "Updated 56 years ago" is
    // what a naive subtraction produces here.
    expect(formatUpdatedAt(0, NOW)).toBeNull()
  })

  it('crosses each boundary once', () => {
    expect(formatUpdatedAt(NOW, NOW)).toBe('Updated just now')
    expect(formatUpdatedAt(NOW - 59_000, NOW)).toBe('Updated just now')
    expect(formatUpdatedAt(NOW - 60_000, NOW)).toBe('Updated 1 min ago')
    expect(formatUpdatedAt(NOW - 12 * 60_000, NOW)).toBe('Updated 12 min ago')
    expect(formatUpdatedAt(NOW - 59 * 60_000, NOW)).toBe('Updated 59 min ago')
    expect(formatUpdatedAt(NOW - 60 * 60_000, NOW)).toBe('Updated 1 h ago')
    expect(formatUpdatedAt(NOW - 5 * 60 * 60_000, NOW)).toBe('Updated 5 h ago')
  })
})

describe('formatRunAge', () => {
  const iso = (offsetMs: number) => new Date(NOW - offsetMs).toISOString()

  it('crosses each boundary once', () => {
    expect(formatRunAge(iso(0), NOW)).toBe('Forecast fetched just now')
    expect(formatRunAge(iso(60_000), NOW)).toBe('Forecast fetched 1 min ago')
    expect(formatRunAge(iso(59 * 60_000), NOW)).toBe('Forecast fetched 59 min ago')
    expect(formatRunAge(iso(60 * 60_000), NOW)).toBe('Forecast fetched 1 h ago')
  })

  it('says nothing for a run that did not carry a timestamp', () => {
    // Null is unknown. A freshness claim is worse than no line at all.
    expect(formatRunAge(null, NOW)).toBeNull()
  })

  it('says nothing for a timestamp it cannot read', () => {
    expect(formatRunAge('never', NOW)).toBeNull()
  })

  it('says nothing for a run stamped in the future', () => {
    // Clock skew between the device and the server. "-3 min ago" is the naive
    // answer and it renders as a measurement.
    expect(formatRunAge(iso(-3 * 60_000), NOW)).toBeNull()
  })
})

describe('formatLocalHour', () => {
  const NOON_UTC = Date.UTC(2026, 8, 14, 12)

  it('reads the clock at the location, not in UTC and not on the viewer', () => {
    // Red Wing in September is UTC-5. Noon UTC is 7 AM there, and the whole
    // point of carrying `utc_offset_seconds` on the response is that neither
    // side re-derives this (issue #33).
    expect(formatLocalHour(NOON_UTC, -5 * 3600)).toBe('7 AM')
    expect(formatLocalHour(NOON_UTC, 0)).toBe('12 PM')
    // Across the date line, where using the viewer's clock would be a day out.
    expect(formatLocalHour(NOON_UTC, 13 * 3600)).toBe('1 AM')
  })

  it('writes both twelves as 12, never as 0', () => {
    expect(formatLocalHour(Date.UTC(2026, 8, 14, 0), 0)).toBe('12 AM')
    expect(formatLocalHour(Date.UTC(2026, 8, 14, 12), 0)).toBe('12 PM')
  })

  it('handles an offset that is not a whole hour', () => {
    // Kathmandu is +5:45; Adelaide +9:30. An implementation dividing by 3600
    // and rounding would put these on the wrong hour.
    expect(formatLocalHour(NOON_UTC, 5 * 3600 + 45 * 60)).toBe('5 PM')
    expect(formatLocalHour(Date.UTC(2026, 8, 14, 3, 0), 9 * 3600 + 30 * 60)).toBe('12 PM')
  })

  it('returns null rather than a label built from an unreadable input', () => {
    // `new Date(NaN).getUTCHours()` is NaN, which would render "NaN AM".
    expect(formatLocalHour(Number.NaN, 0)).toBeNull()
    expect(formatLocalHour(NOON_UTC, Number.NaN)).toBeNull()
  })
})
