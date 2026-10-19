import { describe, it, expect } from 'vitest'
import { matchKnownCrag } from '@weatherteam6/types'
import { MAX_CLIMBING_RESULTS, climbingAreaLevel, climbingStates, searchClimbingAreas } from './climbingAreas.js'
import { CO_CLIMBING_AREAS } from './climbingAreasCo.js'
import { MN_CLIMBING_AREAS } from './climbingAreasMn.js'
import { UT_CLIMBING_AREAS } from './climbingAreasUt.js'

const names = (q: string) => searchClimbingAreas(q).map((r) => r.name)

describe('searchClimbingAreas', () => {
  it('finds a crag the place geocoder ranks under a town', () => {
    expect(names('red wing')[0]).toBe('He Mni Can - Barn Bluff (Red Wing)')
    expect(names('Taylors Falls')[0]).toBe('Interstate SP (Taylors Falls)')
  })

  it('ranks an own-name match above a wall matched only through its parent', () => {
    // "Sandstone Bouldering" and "Robinson Park" (37 and 60 climbs) both sit in
    // Sandstone; the parent itself leads, then the one named for the query.
    const r = names('sandstone')
    expect(r[0]).toBe('Sandstone')
    expect(r.indexOf('Sandstone Bouldering')).toBeLessThan(r.indexOf('Robinson Park'))
  })

  it('matches word prefixes, apostrophes and case aside', () => {
    expect(names('BARN')).toContain('He Mni Can - Barn Bluff (Red Wing)')
    expect(names('palis')).toContain('Palisade Head')
  })

  it('requires every word, and caps the list', () => {
    expect(names('red wing zzz')).toEqual([])
    expect(searchClimbingAreas('a').length).toBeLessThanOrEqual(MAX_CLIMBING_RESULTS)
  })

  it('finds a Colorado crag and labels it with its own state', () => {
    const shelf = searchClimbingAreas('shelf road')[0]
    expect(shelf?.name).toBe('Shelf Road')
    expect(shelf?.admin1).toBe('Colorado')
    expect(searchClimbingAreas('red wing')[0]?.admin1).toBe('Minnesota')
    expect(names('eldorado')).toContain('Eldorado Canyon State Park')
  })

  it('finds Indian Creek as the climbing area, not a town (feedback d4b06f8d)', () => {
    const creek = searchClimbingAreas('indian creek')[0]
    expect(creek?.name).toBe('Indian Creek')
    expect(creek?.admin1).toBe('Utah')
    expect(names('cat wall')).toContain('Cat Wall')
  })

  it('never offers a whole state as a crag', () => {
    expect(names('colorado')).not.toContain('Colorado')
  })

  it('returns rows that cannot collide with a place id and never claim an elevation', () => {
    for (const r of searchClimbingAreas('red wing')) {
      expect(r.id).toBeLessThan(0)
      expect(r.elevation_m).toBeNull()
      expect(r.climbing_area?.climbs).toBeGreaterThan(0)
    }
  })
})

describe('browsing climbing areas', () => {
  const ELDO = '7fea44a6-af9d-583e-9abc-274876289cd7'
  const BOULDER = 'decc1251-4a67-52b9-b23f-3243e10e93d0'

  it('lists each state with its top-level areas', () => {
    const co = climbingStates().find((s) => s.code === 'CO')
    expect(co?.name).toBe('Colorado')
    expect(co?.areas).toBe(climbingAreaLevel('CO', null)?.children.length)
  })

  it('opens a state at its top-level areas, most climbs first', () => {
    const level = climbingAreaLevel('CO', null)!
    expect(level.area).toBeNull()
    expect(level.children[0]?.place.name).toBe('Boulder')
    const climbs = level.children.map((c) => c.place.climbing_area?.climbs ?? 0)
    expect(climbs).toEqual([...climbs].sort((a, b) => b - a))
  })

  it('opens an area at its children, with the path back up', () => {
    const level = climbingAreaLevel('CO', ELDO)!
    expect(level.area?.place.name).toBe('Eldorado Canyon State Park')
    expect(level.area?.place.admin1).toBe('Colorado')
    expect(level.path).toEqual([{ area_id: BOULDER, name: 'Boulder' }])
    expect(level.children.length).toBe(level.area?.sub_areas)
    expect(level.children.length).toBeGreaterThan(0)
  })

  it('opens Utah at Indian Creek alone, not the rest of the state', () => {
    const level = climbingAreaLevel('UT', null)!
    expect(level.children.map((c) => c.place.name)).toEqual(['Indian Creek'])
    expect(level.children[0]?.sub_areas).toBeGreaterThan(0)
  })

  it('refuses an unknown state, an unknown area, and an area asked for under the wrong state', () => {
    expect(climbingAreaLevel('ZZ', null)).toBeNull()
    expect(climbingAreaLevel('CO', '00000000-0000-0000-0000-000000000000')).toBeNull()
    expect(climbingAreaLevel('MN', ELDO)).toBeNull()
  })

  it('reaches every area in every snapshot by walking down from its state', () => {
    for (const [code, areas] of [
      ['CO', CO_CLIMBING_AREAS],
      ['MN', MN_CLIMBING_AREAS],
      ['UT', UT_CLIMBING_AREAS],
    ] as const) {
      const seen = new Set<string>()
      const walk = (id: string | null): void => {
        for (const c of climbingAreaLevel(code, id)!.children) {
          seen.add(c.area_id)
          if (c.sub_areas > 0) walk(c.area_id)
        }
      }
      walk(null)
      expect(seen.size).toBe(areas.length)
    }
  })
})

describe('Minnesota known crags — one rock for every area under each (owner, 2026-10-15)', () => {
  // Walked by parent_id from the snapshot, so a later `climbing:pull` that adds
  // or re-pins a wall under one of these is checked without editing this test.
  // OpenBeta's coordinates are wrong often enough that each mispinned area
  // needed its own KNOWN_CRAGS point.
  const ROOTS: ReadonlyArray<[string, string]> = [
    ['Blue Mounds State Park (Luverne)', 'quartzite'],
    ['Interstate SP (Taylors Falls)', 'basalt_dense'],
    ['Sandstone', 'sandstone_quartz_arenite'],
    ['He Mni Can - Barn Bluff (Red Wing)', 'carbonate_cherty'],
    ['Tettegouche SP (North Shore)', 'rhyolite'],
    ['Temperance River SP (North Shore)', 'anorthosite'],
  ]

  function under(rootName: string) {
    const root = MN_CLIMBING_AREAS.find((a) => a.name === rootName && a.parent_id === null)
    const ids = new Set<string>(root ? [root.uuid] : [])
    for (let grew = true; grew; ) {
      grew = false
      for (const a of MN_CLIMBING_AREAS) {
        if (a.parent_id !== null && ids.has(a.parent_id) && !ids.has(a.uuid)) {
          ids.add(a.uuid)
          grew = true
        }
      }
    }
    return MN_CLIMBING_AREAS.filter((a) => ids.has(a.uuid))
  }

  it.each(ROOTS)('locks every area under %s to %s', (rootName, rockType) => {
    const areas = under(rootName)
    expect(areas.length).toBeGreaterThan(0)
    for (const a of areas) expect(matchKnownCrag(a.lat, a.lon)?.rock_type, a.name).toBe(rockType)
  })

  it("finds Sandstone's walls below its parent", () => {
    expect(under('Sandstone').map((a) => a.name)).toEqual(expect.arrayContaining(['Robinson Park', 'Sigma Wall', 'Eldon']))
  })

  it("locks no Duluth area to the rhyolite of Tettegouche's mispinned parent", () => {
    for (const a of under('Duluth Area (Rock and Ice)')) expect(matchKnownCrag(a.lat, a.lon), a.name).toBeNull()
  })

  it('leaves Banning State Park, a separate area 3 km north of Robinson Park, for the user', () => {
    const banning = MN_CLIMBING_AREAS.filter((a) => a.name.startsWith('Banning State Park'))
    expect(banning.length).toBeGreaterThan(0)
    for (const a of banning) expect(matchKnownCrag(a.lat, a.lon)).toBeNull()
  })
})
