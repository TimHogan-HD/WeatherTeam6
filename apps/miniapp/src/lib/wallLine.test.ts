import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WallReadings } from '@weatherteam6/types'
import { pinWall, pinnedWall, sunHoursText, wallDayPair, wallLine, wallOptions } from './wallLine.js'

const T = '2026-10-19T18:00:00.000Z'
const D = '2026-10-19'

const wall = (
  name: string,
  score: number | null,
  inSun: boolean,
  { dayScore = score, sunHours = inSun ? 5 : 0, treeShaded = false }: { dayScore?: number | null; sunHours?: number; treeShaded?: boolean } = {},
): WallReadings => ({
  name,
  aspect_deg: 180,
  tree_shaded: treeShaded,
  hours: [{ valid_at: T, score, in_sun: inSun }],
  days: [{ local_date: D, score: dayScore, sun_hours: sunHours }],
})

/** Red Wing at 1 PM on 2026-10-19, Wall A's real output: Winter Wall baking, the shaded side at 100. */
const redWing = [wall('Winter Wall', 20, true), wall('Cyclops', 31, true), wall('Large Roof', 100, false), wall('New Vice', 96, false)]

describe('wallLine', () => {
  it('pairs the best wall in sun with the best in shade when they differ by more than ten points', () => {
    expect(wallLine(redWing, T, null)).toEqual({
      kind: 'pair',
      sun: { walls: 2, best: { name: 'Cyclops', score: 31 } },
      shade: { walls: 2, best: { name: 'Large Roof', score: 100 } },
    })
  })

  it('says alike, one quiet line, within ten points (rule 1)', () => {
    expect(wallLine([wall('S', 90, true), wall('N', 100, false)], T, null)).toEqual({ kind: 'alike' })
  })

  it('keeps a withheld group as a gap, never the other group’s number', () => {
    const line = wallLine([wall('S', null, true), wall('S2', 40, true), wall('N', 100, false)], T, null)
    expect(line).toEqual({ kind: 'pair', sun: { walls: 2, best: null }, shade: { walls: 1, best: { name: 'N', score: 100 } } })
  })

  it('still pairs when no wall is in sun: the empty half is said, not compared', () => {
    const line = wallLine([wall('S', 80, false), wall('N', 100, false)], T, null)
    expect(line).toMatchObject({ kind: 'pair', sun: { walls: 0, best: null } })
  })

  it('says nothing for a crag without walls, or an hour a wall lacks', () => {
    expect(wallLine([], T, null)).toBeNull()
    expect(wallLine(redWing, '2026-10-19T19:00:00.000Z', null)).toBeNull()
  })

  it('follows a pinned wall into shade or sun, with its own score, even within ten points', () => {
    expect(wallLine(redWing, T, 'Winter Wall')).toEqual({ kind: 'pinned', name: 'Winter Wall', score: 20, inSun: true })
    expect(wallLine([wall('S', 95, true), wall('N', 100, false)], T, 'N')).toEqual({ kind: 'pinned', name: 'N', score: 100, inSun: false })
  })

  it('gives a pinned wall missing the hour a gap, not a score', () => {
    expect(wallLine(redWing, '2026-10-19T19:00:00.000Z', 'Winter Wall')).toEqual({
      kind: 'pinned',
      name: 'Winter Wall',
      score: null,
      inSun: null,
    })
  })

  it('reads a pin the response no longer carries as Auto', () => {
    expect(wallLine(redWing, T, 'Gone Wall')?.kind).toBe('pair')
  })
})

describe('wallOptions', () => {
  it('lists walls in sun first, then shade, each by score, an unscored wall last', () => {
    const rows = wallOptions([...redWing, wall('Blank', null, true)], T, D)
    expect(rows.map((r) => r.name)).toEqual(['Cyclops', 'Winter Wall', 'Blank', 'Large Roof', 'New Vice'])
    expect(rows[0]).toEqual({ name: 'Cyclops', score: 31, inSun: true, treeShaded: false, sunHoursToday: 5 })
  })

  it('has no sun hours without today’s row, never zero', () => {
    expect(wallOptions(redWing, T, null)[0]?.sunHoursToday).toBeNull()
    expect(wallOptions(redWing, T, '2026-10-20')[0]?.sunHoursToday).toBeNull()
  })
})

describe('sunHoursText', () => {
  const base = { name: 'W', score: 50, inSun: true, treeShaded: false }
  it('counts the sun hours left, says when none are, and names trees', () => {
    expect(sunHoursText({ ...base, sunHoursToday: 4 })).toBe('4 sun hours')
    expect(sunHoursText({ ...base, sunHoursToday: 1 })).toBe('1 sun hour')
    expect(sunHoursText({ ...base, sunHoursToday: 0 })).toBe('No sun left')
    expect(sunHoursText({ ...base, sunHoursToday: null })).toBeNull()
    expect(sunHoursText({ ...base, treeShaded: true, sunHoursToday: 0 })).toBe('Under trees')
  })
})

describe('wallDayPair', () => {
  it('pairs the day’s groups by the owner’s day rule', () => {
    expect(wallDayPair(redWing, D)).toEqual({ kind: 'pair', sun: 31, shade: 100 })
  })

  it('is alike within ten points', () => {
    expect(wallDayPair([wall('S', 90, true), wall('N', 99, false)], D)).toEqual({ kind: 'alike' })
  })

  it('withholds a group with an unscored wall as a gap', () => {
    expect(wallDayPair([wall('S', null, true), wall('N', 99, false)], D)).toEqual({ kind: 'pair', sun: null, shade: 99 })
  })

  it('is no pair when every wall falls in one group, or a wall lacks the day', () => {
    expect(wallDayPair([wall('S', 40, false), wall('N', 99, false)], D)).toBeNull()
    expect(wallDayPair(redWing, '2026-10-20')).toBeNull()
  })
})

describe('the pinned wall on this device', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const memory = () => {
    const store = new Map<string, string>()
    return {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    }
  }

  it('remembers a wall per crag and forgets it on Auto', () => {
    vi.stubGlobal('window', { localStorage: memory() })
    pinWall('a', 'Winter Wall')
    pinWall('b', 'Large Roof')
    expect(pinnedWall('a')).toBe('Winter Wall')
    expect(pinnedWall('b')).toBe('Large Roof')
    pinWall('a', null)
    expect(pinnedWall('a')).toBeNull()
    expect(pinnedWall('b')).toBe('Large Roof')
  })

  it('is on Auto when storage throws or holds something else', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('denied')
        },
        setItem: () => {
          throw new Error('denied')
        },
      },
    })
    expect(() => pinWall('a', 'X')).not.toThrow()
    expect(pinnedWall('a')).toBeNull()
    const m = memory()
    m.setItem('wt6.pinnedWalls', '["a"]')
    vi.stubGlobal('window', { localStorage: m })
    expect(pinnedWall('a')).toBeNull()
  })
})
