import { describe, it, expect } from 'vitest'
import { KNOWN_CRAGS, knownCragBySlug } from './knownCrags.js'
import { SUN_WALLS } from './sunWallsData.js'
import {
  SUN_DAY_MIN_HOURS,
  SUN_SHADE_ALIKE_POINTS,
  sunShadeAt,
  sunShadeOnDay,
  type WallReadings,
} from './wallSunShade.js'

const T = '2026-10-19T18:00:00.000Z'
const D = '2026-10-19'

const wall = (name: string, score: number | null, inSun: boolean, dayScore: number | null = score, sunHours = inSun ? 5 : 0): WallReadings => ({
  name,
  aspect_deg: 180,
  tree_shaded: false,
  hours: [{ valid_at: T, score, in_sun: inSun }],
  days: [{ local_date: D, score: dayScore, sun_hours: sunHours }],
})

describe('sunShadeAt', () => {
  it('names the best wall of each group at that hour', () => {
    const pair = sunShadeAt([wall('Winter', 20, true), wall('Cyclops', 35, true), wall('Roof', 100, false)], T)!
    expect(pair.sun).toEqual({ walls: 2, best: { name: 'Cyclops', score: 35 } })
    expect(pair.shade).toEqual({ walls: 1, best: { name: 'Roof', score: 100 } })
    expect(pair.alike).toBe(false)
  })

  it(`reads alike within ${SUN_SHADE_ALIKE_POINTS} points, inclusive, and apart past it`, () => {
    const at = (a: number, b: number) => sunShadeAt([wall('S', a, true), wall('N', b, false)], T)!.alike
    expect(at(90, 90 - SUN_SHADE_ALIKE_POINTS)).toBe(true)
    expect(at(90 - SUN_SHADE_ALIKE_POINTS, 90)).toBe(true)
    expect(at(90, 90 - SUN_SHADE_ALIKE_POINTS - 1)).toBe(false)
  })

  it('has an empty group, and no comparison, when no wall is in sun', () => {
    const pair = sunShadeAt([wall('S', 80, false), wall('N', 90, false)], T)!
    expect(pair.sun).toEqual({ walls: 0, best: null })
    expect(pair.alike).toBeNull()
  })

  it('withholds a group when any of its walls is unscored: the missing one could be the best', () => {
    const pair = sunShadeAt([wall('S', 30, true), wall('S2', null, true), wall('N', 90, false)], T)!
    expect(pair.sun).toEqual({ walls: 2, best: null })
    expect(pair.shade.best!.score).toBe(90)
    expect(pair.alike).toBeNull()
  })

  it('is null with no walls, or when a wall lacks the hour', () => {
    expect(sunShadeAt([], T)).toBeNull()
    expect(sunShadeAt([wall('S', 30, true)], '2026-10-19T19:00:00.000Z')).toBeNull()
  })

  it('joins on the instant, not the spelling', () => {
    expect(sunShadeAt([wall('S', 30, true)], '2026-10-19T18:00:00Z')).not.toBeNull()
  })
})

describe('sunShadeOnDay', () => {
  it(`puts a wall in the sun group from ${SUN_DAY_MIN_HOURS} sun hours`, () => {
    const pair = sunShadeOnDay(
      [
        wall('Winter', 0, true, 39, SUN_DAY_MIN_HOURS),
        wall('Glance', 0, true, 95, SUN_DAY_MIN_HOURS - 1),
        wall('Roof', 0, false, 100, 0),
      ],
      D,
    )!
    expect(pair.sun).toEqual({ walls: 1, best: { name: 'Winter', score: 39 } })
    expect(pair.shade).toEqual({ walls: 2, best: { name: 'Roof', score: 100 } })
    expect(pair.alike).toBe(false)
  })

  it('withholds a group with an unscored day, and is null when a wall lacks the day', () => {
    expect(sunShadeOnDay([wall('S', 0, true, null), wall('N', 0, false, 90)], D)!.sun.best).toBeNull()
    expect(sunShadeOnDay([wall('S', 0, true)], '2026-10-20')).toBeNull()
  })
})

describe('KnownCrag.tree_shaded', () => {
  it('names only walls the crag has in SUN_WALLS', () => {
    for (const crag of KNOWN_CRAGS) {
      const names = new Set(SUN_WALLS[crag.slug]?.walls.map((w) => w.name) ?? [])
      for (const t of crag.tree_shaded ?? []) expect(names, `${crag.slug}: ${t}`).toContain(t)
    }
    expect(knownCragBySlug('red-wing')?.tree_shaded).toHaveLength(4)
  })
})
