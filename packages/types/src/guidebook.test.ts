import { describe, expect, it } from 'vitest'
import {
  bandCounts,
  gradeBand,
  gradeLabel,
  gradeRange,
  gradeSortKey,
  kindCounts,
  kindsLine,
  routeNeighbours,
  sortByGrade,
  type GuidebookRoute,
  type GuidebookWall,
  type RouteKind,
} from './guidebook.js'

const route = (over: Partial<GuidebookRoute> & { name?: string } = {}): GuidebookRoute => ({
  id: over.name ?? 'r',
  name: 'r',
  yds: null,
  french: null,
  vscale: null,
  kinds: ['sport'] as RouteKind[],
  first_ascent: null,
  safety: null,
  left_right: null,
  mp_id: null,
  description: null,
  ...over,
})

const yds = (g: string) => route({ yds: g, name: g })

describe('gradeBand', () => {
  it('bands every YDS spelling the Minnesota data carries', () => {
    expect(gradeBand(yds('5.7+'))).toBe('5.9')
    expect(gradeBand(yds('5.9'))).toBe('5.9')
    expect(gradeBand(yds('Easy 5th'))).toBe('5.9')
    expect(gradeBand(yds('5.10-'))).toBe('5.10')
    expect(gradeBand(yds('5.11a/b'))).toBe('5.11')
    expect(gradeBand(yds('5.12c'))).toBe('5.12')
    expect(gradeBand(yds('5.13b/c'))).toBe('5.13')
    expect(gradeBand(yds('5.14-'))).toBe('5.13')
  })

  it('reads 5.1x as a two-digit number, not as 5.1', () => {
    // A single-character read of "5.12c" would band it with 5.1 — the easiest.
    expect(gradeBand(yds('5.12c'))).not.toBe('5.9')
  })

  it('calls a boulder problem a boulder even when it carries a YDS grade', () => {
    expect(gradeBand(route({ kinds: ['boulder'], vscale: 'V4', yds: '5.12' }))).toBe('boulder')
    expect(gradeBand(route({ kinds: [], vscale: 'V2' }))).toBe('boulder')
  })

  it('bands an ungradeable route nowhere rather than as the easiest', () => {
    expect(gradeBand(route({ yds: null, vscale: null }))).toBeNull()
    expect(gradeBand(yds('unknown'))).toBeNull()
  })
})

describe('gradeSortKey', () => {
  const order = (grades: string[]) =>
    grades.map((g) => gradeSortKey(yds(g))).every((k, i, all) => i === 0 || (k ?? 0) > (all[i - 1] ?? 0))

  it('orders letters, slashes and signs within a number grade', () => {
    expect(order(['5.10a', '5.10-', '5.10a/b', '5.10b', '5.10', '5.10c', '5.10+', '5.10d'])).toBe(true)
  })

  it('orders across number grades, including the sub-5.10 signs', () => {
    expect(order(['5.6', '5.7-', '5.7', '5.7+', '5.9', '5.10a', '5.11d', '5.12a', '5.14-'])).toBe(true)
  })

  it('puts boulders after every roped route and orders V grades', () => {
    const v = (g: string) => gradeSortKey(route({ kinds: ['boulder'], vscale: g })) ?? 0
    expect(v('V-easy')).toBeGreaterThan(gradeSortKey(yds('5.15a')) ?? 0)
    expect(v('V0')).toBeGreaterThan(v('V-easy'))
    expect(v('V3-4')).toBe(v('V3'))
    expect(v('V10')).toBeGreaterThan(v('V9+'))
  })
})

describe('sortByGrade', () => {
  it('sorts an ungradeable route last, not first', () => {
    const sorted = sortByGrade([route({ name: 'none' }), yds('5.11a'), yds('5.8')])
    expect(sorted.map((r) => r.name)).toEqual(['5.8', '5.11a', 'none'])
  })
})

describe('gradeRange', () => {
  it('spans the easiest and hardest roped grade', () => {
    expect(gradeRange([yds('5.11b'), yds('5.7+'), yds('5.14-'), yds('5.10a')])).toBe('5.7+ – 5.14-')
  })

  it('leaves boulders out when there are roped routes, so two scales are not one range', () => {
    expect(gradeRange([yds('5.8'), yds('5.10b'), route({ kinds: ['boulder'], vscale: 'V9' })])).toBe(
      '5.8 – 5.10b',
    )
  })

  it('falls back to V grades on a boulder field, and to one grade when all agree', () => {
    const v = (g: string) => route({ kinds: ['boulder'], vscale: g })
    expect(gradeRange([v('V2'), v('V0'), v('V5')])).toBe('V0 – V5')
    expect(gradeRange([yds('5.9'), yds('5.9')])).toBe('5.9')
  })

  it('is null when nothing can be read', () => {
    expect(gradeRange([route()])).toBeNull()
    expect(gradeRange([])).toBeNull()
  })
})

describe('bandCounts', () => {
  it('counts each band and leaves ungradeable routes out of every one', () => {
    const counts = bandCounts([yds('5.9'), yds('5.10a'), yds('5.10d'), route(), route({ kinds: ['boulder'], vscale: 'V1' })])
    expect(counts).toEqual({ '5.9': 1, '5.10': 2, '5.11': 0, '5.12': 0, '5.13': 0, boulder: 1 })
  })
})

describe('gradeLabel', () => {
  it('prints V for a problem and YDS for a route', () => {
    expect(gradeLabel(route({ kinds: ['boulder'], vscale: 'V4', yds: '5.12' }))).toBe('V4')
    expect(gradeLabel(yds('5.12c'))).toBe('5.12c')
    expect(gradeLabel(route())).toBeNull()
  })
})

describe('kinds', () => {
  it('names kinds in a fixed order and counts a multi-kind route under each', () => {
    expect(kindsLine(['tr', 'sport'])).toBe('Sport · TR')
    const counts = kindCounts([route({ kinds: ['sport', 'trad'] }), route({ kinds: ['sport'] })])
    expect(counts.sport).toBe(2)
    expect(counts.trad).toBe(1)
  })
})

describe('routeNeighbours', () => {
  const wall = (routes: GuidebookRoute[], ordered = true): GuidebookWall => ({
    id: 'w',
    name: 'w',
    lat: null,
    lon: null,
    mp_id: null,
    routes,
    ordered,
  })
  // Stored out of order, so "sorted by left_right" and "array order" disagree.
  const routes = [4, 0, 3, 1, 5, 2, 6].map((i) => route({ id: `r${i}`, name: `r${i}`, left_right: i }))

  it('returns the route and two either side, left to right, with its 1-based position', () => {
    const n = routeNeighbours(wall(routes), 'r3')
    expect(n?.position).toBe(4)
    expect(n?.routes.map((r) => r.id)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5'])
  })

  it('keeps five in view at either end of the wall', () => {
    expect(routeNeighbours(wall(routes), 'r0')?.routes.map((r) => r.id)).toEqual(['r0', 'r1', 'r2', 'r3', 'r4'])
    expect(routeNeighbours(wall(routes), 'r6')?.routes.map((r) => r.id)).toEqual(['r2', 'r3', 'r4', 'r5', 'r6'])
  })

  it('refuses to name neighbours on a wall OpenBeta gives no order for', () => {
    expect(routeNeighbours(wall(routes, false), 'r3')).toBeNull()
  })
})
