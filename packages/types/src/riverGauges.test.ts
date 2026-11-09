import { describe, expect, it } from 'vitest'
import { KNOWN_CRAGS } from './knownCrags.js'
import { RIVER_GAUGES, RIVER_STALE_MS, riverChangeFt, riverGaugesFor, riverState, type RiverPoint } from './riverGauges.js'

const NOW = Date.parse('2026-11-09T15:00:00Z')
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString()
const H = 3_600_000

describe('RIVER_GAUGES', () => {
  it('is keyed only by known crag slugs', () => {
    const slugs = new Set(KNOWN_CRAGS.map((c) => c.slug))
    for (const key of Object.keys(RIVER_GAUGES)) expect(slugs.has(key)).toBe(true)
  })

  it('finds none for a location with no known crag', () => {
    expect(riverGaugesFor(null)).toEqual([])
    expect(riverGaugesFor('no-such-crag')).toEqual([])
    expect(riverGaugesFor('robinson-park')).toHaveLength(1)
  })
})

describe('riverState', () => {
  const line = 4.95
  const at = (height_ft: number, msAgo = H): RiverPoint[] => [{ at: iso(msAgo), height_ft }]

  it('reads the line as inclusive', () => {
    expect(riverState({ points: at(4.95), reachable_at_or_below_ft: line }, NOW).kind).toBe('reachable')
    expect(riverState({ points: at(4.96), reachable_at_or_below_ft: line }, NOW).kind).toBe('high')
  })

  it('is unavailable with no points, never reachable', () => {
    expect(riverState({ points: [], reachable_at_or_below_ft: line }, NOW)).toEqual({ kind: 'unavailable' })
  })

  it('goes stale past the limit even when the old reading was low', () => {
    expect(riverState({ points: at(4.5, RIVER_STALE_MS + 60_000), reachable_at_or_below_ft: line }, NOW).kind).toBe('stale')
    expect(riverState({ points: at(4.5, RIVER_STALE_MS - 60_000), reachable_at_or_below_ft: line }, NOW).kind).toBe('reachable')
  })

  it('reads only the newest point', () => {
    const points = [
      { at: iso(3 * H), height_ft: 5.4 },
      { at: iso(H), height_ft: 4.9 },
    ]
    expect(riverState({ points, reachable_at_or_below_ft: line }, NOW).kind).toBe('reachable')
  })

  it('is unavailable when the newest time does not parse', () => {
    expect(riverState({ points: [{ at: 'garbage', height_ft: 4 }], reachable_at_or_below_ft: line }, NOW).kind).toBe('unavailable')
  })
})

describe('riverChangeFt', () => {
  it('is null when the points span less than the window', () => {
    expect(riverChangeFt([{ at: iso(2 * H), height_ft: 5 }, { at: iso(H), height_ft: 4.9 }])).toBeNull()
    expect(riverChangeFt([])).toBeNull()
  })

  it('is newest minus oldest over a day, falling negative', () => {
    expect(
      riverChangeFt([
        { at: iso(24 * H), height_ft: 4.97 },
        { at: iso(12 * H), height_ft: 4.94 },
        { at: iso(0), height_ft: 4.88 },
      ]),
    ).toBe(-0.09)
  })
})
