import { describe, expect, it } from 'vitest'
import type { GuidebookRoute } from '@weatherteam6/types'
import { applyOverlay, CRAG_MAX_SPAN_KM, GUIDEBOOK_REACH_KM, guidebookFor, type SnapshotArea } from './guidebook.js'
import { MN_GUIDEBOOK } from './guidebookMn.js'
import { REPINNED_AREAS } from '../weather/climbingAreaRepins.js'
import { ELDON, GUIDEBOOK_OVERLAY, type OverlayArea } from './guidebookOverlay.js'
import { stopsGuidebookProblem } from '../feedback/parseFeedback.js'

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

// A crag with two walls. The east wall sorts first by name and last by
// longitude, so a name order and a west-to-east order cannot agree.
const CRAG = [
  area({ id: 'mn', parent: null, lat: null, lon: null }),
  area({ id: 'crag', lat: 45, lon: -93 }),
  // Listed west first, so name order differs from array order too.
  area({ id: 'west', parent: 'crag', lon: -93.01, routes: [route('w1', 0), route('w2', 0)] }),
  area({ id: 'east', parent: 'crag', lon: -92.99, routes: [route('e2', 1), route('e1', 0)] }),
]

describe('guidebookFor', () => {
  it('links a point near a crag to the crag, with its walls by name rather than by longitude', () => {
    const g = guidebookFor(45 + km(1), -93, CRAG, '2026-09-28')
    expect(g?.crag.id).toBe('crag')
    expect(g?.crag.route_count).toBe(4)
    expect(g?.walls.map((w) => w.id)).toEqual(['east', 'west'])
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

  it("lists a wall's sub-walls by name, each with its whole subtree's routes, and skips an empty one", () => {
    const nested = [
      area({ id: 'mn', parent: null, lat: null, lon: null }),
      area({ id: 'crag' }),
      area({ id: 'wall', parent: 'crag' }),
      area({ id: 'z-buttress', parent: 'wall', routes: [route('z1')] }),
      area({ id: 'a-slab', parent: 'wall' }),
      area({ id: 'a-slab-left', parent: 'a-slab', routes: [route('s1'), route('s2')] }),
      area({ id: 'empty', parent: 'wall' }),
    ]
    const wall = guidebookFor(45, -93, nested)?.walls[0]
    expect(wall?.sub_walls).toEqual([
      { id: 'a-slab', name: 'a-slab', route_ids: ['s1', 's2'] },
      { id: 'z-buttress', name: 'z-buttress', route_ids: ['z1'] },
    ])
  })

  it('gives a wall with no sub-areas no sub-walls — it is itself the wall', () => {
    expect(guidebookFor(45, -93, CRAG)?.walls.every((w) => w.sub_walls?.length === 0)).toBe(true)
  })

  it("lists a second crag within reach beside the first, the larger crag still the location's", () => {
    const two = [
      ...CRAG,
      area({ id: 'other', lat: 45 + km(0.5), lon: -93 }),
      area({ id: 'boulders', parent: 'other', lat: 45 + km(0.5), lon: -93, routes: [route('b1')] }),
    ]
    const g = guidebookFor(45, -93, two)
    expect(g?.crag.id).toBe('crag')
    expect(g?.crag.route_count).toBe(4)
    expect(g?.nearby).toEqual([{ id: 'other', name: 'other', route_count: 1 }])
    expect(g?.walls.map((w) => w.id)).toEqual(['boulders', 'east', 'west'])
  })

  it('never lists a wall of the crag, or the region around it, as another crag', () => {
    // 'west' and 'east' are within reach and hold routes, and so would 'mn' if it had a point.
    const g = guidebookFor(45, -93, [...CRAG.slice(1), area({ id: 'mn', parent: null, lat: 45, lon: -93 })])
    expect(g?.nearby).toEqual([])
    expect(g?.walls.map((w) => w.id)).toEqual(['east', 'west'])
  })

  it('takes the outermost of two nested areas with the same routes, so its boulders stay sub-walls', () => {
    const chain = [
      ...CRAG,
      area({ id: 'bouldering', lat: 45 + km(0.5), lon: -93 }),
      area({ id: 'field', parent: 'bouldering', lat: 45 + km(0.5), lon: -93 }),
      area({ id: 'rock', parent: 'field', lat: 45 + km(0.5), lon: -93, routes: [route('r1')] }),
    ]
    const g = guidebookFor(45, -93, chain)
    expect(g?.nearby?.map((c) => c.id)).toEqual(['bouldering'])
    const field = g?.walls.find((w) => w.id === 'field')
    expect(field?.sub_walls).toEqual([{ id: 'rock', name: 'rock', route_ids: ['r1'] }])
  })
})

const boulder = (over: Partial<OverlayArea> & { id: string }): OverlayArea => ({
  name: over.id,
  parent: 'field',
  route_ids: [],
  routes: [],
  ...over,
})

const FIELD = [
  area({ id: 'mn', parent: null, lat: null, lon: null }),
  area({ id: 'field', routes: [route('p1'), route('p2'), { ...route('p3'), mp_id: '300' }] }),
]

describe('applyOverlay', () => {
  it('moves the routes a boulder names off its parent and adds the problems OpenBeta lacks', () => {
    const { areas, problems } = applyOverlay(FIELD, [
      boulder({ id: 'big', route_ids: ['p1', 'p2'], routes: [{ ...route('new'), mp_id: '400' }] }),
    ])
    expect(problems).toEqual([])
    expect(areas.find((a) => a.id === 'field')?.routes.map((r) => r.id)).toEqual(['p3'])
    const big = areas.find((a) => a.id === 'big')
    expect(big?.routes.map((r) => r.id)).toEqual(['p1', 'p2', 'new'])
    expect(big?.path).toEqual(['USA', 'Minnesota', 'field'])
    // The committed snapshot is never mutated.
    expect(FIELD[1]?.routes).toHaveLength(3)
  })

  it('keeps a problem listed on two boulders on the first, and says so', () => {
    const { areas, problems } = applyOverlay(FIELD, [
      boulder({ id: 'a', route_ids: ['p1'] }),
      boulder({ id: 'b', route_ids: ['p1', 'p2'] }),
    ])
    expect(areas.find((a) => a.id === 'a')?.routes.map((r) => r.id)).toEqual(['p1'])
    expect(areas.find((a) => a.id === 'b')?.routes.map((r) => r.id)).toEqual(['p2'])
    expect(problems).toEqual(['b: route p1 is already on another overlay boulder'])
  })

  it('skips an id the snapshot does not hold, and a parent it does not hold', () => {
    const { areas, problems } = applyOverlay(FIELD, [
      boulder({ id: 'a', route_ids: ['nope', 'p1'] }),
      boulder({ id: 'lost', parent: 'gone' }),
    ])
    expect(areas.find((a) => a.id === 'a')?.routes.map((r) => r.id)).toEqual(['p1'])
    expect(areas.some((a) => a.id === 'lost')).toBe(false)
    expect(problems).toEqual(['a: route nope is not directly on field', 'lost: parent gone is not in the snapshot'])
  })

  it('uses a boulder OpenBeta has since added under the same name, never a second copy', () => {
    const pulled = [...FIELD, area({ id: 'ob-big', name: 'Big', parent: 'field', routes: [route('p9')] })]
    const { areas, problems } = applyOverlay(pulled, [
      boulder({ id: 'big', name: 'Big', route_ids: ['p1'], routes: [{ ...route('new'), mp_id: '400' }] }),
    ])
    expect(areas.some((a) => a.id === 'big')).toBe(false)
    expect(areas.find((a) => a.id === 'ob-big')?.routes.map((r) => r.id)).toEqual(['p9', 'p1', 'new'])
    expect(problems).toEqual(['Big: OpenBeta now has this area under field; the overlay entry can go'])
  })

  it('leaves a route OpenBeta has moved into its own boulder where OpenBeta put it', () => {
    const moved = [
      area({ id: 'mn', parent: null, lat: null, lon: null }),
      area({ id: 'field', routes: [route('p2')] }),
      area({ id: 'ob-rock', parent: 'field', routes: [route('p1')] }),
    ]
    const { areas, problems } = applyOverlay(moved, [boulder({ id: 'mine', route_ids: ['p1', 'p2'] })])
    expect(areas.flatMap((a) => a.routes).filter((r) => r.id === 'p1')).toHaveLength(1)
    expect(areas.find((a) => a.id === 'ob-rock')?.routes.map((r) => r.id)).toEqual(['p1'])
    expect(areas.find((a) => a.id === 'mine')?.routes.map((r) => r.id)).toEqual(['p2'])
    expect(problems).toEqual(['mine: route p1 is not directly on field'])
  })

  it('drops an added problem once OpenBeta carries its Mountain Project id', () => {
    const { areas, problems } = applyOverlay(FIELD, [
      boulder({ id: 'a', routes: [{ ...route('dup'), name: 'Dup', mp_id: '300' }] }),
    ])
    expect(areas.flatMap((a) => a.routes).some((r) => r.id === 'dup')).toBe(false)
    expect(problems).toEqual(['a: OpenBeta now has Dup (Mountain Project 300); the overlay entry can go'])
  })
})

describe('the Minnesota snapshot', () => {
  it('links the saved Red Wing location to Barn Bluff and its seven walls, with Memorial Park beside it', () => {
    // The owner's saved row, ~1.2 km from OpenBeta's point for the crag.
    const g = guidebookFor(44.5625, -92.5338)
    expect(g?.crag.name).toBe('He Mni Can - Barn Bluff (Red Wing)')
    expect(g?.nearby?.map((c) => c.name)).toEqual(['Memorial Park (Red Wing)'])
    expect(g?.walls.filter((w) => w.name !== 'Memorial Park (Red Wing)')).toHaveLength(7)
    expect(g?.walls.find((w) => w.name === 'Winter Wall')?.ordered).toBe(true)
  })

  it("carries routes' Mountain Project ids, which OpenBeta's bulk query drops", () => {
    const routes = MN_GUIDEBOOK.flatMap((a) => a.routes)
    const withId = routes.filter((r) => r.mp_id !== null).length
    expect(withId / routes.length).toBeGreaterThan(0.9)
  })

  it('applies the committed overlay with nothing skipped, and leaves no problem loose on Eldon', () => {
    const { areas, problems } = applyOverlay(MN_GUIDEBOOK, GUIDEBOOK_OVERLAY)
    expect(problems).toEqual([])
    expect(areas.find((a) => a.id === ELDON)?.routes).toEqual([])
    const ids = GUIDEBOOK_OVERLAY.flatMap((b) => [b.id, ...b.routes.map((r) => r.id)])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('finds Silver Creek’s routes at its cliff, where /add now saves it (#582)', () => {
    expect(guidebookFor(47.06756, -91.59324)?.crag.name).toBe('Silver Creek Tunnel Rock')
  })

  it('carries every re-pin in the committed guidebook snapshot', () => {
    for (const [uuid, point] of REPINNED_AREAS) {
      const a = MN_GUIDEBOOK.find((x) => x.id === uuid)
      expect(a && { lat: a.lat, lon: a.lon }, uuid).toEqual(point)
    }
  })

  it("offers Eldon's boulders at the owner's Sandstone location, beside Robinson Park's walls", () => {
    // The owner's saved Sandstone row, which links to Robinson Park.
    const g = guidebookFor(46.1355, -92.8602)
    expect(g?.crag.name).toBe('Robinson Park')
    expect(g?.nearby?.map((c) => c.name)).toEqual(['Sandstone Bouldering'])
    const eldon = g?.walls.find((w) => w.id === ELDON)
    expect(eldon?.routes).toHaveLength(37 + 21)
    expect(eldon?.sub_walls).toHaveLength(GUIDEBOOK_OVERLAY.length)
    const raven = eldon?.sub_walls?.find((s) => s.name === 'Raven Boulder')
    const names = (raven?.route_ids ?? []).map((id) => eldon?.routes.find((r) => r.id === id)?.name)
    expect(names).toEqual(['The Raven', 'The Raven Stand', 'Chairman Meow', 'Apocalypse Meow', 'Raven Droppings'])
  })

  it('accepts a forecast check on an Eldon boulder at Sandstone, and still one on Robinson Park', () => {
    const walls = guidebookFor(46.1355, -92.8602)?.walls ?? []
    const eldon = walls.find((w) => w.id === ELDON)
    const raven = eldon?.sub_walls?.find((s) => s.name === 'Raven Boulder')
    const theRaven = eldon?.routes.find((r) => r.name === 'The Raven')
    const robinson = walls.find((w) => w.name === 'Robinson Park Bouldering')
    const stop = {
      area_id: ELDON,
      area_name: 'Eldon',
      wall_id: raven?.id ?? null,
      wall: 'Raven Boulder',
      route_picks: theRaven === undefined ? [] : [{ id: theRaven.id, name: theRaven.name }],
      routes: null,
      started_at: '2026-11-08T19:00:00.000Z',
      ended_at: null,
      rock: null,
      sun_exposure: null,
      shade_causes: [],
      facing: null,
      angle: null,
    }
    expect(raven).toBeDefined()
    expect(stopsGuidebookProblem([stop], walls)).toBeNull()
    const pocket = eldon?.routes.find((r) => r.name === 'Pocket Hercules')
    expect(
      stopsGuidebookProblem([{ ...stop, route_picks: pocket === undefined ? [] : [{ id: pocket.id, name: pocket.name }] }], walls),
    ).toBe('stops[0].route_picks: Pocket Hercules is not on that wall')
    expect(stopsGuidebookProblem([{ ...stop, area_id: robinson?.id ?? '', area_name: 'Robinson Park Bouldering', wall_id: null, wall: null, route_picks: [] }], walls)).toBeNull()
  })

  it('carries no OpenBeta sentinel as a wall position', () => {
    const positions = MN_GUIDEBOOK.flatMap((a) => a.routes.map((r) => r.left_right))
    expect(positions.every((p) => p === null || (p >= 0 && p < 999999))).toBe(true)
  })
})
