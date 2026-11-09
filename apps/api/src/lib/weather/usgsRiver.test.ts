import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRiverPoints, parseRiverPoints, riverItemsUrl } from './usgsRiver.js'

const feature = (time: unknown, value: unknown, unit: unknown = 'ft') => ({
  type: 'Feature',
  properties: { time, value, unit_of_measure: unit },
  geometry: null,
})

describe('parseRiverPoints', () => {
  it('reads string values in feet and sorts oldest first', () => {
    const body = {
      features: [feature('2026-11-09T13:00:00+00:00', '4.88'), feature('2026-11-08T13:15:00+00:00', '4.95')],
    }
    expect(parseRiverPoints(body)).toEqual([
      { at: '2026-11-08T13:15:00.000Z', height_ft: 4.95 },
      { at: '2026-11-09T13:00:00.000Z', height_ft: 4.88 },
    ])
  })

  it('drops a blank, missing or non-numeric value rather than reading 0', () => {
    const body = {
      features: [
        feature('2026-11-09T13:00:00Z', ''),
        feature('2026-11-09T13:15:00Z', null),
        feature('2026-11-09T13:30:00Z', 'Ice'),
        feature('2026-11-09T13:45:00Z', '4.9'),
      ],
    }
    expect(parseRiverPoints(body)).toEqual([{ at: '2026-11-09T13:45:00.000Z', height_ft: 4.9 }])
  })

  it('drops a point in another unit or with an unreadable time', () => {
    const body = { features: [feature('2026-11-09T13:00:00Z', '1.5', 'm'), feature('not a time', '4.9')] }
    expect(parseRiverPoints(body)).toEqual([])
  })

  it('is empty for a body that is not a feature collection', () => {
    expect(parseRiverPoints(null)).toEqual([])
    expect(parseRiverPoints({ type: 'error' })).toEqual([])
    expect(parseRiverPoints({ features: 'nope' })).toEqual([])
  })
})

describe('riverItemsUrl', () => {
  it('asks for gage height at the site over the window', () => {
    const url = new URL(riverItemsUrl('USGS-05336700', Date.parse('2026-11-08T13:00:00Z'), Date.parse('2026-11-09T15:00:00Z')))
    expect(url.host).toBe('api.waterdata.usgs.gov')
    expect(url.searchParams.get('monitoring_location_id')).toBe('USGS-05336700')
    expect(url.searchParams.get('parameter_code')).toBe('00065')
    expect(url.searchParams.get('time')).toBe('2026-11-08T13:00:00.000Z/2026-11-09T15:00:00.000Z')
  })
})

describe('fetchRiverPoints', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('is empty on a non-ok answer, never a reading', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 403 })))
    expect(await fetchRiverPoints('USGS-05336700')).toEqual([])
  })

  it('is empty when the body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200 })))
    expect(await fetchRiverPoints('USGS-05336700')).toEqual([])
  })

  it('returns the parsed points on success', async () => {
    const body = { features: [feature('2026-11-09T13:00:00Z', '4.88')] }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })))
    expect(await fetchRiverPoints('USGS-05336700')).toEqual([{ at: '2026-11-09T13:00:00.000Z', height_ft: 4.88 }])
  })
})
