import { describe, expect, it } from 'vitest'
import { KNOWN_CRAGS } from './knownCrags.js'
import {
  RIVER_GAUGES,
  RIVER_STALE_MS,
  riverChangeFt,
  riverGaugesFor,
  riverHeightNear,
  riverState,
  type RiverPoint,
} from './riverGauges.js'

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
  it('is null when no point sits near 25 h back', () => {
    expect(riverChangeFt([{ at: iso(2 * H), height_ft: 5 }, { at: iso(H), height_ft: 4.9 }])).toBeNull()
    expect(riverChangeFt([])).toBeNull()
    // A gap across the mark: the nearest points are 3 h either side of it.
    expect(
      riverChangeFt([
        { at: iso(28 * H), height_ft: 5.2 },
        { at: iso(22 * H), height_ft: 5.0 },
        { at: iso(0), height_ft: 4.8 },
      ]),
    ).toBeNull()
  })

  it('measures from the point nearest 25 h back, not the first of 15 days', () => {
    const points: RiverPoint[] = []
    for (let h = 15 * 24; h >= 0; h--) points.push({ at: iso(h * H), height_ft: h === 25 ? 4.97 : h === 0 ? 4.88 : 3 + h / 100 })
    expect(riverChangeFt(points)).toEqual({ change_ft: -0.09, from_at: iso(25 * H) })
  })

  it('reads rising positive', () => {
    expect(riverChangeFt([{ at: iso(25.5 * H), height_ft: 4.5 }, { at: iso(0), height_ft: 4.75 }])?.change_ft).toBe(0.25)
  })
})

describe('riverHeightNear', () => {
  const points = [
    { at: iso(10 * H), height_ft: 4.9 },
    { at: iso(9 * H), height_ft: 4.94 },
  ]
  it('takes the nearest point within an hour', () => {
    expect(riverHeightNear(points, NOW - 9.2 * H)).toBe(4.94)
  })
  it('is null when the nearest is further than an hour', () => {
    expect(riverHeightNear(points, NOW - 7 * H)).toBeNull()
    expect(riverHeightNear([], NOW)).toBeNull()
  })
})
