import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseGeocodeResults, searchPlaces } from './geocode.js'

const RED_ROCK_NV = {
  id: 5509403,
  name: 'Red Rock Canyon National Conservation Area',
  latitude: 36.13523,
  longitude: -115.42722,
  elevation: 1200,
  country: 'United States',
  admin1: 'Nevada',
  timezone: 'America/Los_Angeles',
  feature_code: 'PRK',
}

const RED_ROCK_OK = {
  id: 4548267,
  name: 'Red Rock Canyon',
  latitude: 35.44923,
  longitude: -98.35145,
  elevation: 480,
  country: 'United States',
  admin1: 'Oklahoma',
  timezone: 'America/Chicago',
  feature_code: 'PPL',
}

describe('parseGeocodeResults', () => {
  it('returns [] when the response carries no results key', () => {
    // A no-match search is a 200 with `results` absent entirely, not an empty array.
    expect(parseGeocodeResults({ generationtime_ms: 0.3 })).toEqual([])
  })

  it('returns [] for null, a non-object, or a non-array results field', () => {
    expect(parseGeocodeResults(null)).toEqual([])
    expect(parseGeocodeResults('nope')).toEqual([])
    expect(parseGeocodeResults({ results: 'nope' })).toEqual([])
  })

  it('maps a full row onto the GeocodeResult shape', () => {
    expect(parseGeocodeResults({ results: [RED_ROCK_NV] })).toEqual([
      {
        id: 5509403,
        name: 'Red Rock Canyon National Conservation Area',
        lat: 36.13523,
        lon: -115.42722,
        elevation_m: 1200,
        admin1: 'Nevada',
        country: 'United States',
        timezone: 'America/Los_Angeles',
        feature_code: 'PRK',
      },
    ])
  })

  it('preserves the disambiguating fields across near-identical names', () => {
    const parsed = parseGeocodeResults({ results: [RED_ROCK_NV, RED_ROCK_OK] })
    expect(parsed).toHaveLength(2)
    expect(parsed.map((p) => p.admin1)).toEqual(['Nevada', 'Oklahoma'])
    expect(parsed.map((p) => p.elevation_m)).toEqual([1200, 480])
    expect(parsed.map((p) => p.feature_code)).toEqual(['PRK', 'PPL'])
  })

  it('distinguishes a park from the town sharing its name — issue #82', () => {
    // "Willow River" returned a Minnesota town (PPL) and a Wisconsin state
    // park (PRK) 90 miles apart under the same admin1-less near-identical
    // name; only feature_code told them apart.
    const willowRiverTown = { ...RED_ROCK_OK, name: 'Willow River', feature_code: 'PPL' }
    const willowRiverPark = { ...RED_ROCK_NV, name: 'Willow River State Park', feature_code: 'PRK' }
    const parsed = parseGeocodeResults({ results: [willowRiverTown, willowRiverPark] })
    expect(parsed.map((p) => p.feature_code)).toEqual(['PPL', 'PRK'])
  })

  it('keeps a row with no elevation — the lapse-rate correction is simply skipped', () => {
    const { elevation: _elevation, ...noElevation } = RED_ROCK_NV
    const parsed = parseGeocodeResults({ results: [noElevation] })
    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.elevation_m).toBeNull()
  })

  it('nulls out missing or non-string secondary fields', () => {
    const { admin1: _a, country: _c, timezone: _t, feature_code: _f, ...bare } = RED_ROCK_NV
    const parsed = parseGeocodeResults({ results: [{ ...bare, admin1: 42 }] })
    expect(parsed[0]).toMatchObject({
      admin1: null,
      country: null,
      timezone: null,
      feature_code: null,
    })
  })

  it('drops rows missing an identity field rather than emitting nulls', () => {
    const parsed = parseGeocodeResults({
      results: [
        { ...RED_ROCK_NV, name: undefined },
        { ...RED_ROCK_NV, latitude: null },
        { ...RED_ROCK_NV, longitude: 'x' },
        { ...RED_ROCK_NV, id: undefined },
        null,
        'not an object',
        RED_ROCK_OK,
      ],
    })
    expect(parsed).toEqual([expect.objectContaining({ id: 4548267 })])
  })

  it('drops rows whose coordinates are out of range', () => {
    const parsed = parseGeocodeResults({
      results: [
        { ...RED_ROCK_NV, latitude: 91 },
        { ...RED_ROCK_OK, longitude: -181 },
      ],
    })
    expect(parsed).toEqual([])
  })
})

describe('searchPlaces', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('short-circuits a query shorter than 2 characters without a request', async () => {
    await expect(searchPlaces('R')).resolves.toEqual([])
    await expect(searchPlaces('   ')).resolves.toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('sends the trimmed query as `name` and parses the response', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ results: [RED_ROCK_NV] }), { status: 200 }),
    )

    const results = await searchPlaces('  Red Rock Canyon  ')

    expect(results).toHaveLength(1)
    const url = new URL(vi.mocked(fetch).mock.calls[0]?.[0] as string)
    expect(url.searchParams.get('name')).toBe('Red Rock Canyon')
    expect(url.searchParams.get('count')).toBe('10')
  })

  it('clamps the requested count into range', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }))

    await searchPlaces('Bishop', 500)

    const url = new URL(vi.mocked(fetch).mock.calls[0]?.[0] as string)
    expect(url.searchParams.get('count')).toBe('20')
  })

  it('throws on a non-retryable error status without leaking the body', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('upstream detail', { status: 400 }))

    await expect(searchPlaces('Bishop')).rejects.toThrow('Open-Meteo geocoding API returned 400')
  })

  it('retries once with a comma inserted before the last word on an empty first result — real-device report', async () => {
    // Measured live: "Minneapolis, MN" matched and the comma-less
    // "Minneapolis MN" did not, for the identical two words.
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [RED_ROCK_NV] }), { status: 200 }))

    const results = await searchPlaces('Minneapolis MN')

    expect(results).toHaveLength(1)
    expect(fetch).toHaveBeenCalledTimes(2)
    const firstUrl = new URL(vi.mocked(fetch).mock.calls[0]?.[0] as string)
    const secondUrl = new URL(vi.mocked(fetch).mock.calls[1]?.[0] as string)
    expect(firstUrl.searchParams.get('name')).toBe('Minneapolis MN')
    expect(secondUrl.searchParams.get('name')).toBe('Minneapolis, MN')
  })

  it('does not retry when the query already has a comma', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))

    await expect(searchPlaces('Minneapolis, MN')).resolves.toEqual([])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not retry a single-word query — there is nowhere to put the comma', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))

    await expect(searchPlaces('Minneapolis')).resolves.toEqual([])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not retry once the first attempt already found something', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ results: [RED_ROCK_NV] }), { status: 200 }),
    )

    await searchPlaces('Red Rock Canyon')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
