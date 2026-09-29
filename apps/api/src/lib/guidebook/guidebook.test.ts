import { describe, expect, it } from 'vitest'
import type { GuidebookRoute } from '@weatherteam6/types'
import { CRAG_MAX_SPAN_KM, GUIDEBOOK_REACH_KM, guidebookFor, type SnapshotArea } from './guidebook.js'
import { MN_GUIDEBOOK } from './guidebookMn.js'

const route = (id: string, left_right: number | null = null): GuidebookRoute => ({
  id,
  name: id,
  yds: '5.10a',
  french: null,
  vscale: null,
  kinds: ['sport'],
  first_ascent: null,
  safety: null,
  left_right,
  mp_id: null,
  description: null,
})

const area = (over: Partial<SnapshotArea> & { id: string }): SnapshotArea => ({
  name: over.id,
  path: ['USA', 'Minnesota'],
  parent: 'mn',
  lat: 45,
  lon: -93,
  mp_id: null,
  routes: [],
  ...over,
})

/** Degrees of latitude for a distance in km. */
const km = (d: number) => d / 111.32

// A crag with two walls, listed east wall first so "sorted west to east" and
// "array order" disagree.
const CRAG = [
  area({ id: 'mn', parent: null, lat: null, lon: null }),
  area({ id: 'crag', lat: 45, lon: -93 }),
  area({ id: 'east', parent: 'crag', lon: -92.99, routes: [route('e2', 1), route('e1', 0)] }),
  area({ id: 'west', parent: 'crag', lon: -93.01, routes: [route('w1', 0), route('w2', 0)] }),
]

describe('guidebookFor', () => {
  it('links a point near a crag to the crag, with its walls west to east', () => {
    const g = guidebookFor(45 + km(1), -93, CRAG, '2026-09-28')
    expect(g?.crag.id).toBe('crag')
    expect(g?.crag.route_count).toBe(4)
    expect(g?.walls.map((w) => w.id)).toEqual(['west', 'east'])
    expect(g?.snapshot_date).toBe('2026-09-28')
  })

  it('prefers the crag over a nearer wall, because the crag holds more routes', () => {
    // Standing on the east wall's own point.
    expect(guidebookFor(45, -92.99, CRAG)?.crag.id).toBe('crag')
  })

  it('answers null past the reach, and for a point that is not a number', () => {
    expect(guidebookFor(45 + km(GUIDEBOOK_REACH_KM + 0.5), -93, CRAG)).toBeNull()
    expect(guidebookFor(Number.NaN, -93, CRAG)).toBeNull()
  })

  it('marks a wall ordered only when every route has its own position', () => {
    const walls = guidebookFor(45, -93, CRAG)?.walls ?? []
    expect(walls.find((w) => w.id === 'east')?.ordered).toBe(true)
    // Two routes at position 0 is a tie, not an order.
    expect(walls.find((w) => w.id === 'west')?.ordered).toBe(false)
  })

  it('passes over a region wider than a crag for the crag inside it', () => {
    const region = [
      area({ id: 'mn', parent: null, lat: null, lon: null }),
      area({ id: 'region', lat: 45, lon: -93 }),
      area({ id: 'near', parent: 'region', lat: 45, lon: -93, routes: [route('a')] }),
      area({ id: 'far', parent: 'region', lat: 45 + km(CRAG_MAX_SPAN_KM + 5), lon: -93, routes: [route('b'), route('c')] }),
    ]
    const g = guidebookFor(45, -93, region)
    expect(g?.crag.id).toBe('near')
    // A crag with no sub-areas is its own single wall.
    expect(g?.walls.map((w) => w.id)).toEqual(['near'])
  })

  it('never calls a wall ordered when its routes sit on sub-areas', () => {
    const nested = [
      area({ id: 'mn', parent: null, lat: null, lon: null }),
      area({ id: 'crag' }),
      area({ id: 'wall', parent: 'crag' }),
      area({ id: 'buttress', parent: 'wall', routes: [route('x', 0)] }),
    ]
    const wall = guidebookFor(45, -93, nested)?.walls[0]
    expect(wall?.routes.map((r) => r.id)).toEqual(['x'])
    expect(wall?.ordered).toBe(false)
  })
})

describe('the Minnesota snapshot', () => {
  it('links the saved Red Wing location to Barn Bluff and its seven walls', () => {
    // The owner's saved row, ~1.2 km from OpenBeta's point for the crag.
    const g = guidebookFor(44.5625, -92.5338)
    expect(g?.crag.name).toBe('He Mni Can - Barn Bluff (Red Wing)')
    expect(g?.walls).toHaveLength(7)
    expect(g?.walls.find((w) => w.name === 'Winter Wall')?.ordered).toBe(true)
  })

  it("carries routes' Mountain Project ids, which OpenBeta's bulk query drops", () => {
    const routes = MN_GUIDEBOOK.flatMap((a) => a.routes)
    const withId = routes.filter((r) => r.mp_id !== null).length
    expect(withId / routes.length).toBeGreaterThan(0.9)
  })

  it('carries no OpenBeta sentinel as a wall position', () => {
    const positions = MN_GUIDEBOOK.flatMap((a) => a.routes.map((r) => r.left_right))
    expect(positions.every((p) => p === null || (p >= 0 && p < 999999))).toBe(true)
  })
})
