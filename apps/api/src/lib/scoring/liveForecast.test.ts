import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { LiveForecastLocation } from './liveForecast.js'

/**
 * `computeLiveForecast` builds the daily weather every `/forecast` and trip
 * response goes through. The ensemble read is mocked; `latestRuns.js` is
 * mocked whole, so its database import never loads. Weather only since the
 * five-component score was retired (scoring Phase 5b).
 */

const getEnsembleDaily = vi.hoisted(() => vi.fn())
const fetchNBM = vi.hoisted(() => vi.fn())

// The fetches are stubbed; `localDateString` is the real one. Reimplementing it
// in the mock would make these tests agree with a copy of the logic rather than
// with the logic — the failure mode catalogued as class 11 in defect-patterns.md.
vi.mock('../weather/openMeteo.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../weather/openMeteo.js')>()
  return { ...actual, fetchNBM }
})
vi.mock('../runs/latestRuns.js', () => ({ getEnsembleDaily }))

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

const location: LiveForecastLocation = { id: 'loc-1', lat: '36.15', lon: '-115.45', elevation_m: '1200' }

beforeEach(() => {
  getEnsembleDaily.mockResolvedValue({
    days: [day(2), day(0), day(1)],
    model_sources: ['gfs_seamless'],
    utc_offset_seconds: 0,
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('computeLiveForecast — the daily weather', () => {
  it('does not call NBM at all', async () => {
    // NBM requests precipitation quantiles Open-Meteo does not define, so the
    // call could only ever 400. Issue #22.
    await computeLiveForecast(location, NOW)
    expect(fetchNBM).not.toHaveBeenCalled()
    expect(getEnsembleDaily).toHaveBeenCalledOnce()
  })

  it('reports the models the ensemble actually returned', async () => {
    const { snapshots } = await computeLiveForecast(location, NOW)
    expect(snapshots[0]?.model_sources).toEqual(['gfs_seamless'])
  })

  it('returns one snapshot per forecast day, in date order', async () => {
    const { snapshots } = await computeLiveForecast(location, NOW)
    expect(snapshots.map((s) => s.forecast_date)).toEqual([iso(0), iso(1), iso(2)])
  })

  it('carries each day its own figures, not the first day’s', async () => {
    getEnsembleDaily.mockResolvedValue({
      days: [day(0, { wind_kmh_max: 5 }), day(1, { wind_kmh_max: 40 })],
      model_sources: ['gfs_seamless'],
      utc_offset_seconds: 0,
    })
    const { snapshots } = await computeLiveForecast(location, NOW)
    expect(snapshots.map((s) => s.wind_kmh_max)).toEqual([5, 40])
  })

  it('returns nothing when the forecast is empty, rather than throwing', async () => {
    getEnsembleDaily.mockResolvedValue({ days: [], model_sources: [], utc_offset_seconds: 0 })
    expect(await computeLiveForecast(location, NOW)).toEqual({ snapshots: [], todayStr: '' })
  })
})

/**
 * Issue #33. "Today" used to be a UTC date derived independently by the API and
 * by the Mini App, while the buckets were UTC days — so both were wrong in the
 * same direction, agreed with each other, and nothing could detect it. West of
 * Greenwich the day rolled over in the afternoon and today's high was rendered
 * as tomorrow's.
 */
describe('computeLiveForecast — local days (#33)', () => {
  /** 19:00 in Las Vegas on the 25th is already 02:00 on the 26th in UTC. */
  const LATE_AFTERNOON_PT = new Date('2026-08-26T02:00:00.000Z')
  const PT_OFFSET = -7 * 3600

  function pacificFeed() {
    getEnsembleDaily.mockResolvedValue({
      days: [
        { ...day(0), date: '2026-08-25' },
        { ...day(0), date: '2026-08-26' },
        { ...day(0), date: '2026-08-27' },
      ],
      model_sources: ['gfs_seamless'],
      utc_offset_seconds: PT_OFFSET,
    })
  }

  it('reports the location’s local day, not the server’s UTC day', async () => {
    pacificFeed()
    const result = await computeLiveForecast(location, LATE_AFTERNOON_PT)

    // UTC says the 26th. Las Vegas says the 25th, and Las Vegas is right.
    expect(result.todayStr).toBe('2026-08-25')
  })

  it('flags exactly one snapshot as today, and it is the local one', async () => {
    pacificFeed()
    const { snapshots } = await computeLiveForecast(location, LATE_AFTERNOON_PT)

    const flagged = snapshots.filter((s) => s.is_today === true)
    expect(flagged).toHaveLength(1)
    expect(flagged[0]?.forecast_date).toBe('2026-08-25')
  })

  it('flags no snapshot when the feed genuinely starts tomorrow', async () => {
    getEnsembleDaily.mockResolvedValue({
      days: [
        { ...day(0), date: '2026-08-26' },
        { ...day(0), date: '2026-08-27' },
      ],
      model_sources: ['gfs_seamless'],
      utc_offset_seconds: PT_OFFSET,
    })
    const { snapshots } = await computeLiveForecast(location, LATE_AFTERNOON_PT)

    expect(snapshots.every((s) => s.is_today === false)).toBe(true)
  })

  it('treats a missing offset as UTC rather than producing an invalid date', async () => {
    // An upstream that stops sending utc_offset_seconds must degrade to the old
    // behaviour — wrong by at most a day — not to "Invalid Date".
    getEnsembleDaily.mockResolvedValue({
      days: [{ ...day(0), date: '2026-08-26' }],
      model_sources: ['gfs_seamless'],
      utc_offset_seconds: undefined as unknown as number,
    })
    const result = await computeLiveForecast(location, LATE_AFTERNOON_PT)

    expect(result.todayStr).toBe('2026-08-26')
  })
})
