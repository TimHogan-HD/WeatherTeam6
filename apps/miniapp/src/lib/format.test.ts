import { describe, expect, it } from 'vitest'
import { formatUpdatedAt } from './format.js'

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
