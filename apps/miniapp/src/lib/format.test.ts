import { describe, expect, it } from 'vitest'
import { formatRunAge, formatUpdatedAt } from './format.js'

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
