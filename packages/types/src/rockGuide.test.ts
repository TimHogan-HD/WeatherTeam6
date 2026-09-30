import { describe, expect, it } from 'vitest'
import { ROCK_TYPES } from './index.js'
import { rockGuide } from './rockGuide.js'

describe('rockGuide', () => {
  const recorded = ROCK_TYPES.filter((r) => r !== 'unknown')

  it('has no guide for an unrecorded rock', () => {
    expect(rockGuide('unknown')).toBeNull()
  })

  // The tab is a glance, not an essay (owner, 2026-09-29): every line has to
  // fit a phone in two or three rows.
  it.each(recorded)('%s stays short', (rockType) => {
    const guide = rockGuide(rockType)
    expect(guide).not.toBeNull()
    if (guide === null) return
    for (const line of [guide.tagline, guide.rain, guide.sun, ...guide.care, ...guide.avoid]) {
      expect(line.length).toBeGreaterThan(0)
      expect(line.length).toBeLessThanOrEqual(100)
    }
    for (const line of [guide.formed, guide.holds]) {
      expect(line.length).toBeGreaterThan(0)
      expect(line.length).toBeLessThanOrEqual(120)
    }
    expect(guide.styles.length).toBeGreaterThanOrEqual(2)
    expect(guide.styles.length).toBeLessThanOrEqual(4)
    expect(guide.care.length + guide.avoid.length).toBeLessThanOrEqual(3)
  })
})
