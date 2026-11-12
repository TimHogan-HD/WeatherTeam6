import { describe, expect, it } from 'vitest'
import { KNOWN_CRAGS } from './knownCrags.js'
import { SOIL_STATIONS, soilStationFor } from './soilStations.js'

describe('SOIL_STATIONS', () => {
  it('keys every station by a known crag slug', () => {
    const slugs = new Set(KNOWN_CRAGS.map((c) => c.slug))
    for (const slug of Object.keys(SOIL_STATIONS)) expect(slugs.has(slug)).toBe(true)
  })

  it('lists only stations within about 10 km of the crag (owner, 2026-11-12)', () => {
    for (const s of Object.values(SOIL_STATIONS)) expect(s.distance_km).toBeLessThanOrEqual(11)
  })

  it('has no station for an unknown crag', () => {
    expect(soilStationFor(null)).toBeNull()
    expect(soilStationFor('devils-lake')).toBeNull()
    expect(soilStationFor('robinson-park')?.wban).toBe('54932')
  })
})
