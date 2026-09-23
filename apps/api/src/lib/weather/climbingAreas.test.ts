import { describe, it, expect } from 'vitest'
import { MAX_CLIMBING_RESULTS, searchClimbingAreas } from './climbingAreas.js'

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

  it('returns rows that cannot collide with a place id and never claim an elevation', () => {
    for (const r of searchClimbingAreas('red wing')) {
      expect(r.id).toBeLessThan(0)
      expect(r.elevation_m).toBeNull()
      expect(r.climbing_area?.climbs).toBeGreaterThan(0)
    }
  })
})
