import { describe, expect, it, vi } from 'vitest'
import { SOIL_STATIONS } from '@weatherteam6/types'
import { servedSoilStation, soilReading, type SoilFetchers } from './soilReading.js'

const STATION = SOIL_STATIONS['robinson-park']
const DFRC = SOIL_STATIONS['devils-lake']
const NOW = Date.UTC(2026, 10, 12, 19)
const HOUR = 3_600_000

const never = vi.fn(async () => {
  throw new Error('not this network')
})
const fetchers = (over: Partial<SoilFetchers>): SoilFetchers => ({ soil: never, rain: never, wisconet: never, ...over })

describe('servedSoilStation', () => {
  it('sends a Wisconet reading only to a client that reads its basis, and NOAA to any', () => {
    expect(servedSoilStation(DFRC ?? null, undefined)).toBeNull()
    expect(servedSoilStation(DFRC ?? null, 'date')).toBeNull()
    expect(servedSoilStation(DFRC ?? null, 'recent')).toBe(DFRC)
    expect(servedSoilStation(STATION ?? null, undefined)).toBe(STATION)
    expect(servedSoilStation(null, 'recent')).toBeNull()
  })
})

describe('soilReading (NOAA)', () => {
  it('says a failed soil read rather than returning dry ground, and keeps the rain it did get', async () => {
    if (STATION === undefined) throw new Error('no station')
    const out = await soilReading(
      STATION,
      NOW,
      fetchers({
        soil: vi.fn(async () => {
          throw new Error('HTTP 503')
        }),
        rain: vi.fn(async () => [{ endMs: NOW, mm: 0 }]),
      }),
    )
    expect(out.answered).toBe(false)
    expect(out.points).toEqual([])
    expect(out.rain_days.length).toBeGreaterThanOrEqual(15)
    expect(out.basis).toEqual({ kind: 'date' })
    expect(out.station).toEqual({ network: 'uscrn', name: 'Sandstone 6 W', distance_km: 10.4, direction: 'west', setting: 'in an open field' })
  })

  it('leaves the rain bars empty when the rain read fails', async () => {
    if (STATION === undefined) throw new Error('no station')
    const out = await soilReading(
      STATION,
      NOW,
      fetchers({
        soil: vi.fn(async () => []),
        rain: vi.fn(async () => {
          throw new Error('HTTP 503')
        }),
      }),
    )
    expect(out.answered).toBe(true)
    expect(out.rain_days).toEqual([])
  })
})

describe('soilReading (Wisconet)', () => {
  const hour = (hoursAgo: number, vwc_5: number) => ({
    endMs: NOW - hoursAgo * HOUR,
    vwc_5,
    temp_5_c: 8,
    vwc_20: 0.3,
    temp_20_c: 9,
    rain_mm: 0,
  })

  it('ranks against the 30 days it read, but carries only the last 15', async () => {
    if (DFRC === undefined) throw new Error('no station')
    const wisconet = vi.fn(async (_s: unknown, _from: number) => [hour(29 * 24, 0.1), hour(20 * 24, 0.4), hour(2, 0.2), hour(1, 0.25)])
    const out = await soilReading(DFRC, NOW, fetchers({ wisconet }))
    expect(wisconet.mock.calls[0]?.[1]).toBe(NOW - 30 * 24 * HOUR)
    expect(out.answered).toBe(true)
    expect(out.basis).toEqual({ kind: 'recent', days: 30, lo_5: 0.1, hi_5: 0.4 })
    // Both kept points; the wetter of them ranks 2.5 of 4 counting itself half, the 30-day-old 0.1 below it.
    expect(out.points.map((p) => [p.vwc_5, p.pct_5])).toEqual([
      [0.2, 0.375],
      [0.25, 0.625],
    ])
    expect(out.station.network).toBe('wisconet')
  })

  it('says a failed read rather than dry ground, with no range', async () => {
    if (DFRC === undefined) throw new Error('no station')
    const out = await soilReading(
      DFRC,
      NOW,
      fetchers({
        wisconet: vi.fn(async () => {
          throw new Error('HTTP 503')
        }),
      }),
    )
    expect(out).toMatchObject({ answered: false, points: [], rain_days: [], basis: { kind: 'recent', lo_5: null, hi_5: null } })
  })
})
