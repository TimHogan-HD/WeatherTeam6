import { describe, expect, it } from 'vitest'
import { KNOWN_CRAGS, type ReverseGeocode } from '@weatherteam6/types'
import { fromFix } from './addCandidate.js'

const TAYLORS_FALLS_CRAG = KNOWN_CRAGS.find((c) => c.slug === 'taylors-falls')
const AT_THE_CRAG = { lat: 45.3955, lon: -92.6616, accuracy_m: 12 }
const DOWNTOWN = { lat: 44.9778, lon: -93.265, accuracy_m: 30 }

const place = (over: Partial<ReverseGeocode>): ReverseGeocode => ({
  name: 'Minneapolis',
  admin1: 'Minnesota',
  country: 'United States',
  elevation_m: 253,
  ...over,
})

describe('fromFix', () => {
  it('names a fix inside a known crag after the crag, over the town it is in', () => {
    const candidate = fromFix(AT_THE_CRAG, place({ name: 'Taylors Falls', elevation_m: 211 }))
    expect(TAYLORS_FALLS_CRAG).toBeDefined()
    expect(candidate.name).toBe(TAYLORS_FALLS_CRAG?.name)
  })

  it('names any other fix after the place the lookup found', () => {
    expect(fromFix(DOWNTOWN, place({})).name).toBe('Minneapolis')
  })

  it('carries the looked-up elevation, which is what the temperature correction needs', () => {
    expect(fromFix(DOWNTOWN, place({})).elevationM).toBe(253)
  })

  it('says where the fix is, how good it is, and credits OpenStreetMap', () => {
    expect(fromFix(DOWNTOWN, place({})).detail).toBe(
      'Your location, ±98 ft · Minnesota, United States · © OpenStreetMap contributors',
    )
  })

  it('at a known crag, credits OpenStreetMap without claiming the crag name as its own', () => {
    const detail = fromFix(AT_THE_CRAG, place({ name: 'Taylors Falls' })).detail ?? ''
    expect(detail).not.toMatch(/place name/i)
    expect(detail).toContain('© OpenStreetMap contributors')
  })

  it('falls back to "Current location" with no elevation when the lookup failed', () => {
    const candidate = fromFix(DOWNTOWN, null)
    expect(candidate.name).toBe('Current location')
    expect(candidate.elevationM).toBeNull()
    expect(candidate.detail).toBe('Your location, ±98 ft')
  })

  it('does the same for a point the lookup could not name, and credits nobody', () => {
    const candidate = fromFix(DOWNTOWN, place({ name: null, admin1: null, country: null, elevation_m: null }))
    expect(candidate.name).toBe('Current location')
    expect(candidate.elevationM).toBeNull()
    expect(candidate.detail).toBe('Your location, ±98 ft')
  })
})
