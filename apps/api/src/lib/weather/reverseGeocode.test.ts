import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseElevation, parseNominatimPlace, reverseGeocode } from './reverseGeocode.js'

// Real responses, measured 2026-09-30 with zoom=14.
const DOWNTOWN_MINNEAPOLIS = {
  category: 'boundary',
  type: 'administrative',
  name: 'Downtown West',
  address: {
    neighbourhood: 'Downtown West',
    quarter: 'Gateway District',
    suburb: 'Central',
    city: 'Minneapolis',
    county: 'Hennepin County',
    state: 'Minnesota',
    country: 'United States',
    country_code: 'us',
  },
}
const TAYLORS_FALLS = {
  name: 'Taylors Falls',
  address: { village: 'Taylors Falls', county: 'Chisago County', state: 'Minnesota', country: 'United States' },
}

describe('parseNominatimPlace', () => {
  it('names a city point after the city, not the neighbourhood Nominatim calls it', () => {
    expect(parseNominatimPlace(DOWNTOWN_MINNEAPOLIS)).toEqual({
      name: 'Minneapolis',
      admin1: 'Minnesota',
      country: 'United States',
    })
  })

  it('takes a village when there is no city or town', () => {
    expect(parseNominatimPlace(TAYLORS_FALLS).name).toBe('Taylors Falls')
  })

  it('falls back to the feature name when the address has no settlement', () => {
    expect(parseNominatimPlace({ name: 'Superior National Forest', address: { state: 'Minnesota' } }).name).toBe(
      'Superior National Forest',
    )
  })

  it('answers all-null for Nominatim’s "Unable to geocode" and for junk', () => {
    const none = { name: null, admin1: null, country: null }
    expect(parseNominatimPlace({ error: 'Unable to geocode' })).toEqual(none)
    expect(parseNominatimPlace(null)).toEqual(none)
    expect(parseNominatimPlace('nope')).toEqual(none)
  })
})

describe('parseElevation', () => {
  it('reads the first value', () => {
    expect(parseElevation({ elevation: [211.0] })).toBe(211)
  })

  it('is null for a missing, non-numeric or implausible value — never 0', () => {
    expect(parseElevation({})).toBeNull()
    expect(parseElevation({ elevation: [] })).toBeNull()
    expect(parseElevation({ elevation: [null] })).toBeNull()
    expect(parseElevation({ elevation: [99999] })).toBeNull()
  })
})

describe('reverseGeocode', () => {
  const fetchMock = vi.fn()
  beforeEach(() => vi.stubGlobal('fetch', fetchMock))
  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
  })

  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  it('combines the place and the elevation', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(url.includes('nominatim') ? json(TAYLORS_FALLS) : json({ elevation: [211] })),
    )
    expect(await reverseGeocode(45.3955, -92.6616)).toEqual({
      name: 'Taylors Falls',
      admin1: 'Minnesota',
      country: 'United States',
      elevation_m: 211,
    })
  })

  it('identifies itself to Nominatim, as its usage policy requires', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(url.includes('nominatim') ? json(TAYLORS_FALLS) : json({ elevation: [211] })),
    )
    await reverseGeocode(45.3955, -92.6616)
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('nominatim'))
    expect((call?.[1] as RequestInit | undefined)?.headers).toMatchObject({ 'User-Agent': expect.stringMatching(/WeatherTeam6/) })
  })

  it('keeps the elevation when the name lookup fails, and the name when the elevation fails', async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(url.includes('nominatim') ? json({}, 403) : json({ elevation: [211] })),
    )
    expect(await reverseGeocode(45.3955, -92.6616)).toEqual({
      name: null,
      admin1: null,
      country: null,
      elevation_m: 211,
    })

    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(url.includes('nominatim') ? json(TAYLORS_FALLS) : json({}, 403)),
    )
    const named = await reverseGeocode(45.3955, -92.6616)
    expect(named.name).toBe('Taylors Falls')
    expect(named.elevation_m).toBeNull()
  })
})
