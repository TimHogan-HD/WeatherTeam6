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
    // Whole sentences, not captions (owner, 2026-09-30): each starts with a
    // capital, ends with a full stop and stays under three phone lines.
    for (const line of [guide.formed, guide.holds]) {
      expect(line).toMatch(/^[A-Z]/)
      expect(line).toMatch(/[.”]$/)
      expect(line.length).toBeLessThanOrEqual(140)
    }
    // The holds line leads with what a climber will pull on (owner, 2026-09-30).
    expect(guide.holds).toMatch(/^Expect /)
    // A guide is shown at every crag on this rock, so it may not assume one
    // crag's style or name one (Carlton Peak's "trad and top-rope" landed on
    // a bouldering dome), and it speaks climber, not geologist (owner,
    // 2026-09-30).
    for (const line of [guide.formed, guide.holds]) {
      expect(line).not.toMatch(/\b([Aa]t [A-Z]\w+|trad|top-rope|bolts?|sport|boulder(ing|s)?|routes?)\b/)
      expect(line).not.toMatch(/\b(solution|nodules?|matrix|joints?)\b/i)
    }
    expect(guide.styles.length).toBeGreaterThanOrEqual(2)
    expect(guide.styles.length).toBeLessThanOrEqual(4)
    expect(guide.care.length + guide.avoid.length).toBeLessThanOrEqual(3)
  })
})
