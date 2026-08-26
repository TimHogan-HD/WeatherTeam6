import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { LiveForecastLocation } from './liveForecast.js'

/**
 * `computeLiveForecast` is the orchestration every conditions and forecast
 * response goes through, and until now nothing exercised it. These tests mock
 * the three upstream fetches and assert on what it builds from them.
 *
 * It imports `db/schema.js` for a type only, so there is no database import to
 * work around here.
 */

const fetchEnsemble = vi.hoisted(() => vi.fn())
const fetchNBM = vi.hoisted(() => vi.fn())
const fetchArchivePrecip = vi.hoisted(() => vi.fn())
const fetchPrecipHistory = vi.hoisted(() => vi.fn())

vi.mock('../weather/openMeteo.js', () => ({ fetchEnsemble, fetchNBM, fetchArchivePrecip }))
vi.mock('../weather/acis.js', () => ({ fetchPrecipHistory }))

const { computeLiveForecast } = await import('./liveForecast.js')

const NOW = new Date('2026-08-26T12:00:00.000Z')

function iso(offsetDays: number): string {
  return new Date(NOW.getTime() + offsetDays * 86_400_000).toISOString().slice(0, 10)
}

function day(offsetDays: number, over: Record<string, number> = {}) {
  return {
    date: iso(offsetDays),
    precip_mm_p10: 0,
    precip_mm_p50: 0,
    precip_mm_p90: 0,
    temp_c_min: 15,
    temp_c_max: 20,
    wind_kmh_max: 10,
    humidity_pct: 40,
    dewpoint_c: 5,
    shortwave_wm2: 100,
    ...over,
  }
}

const location: LiveForecastLocation = {
  id: 'loc-1',
  lat: '36.15',
  lon: '-115.45',
  elevation_m: '1200',
  rock_type: 'sandstone',
  cliff_angle: '45',
  aspect: 'S',
  asos_station: null,
}

beforeEach(() => {
  fetchArchivePrecip.mockResolvedValue([])
  fetchPrecipHistory.mockResolvedValue([])
  fetchEnsemble.mockResolvedValue({
    days: [day(0), day(1), day(2)],
    model_sources: ['gfs_seamless'],
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('computeLiveForecast — forecast source', () => {
  it('does not call NBM at all', async () => {
    // NBM requests precipitation quantiles Open-Meteo does not define, so the
    // call could only ever 400. Issue #22.
    await computeLiveForecast(location, NOW)
    expect(fetchNBM).not.toHaveBeenCalled()
    expect(fetchEnsemble).toHaveBeenCalledOnce()
  })

  it('reports the models the ensemble actually returned', async () => {
    const { snapshots } = await computeLiveForecast(location, NOW)
    expect(snapshots[0]?.model_sources).toEqual(['gfs_seamless'])
  })

  it('uses the ASOS station for rainfall when the location has one', async () => {
    await computeLiveForecast({ ...location, asos_station: 'KLAS' }, NOW)
    expect(fetchPrecipHistory).toHaveBeenCalledOnce()
    expect(fetchArchivePrecip).not.toHaveBeenCalled()
  })

  it('falls back to the Open-Meteo archive when it does not', async () => {
    await computeLiveForecast(location, NOW)
    expect(fetchArchivePrecip).toHaveBeenCalledOnce()
    expect(fetchPrecipHistory).not.toHaveBeenCalled()
  })
})

describe('computeLiveForecast — per-day scoring', () => {
  it('scores each day against its own wind, not against today’s', async () => {
    // The regression this test exists for: `maxWindKmh24h` was fed today's
    // wind for every day, so a day-7 score reported a wind rating measured six
    // days earlier and every day carried an identical wind component.
    fetchEnsemble.mockResolvedValue({
      days: [
        day(0, { wind_kmh_max: 5 }), // calm today   -> full marks
        day(1, { wind_kmh_max: 60 }), // gale tomorrow -> zero
      ],
      model_sources: ['gfs_seamless'],
    })

    const { scores } = await computeLiveForecast(location, NOW)

    expect(scores[0]?.component_wind).toBe(15)
    expect(scores[1]?.component_wind).toBe(0)
  })

  it('still scores temperature per day', async () => {
    fetchEnsemble.mockResolvedValue({
      days: [day(0, { temp_c_max: 18 }), day(1, { temp_c_max: 40 })],
      model_sources: ['gfs_seamless'],
    })

    const { scores } = await computeLiveForecast(location, NOW)

    expect(scores[0]?.component_temp).toBe(12)
    // Above 35 °C the component zeroes — the issue #21 case.
    expect(scores[1]?.component_temp).toBe(0)
  })

  it('returns one snapshot and one score per forecast day', async () => {
    const { snapshots, scores } = await computeLiveForecast(location, NOW)
    expect(snapshots).toHaveLength(3)
    expect(scores).toHaveLength(3)
    expect(snapshots.map((s) => s.forecast_date)).toEqual([iso(0), iso(1), iso(2)])
  })

  it('returns nothing when the forecast is empty, rather than throwing', async () => {
    fetchEnsemble.mockResolvedValue({ days: [], model_sources: [] })
    const result = await computeLiveForecast(location, NOW)
    expect(result).toEqual({ snapshots: [], scores: [] })
  })

  it('survives a rainfall fetch that throws', async () => {
    // Swallowed on purpose — the drying model falls back to its no-data
    // sentinel. The display cap in the clients is what keeps that from
    // rendering as a precise fact.
    fetchArchivePrecip.mockRejectedValue(new Error('ACIS down'))
    const { scores } = await computeLiveForecast(location, NOW)
    expect(scores).toHaveLength(3)
  })
})

describe('computeLiveForecast — a feed that starts tomorrow', () => {
  it('still returns scores for the days it does have', async () => {
    fetchEnsemble.mockResolvedValue({
      days: [day(1), day(2)],
      model_sources: ['gfs_seamless'],
    })
    const { snapshots, scores } = await computeLiveForecast(location, NOW)
    expect(snapshots.map((s) => s.forecast_date)).toEqual([iso(1), iso(2)])
    // Nothing matches today, which is what makes GET /conditions/:id answer
    // 200 with data: null.
    expect(scores.find((s) => s.forecast_date === iso(0))).toBeUndefined()
  })
})
