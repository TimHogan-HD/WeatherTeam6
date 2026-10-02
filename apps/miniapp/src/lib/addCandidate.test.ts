import { describe, expect, it } from 'vitest'
import { KNOWN_CRAGS, type ReverseGeocode } from '@weatherteam6/types'
import { addPathForPoint, formatPoint, fromFix, fromMapPoint, mapPointFromSearch } from './addCandidate.js'

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

describe('fromMapPoint', () => {
  const AT_CRAG = { lat: AT_THE_CRAG.lat, lon: AT_THE_CRAG.lon }
  const IN_TOWN = { lat: DOWNTOWN.lat, lon: DOWNTOWN.lon }

  it('names a point by the fix’s rules: the known crag over its town', () => {
    expect(fromMapPoint(AT_CRAG, place({ name: 'Taylors Falls' })).name).toBe(TAYLORS_FALLS_CRAG?.name)
    expect(fromMapPoint(IN_TOWN, place({})).name).toBe('Minneapolis')
  })

  it('says it was picked on the map, with no accuracy, and credits OpenStreetMap', () => {
    const candidate = fromMapPoint(IN_TOWN, place({}))
    expect(candidate.detail).toBe('Picked on the map · Minnesota, United States · © OpenStreetMap contributors')
    expect(candidate).toMatchObject({ lat: IN_TOWN.lat, lon: IN_TOWN.lon, elevationM: 253 })
  })

  it('falls back to "Dropped pin", crediting nobody, when nothing named it', () => {
    expect(fromMapPoint(IN_TOWN, null)).toMatchObject({ name: 'Dropped pin', elevationM: null, detail: 'Picked on the map' })
  })
})

describe('mapPointFromSearch', () => {
  const read = (query: string) => mapPointFromSearch(new URLSearchParams(query))

  it('reads back the point the map opened /add on', () => {
    const path = addPathForPoint({ lat: 45.39551234, lon: -92.66161234 })
    expect(read(path.slice(path.indexOf('?')))).toEqual({ lat: 45.39551, lon: -92.66161 })
  })

  it('ignores an ordinary visit and any point that is missing, not a number, or off the globe', () => {
    for (const query of ['', 'lat=45', 'lon=-92', 'lat=&lon=', 'lat=north&lon=-92', 'lat=NaN&lon=1', 'lat=Infinity&lon=1', 'lat=90.5&lon=0', 'lat=0&lon=-180.01']) {
      expect(read(query), query).toBeNull()
    }
  })

  it('accepts the poles and the antimeridian themselves', () => {
    expect(read('lat=-90&lon=180')).toEqual({ lat: -90, lon: 180 })
  })
})

describe('formatPoint', () => {
  it('prints four decimals', () => {
    expect(formatPoint({ lat: 45.39551, lon: -92.6 })).toBe('45.3955, -92.6000')
  })
})
