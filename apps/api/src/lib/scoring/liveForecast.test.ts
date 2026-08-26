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

// The fetches are stubbed; `localDateString` is the real one. Reimplementing it
// in the mock would make these tests agree with a copy of the logic rather than
// with the logic — the failure mode catalogued as class 11 in defect-patterns.md.
vi.mock('../weather/openMeteo.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../weather/openMeteo.js')>()
  return { ...actual, fetchEnsemble, fetchNBM, fetchArchivePrecip }
})
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
    utc_offset_seconds: 0,
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

  it('asks for the 30 days BEFORE now, on both rainfall paths', async () => {
    // Only the call count was asserted, so the window itself was free: flip the
    // sign and the range runs 30 days into the future, which comes back empty.
    // An empty rainfall history is not distinguishable downstream from a dry
    // month — dryingModel returns its 720h sentinel either way — so the score
    // inflates and the Mini App renders "no rain in 720h" as a measurement.
    // Found by mutation testing.
    await computeLiveForecast(location, NOW)
    expect(fetchArchivePrecip).toHaveBeenCalledWith(36.15, -115.45, iso(-30), iso(0))

    await computeLiveForecast({ ...location, asos_station: 'KLAS' }, NOW)
    expect(fetchPrecipHistory).toHaveBeenCalledWith('KLAS', iso(-30), iso(0))
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
    utc_offset_seconds: 0,
    })

    const { scores } = await computeLiveForecast(location, NOW)

    expect(scores[0]?.component_wind).toBe(15)
    expect(scores[1]?.component_wind).toBe(0)
  })

  it('takes the humidity proxy from today’s day, not from whichever day comes first', async () => {
    // `currentHumidityPct` is looked up with `days.find(d => d.date === todayStr)`
    // and then applied to every day's score. Invert that comparison and it
    // silently reads a different day: with every fixture day sharing one
    // humidity, nothing could tell. Here today is humid and the rest are dry,
    // so the wrong day scores full marks instead of zero.
    fetchEnsemble.mockResolvedValue({
      days: [day(0, { humidity_pct: 95 }), day(1, { humidity_pct: 20 }), day(2, { humidity_pct: 20 })],
      model_sources: ['gfs_seamless'],
      utc_offset_seconds: 0,
    })

    const { scores } = await computeLiveForecast(location, NOW)

    expect(scores).not.toHaveLength(0)
    for (const s of scores) expect(s.component_humidity).toBe(0)
  })

  it('still scores temperature per day', async () => {
    fetchEnsemble.mockResolvedValue({
      days: [day(0, { temp_c_max: 18 }), day(1, { temp_c_max: 40 })],
      model_sources: ['gfs_seamless'],
    utc_offset_seconds: 0,
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
    fetchEnsemble.mockResolvedValue({ days: [], model_sources: [], utc_offset_seconds: 0 })
    const result = await computeLiveForecast(location, NOW)
    expect(result).toEqual({ snapshots: [], scores: [], todayStr: '' })
  })

  it('withholds the score when the rainfall fetch throws, and says why (#34)', async () => {
    // This used to assert `scores` still had three entries. That WAS the bug:
    // an empty rainfall list is indistinguishable from a dry month, and
    // dryingModel's 720-hour sentinel is worth 40 of 100 points — so an
    // upstream outage raised the score and the day could read "Dry, settled"
    // for rock nothing had checked.
    fetchArchivePrecip.mockRejectedValue(new Error('ACIS down'))

    const { snapshots, scores, scoreUnavailable } = await computeLiveForecast(location, NOW)

    expect(scores).toEqual([])
    expect(scoreUnavailable).toBe('rainfall_unavailable')
    // The weather is unaffected — only the score is withheld.
    expect(snapshots).toHaveLength(3)
  })

  it('withholds it on the ASOS path too, not just the archive fallback', async () => {
    fetchPrecipHistory.mockRejectedValue(new Error('ACIS down'))
    const { scoreUnavailable } = await computeLiveForecast(
      { ...location, asos_station: 'KLAS' },
      NOW,
    )
    expect(scoreUnavailable).toBe('rainfall_unavailable')
  })

  it('scores normally when rainfall came back empty but the fetch succeeded', async () => {
    // A genuine dry month must still score. The distinction this fix introduces
    // is "the call failed", not "the call returned nothing".
    fetchArchivePrecip.mockResolvedValue([])
    const { scores, scoreUnavailable } = await computeLiveForecast(location, NOW)
    expect(scoreUnavailable).toBeUndefined()
    expect(scores).toHaveLength(3)
  })
})

describe('computeLiveForecast — a feed that starts tomorrow', () => {
  it('still returns scores for the days it does have', async () => {
    fetchEnsemble.mockResolvedValue({
      days: [day(1), day(2)],
      model_sources: ['gfs_seamless'],
    utc_offset_seconds: 0,
    })
    const { snapshots, scores } = await computeLiveForecast(location, NOW)
    expect(snapshots.map((s) => s.forecast_date)).toEqual([iso(1), iso(2)])
    // Nothing matches today, which is what makes GET /conditions/:id answer
    // 200 with data: null.
    expect(scores.find((s) => s.forecast_date === iso(0))).toBeUndefined()
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
    fetchEnsemble.mockResolvedValue({
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

  it('scores the local day as day zero, so days-out is not off by one', async () => {
    pacificFeed()
    const { scores } = await computeLiveForecast(location, LATE_AFTERNOON_PT)

    // The 25th is today, so the 27th is two days out — under the old UTC
    // reckoning the 25th was in the past and the 27th only one day out.
    expect(scores.find((s) => s.forecast_date === '2026-08-27')?.confidence).toBeDefined()
    expect(scores[0]?.forecast_date).toBe('2026-08-25')
  })

  it('flags no snapshot when the feed genuinely starts tomorrow', async () => {
    fetchEnsemble.mockResolvedValue({
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
    fetchEnsemble.mockResolvedValue({
      days: [{ ...day(0), date: '2026-08-26' }],
      model_sources: ['gfs_seamless'],
      utc_offset_seconds: undefined as unknown as number,
    })
    const result = await computeLiveForecast(location, LATE_AFTERNOON_PT)

    expect(result.todayStr).toBe('2026-08-26')
  })
})
