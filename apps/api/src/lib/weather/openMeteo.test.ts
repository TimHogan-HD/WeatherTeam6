import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  computePercentile,
  parseEnsemble,
  fetchEnsemble,
  fetchNBM,
  type ForecastLocation,
} from './openMeteo.js'

describe('computePercentile', () => {
  it('returns 0 for an empty array', () => {
    expect(computePercentile([], 50)).toBe(0)
  })

  it('returns the single value for a one-element array', () => {
    expect(computePercentile([7], 50)).toBe(7)
    expect(computePercentile([7], 10)).toBe(7)
    expect(computePercentile([7], 90)).toBe(7)
  })

  it('returns the middle value for an odd-length array at p50', () => {
    expect(computePercentile([1, 3, 5, 7, 9], 50)).toBe(5)
  })

  it('interpolates correctly for p10 and p90', () => {
    const sorted = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18]
    expect(computePercentile(sorted, 10)).toBeCloseTo(1.8)
    expect(computePercentile(sorted, 90)).toBeCloseTo(16.2)
  })
})

const SUFFIX = '_ncep_gefs_seamless'

function makeTimes(date: string, hours = 24): string[] {
  return Array.from({ length: hours }, (_, h) => {
    const hStr = String(h).padStart(2, '0')
    return `${date}T${hStr}:00`
  })
}

function buildSyntheticHourly(memberCount: number, date: string): Record<string, unknown> {
  const times = makeTimes(date)
  const hourly: Record<string, unknown> = { time: times }

  for (let m = 1; m <= memberCount; m++) {
    const tag = `member${String(m).padStart(2, '0')}`
    hourly[`precipitation_${tag}${SUFFIX}`] = Array(24).fill(m)
    hourly[`temperature_2m_${tag}${SUFFIX}`] = Array(24).fill(20 + m)
    hourly[`windspeed_10m_${tag}${SUFFIX}`] = Array(24).fill(10 + m)
    hourly[`relativehumidity_2m_${tag}${SUFFIX}`] = Array(24).fill(50 + m)
    hourly[`dewpoint_2m_${tag}${SUFFIX}`] = Array(24).fill(5 + m)
    hourly[`shortwave_radiation_${tag}${SUFFIX}`] = Array(24).fill(200 + m * 10)
  }

  return hourly
}

const ZERO_LOC: ForecastLocation = { lat: 34, lon: -116, elevation_m: null }

describe('parseEnsemble', () => {
  it('returns one DailyForecast per date and populates model_sources with gfs_seamless', () => {
    const hourly = buildSyntheticHourly(3, '2025-06-01')
    const result = parseEnsemble(hourly)

    expect(result.days).toHaveLength(1)
    expect(result.days[0]?.date).toBe('2025-06-01')
    expect(result.model_sources).toContain('gfs_seamless')
  })

  it('satisfies p10 <= p50 <= p90 ordering on precipitation', () => {
    const hourly = buildSyntheticHourly(10, '2025-06-01')
    const result = parseEnsemble(hourly)
    const day = result.days[0]
    expect(day).toBeDefined()
    if (!day) return

    expect(day.precip_mm_p10).toBeLessThanOrEqual(day.precip_mm_p50)
    expect(day.precip_mm_p50).toBeLessThanOrEqual(day.precip_mm_p90)
  })

  it('aggregates dewpoint and shortwave as daily means', () => {
    const hourly = buildSyntheticHourly(3, '2025-06-01')
    const result = parseEnsemble(hourly)
    const day = result.days[0]
    expect(day).toBeDefined()
    if (!day) return

    // members 1,2,3 with values 5+m and 200+m*10 → means are 7 and 220
    expect(day.dewpoint_c).toBeCloseTo(7)
    expect(day.shortwave_wm2).toBeCloseTo(220)
  })

  it('handles null member values gracefully — output stays numeric', () => {
    const times = makeTimes('2025-06-02')
    const hourly: Record<string, unknown> = {
      time: times,
      [`precipitation_member01${SUFFIX}`]: Array(24).fill(null),
      [`temperature_2m_member01${SUFFIX}`]: Array(24).fill(null),
      [`windspeed_10m_member01${SUFFIX}`]: Array(24).fill(null),
      [`relativehumidity_2m_member01${SUFFIX}`]: Array(24).fill(null),
    }
    const result = parseEnsemble(hourly)
    const day = result.days[0]
    expect(day).toBeDefined()
    if (!day) return

    expect(typeof day.precip_mm_p10).toBe('number')
    expect(typeof day.precip_mm_p50).toBe('number')
    expect(typeof day.precip_mm_p90).toBe('number')
    expect(isNaN(day.precip_mm_p10)).toBe(false)
    expect(isNaN(day.humidity_pct)).toBe(false)
    expect(isNaN(day.dewpoint_c)).toBe(false)
    expect(isNaN(day.shortwave_wm2)).toBe(false)
  })

  it('treats string sentinels, NaN, and undefined in member arrays as missing — no NaN leaks', () => {
    const times = makeTimes('2025-06-03', 4)
    const hourly: Record<string, unknown> = {
      time: times,
      [`precipitation_member01${SUFFIX}`]: [1, 'M', NaN, undefined],
      [`temperature_2m_member01${SUFFIX}`]: ['-', 20, NaN, 22],
      [`windspeed_10m_member01${SUFFIX}`]: [NaN, 'T', 15, undefined],
      [`relativehumidity_2m_member01${SUFFIX}`]: ['NaN', NaN, 60, 70],
    }
    const result = parseEnsemble(hourly)
    const day = result.days[0]
    expect(day).toBeDefined()
    if (!day) return

    // Only the finite numbers participate: precip sum 1, temps 20/22, wind 15, humidity mean 65
    expect(day.precip_mm_p50).toBe(1)
    expect(day.temp_c_min).toBe(20)
    expect(day.temp_c_max).toBe(22)
    expect(day.wind_kmh_max).toBe(15)
    expect(day.humidity_pct).toBe(65)
    for (const v of Object.values(day)) {
      if (typeof v === 'number') expect(isNaN(v)).toBe(false)
    }
  })
})

describe('fetchEnsemble', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('constructs URL with correct lat, lon, models, and hourly params', async () => {
    const mockHourly = buildSyntheticHourly(2, '2025-06-01')
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ latitude: 34.0, longitude: -116.0, hourly: mockHourly }),
    } as Response)

    await fetchEnsemble(ZERO_LOC)

    const calledUrl = fetchMock.mock.calls[0]?.[0]
    expect(typeof calledUrl).toBe('string')
    if (typeof calledUrl !== 'string') return
    expect(calledUrl).toContain('latitude=34')
    expect(calledUrl).toContain('longitude=-116')
    expect(calledUrl).toContain('models=')
    expect(calledUrl).toContain('hourly=')
    expect(calledUrl).toContain('dewpoint_2m')
    expect(calledUrl).toContain('shortwave_radiation')
  })

  it('returns parsed OpenMeteoResult on success', async () => {
    const mockHourly = buildSyntheticHourly(3, '2025-06-01')
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ latitude: 34.0, longitude: -116.0, hourly: mockHourly }),
    } as Response)

    const result = await fetchEnsemble(ZERO_LOC)

    expect(result.days).toHaveLength(1)
    expect(result.model_sources).toContain('gfs_seamless')
  })

  it('applies lapse-rate correction when crag elevation differs from model grid', async () => {
    const mockHourly = buildSyntheticHourly(3, '2025-06-01')
    // Members 1,2,3 → temperature_2m values 21,22,23. Min=21, Max=23.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        latitude: 34.0,
        longitude: -116.0,
        elevation: 500,
        hourly: mockHourly,
      }),
    } as Response)

    const result = await fetchEnsemble({ lat: 34, lon: -116, elevation_m: 2000 })
    const day = result.days[0]
    expect(day).toBeDefined()
    if (!day) return

    // elevationDelta = 2000 - 500 = 1500m → correction = 1500 * 0.0065 = 9.75°C reduction
    expect(day.temp_c_max).toBeCloseTo(23 - 9.75, 2)
    expect(day.temp_c_min).toBeCloseTo(21 - 9.75, 2)
  })

  it('skips lapse-rate correction when location elevation_m is null', async () => {
    const mockHourly = buildSyntheticHourly(3, '2025-06-01')
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        latitude: 34.0,
        longitude: -116.0,
        elevation: 500,
        hourly: mockHourly,
      }),
    } as Response)

    const result = await fetchEnsemble({ lat: 34, lon: -116, elevation_m: null })
    const day = result.days[0]
    expect(day).toBeDefined()
    if (!day) return

    // Members 1,2,3 with temps 21,22,23 → min=21, max=23, no correction
    expect(day.temp_c_max).toBe(23)
    expect(day.temp_c_min).toBe(21)
  })

  it('lapse-rate is applied to temp only — precip, wind, dewpoint, shortwave unchanged', async () => {
    const mockHourly = buildSyntheticHourly(3, '2025-06-01')
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        latitude: 34.0,
        longitude: -116.0,
        elevation: 500,
        hourly: mockHourly,
      }),
    } as Response)

    const corrected = await fetchEnsemble({ lat: 34, lon: -116, elevation_m: 2000 })

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        latitude: 34.0,
        longitude: -116.0,
        elevation: 500,
        hourly: mockHourly,
      }),
    } as Response)
    const uncorrected = await fetchEnsemble({ lat: 34, lon: -116, elevation_m: 500 })

    const a = corrected.days[0]
    const b = uncorrected.days[0]
    expect(a).toBeDefined()
    expect(b).toBeDefined()
    if (!a || !b) return

    expect(a.precip_mm_p50).toBe(b.precip_mm_p50)
    expect(a.wind_kmh_max).toBe(b.wind_kmh_max)
    expect(a.dewpoint_c).toBe(b.dewpoint_c)
    expect(a.shortwave_wm2).toBe(b.shortwave_wm2)
    expect(a.humidity_pct).toBe(b.humidity_pct)
  })

  it('throws after exhausting retries on persistent 5xx', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    } as Response)

    const settled = fetchEnsemble(ZERO_LOC).catch((e: unknown) => e)
    await vi.runAllTimersAsync()
    const result = await settled

    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toBe('HTTP 503')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})

function buildNbmDaily(opts: {
  withQuantiles: boolean
  date?: string
  elevation?: number
}): { latitude: number; longitude: number; elevation?: number; daily: Record<string, unknown> } {
  const date = opts.date ?? '2025-06-01'
  const daily: Record<string, unknown> = {
    time: [date],
    precipitation_sum: [3.5],
    temperature_2m_max: [25],
    temperature_2m_min: [10],
    wind_speed_10m_max: [18],
    relative_humidity_2m_mean: [55],
    dewpoint_2m_mean: [8],
    shortwave_radiation_sum: [250],
  }
  if (opts.withQuantiles) {
    daily['precipitation_p10'] = [1.0]
    daily['precipitation_p50'] = [3.5]
    daily['precipitation_p90'] = [7.2]
  }
  const out: { latitude: number; longitude: number; elevation?: number; daily: Record<string, unknown> } = {
    latitude: 34.0,
    longitude: -116.0,
    daily,
  }
  if (opts.elevation !== undefined) out.elevation = opts.elevation
  return out
}

describe('fetchNBM', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('parses NBM daily response when p10 and p90 are present', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => buildNbmDaily({ withQuantiles: true, elevation: 500 }),
    } as Response)

    const result = await fetchNBM({ lat: 34, lon: -116, elevation_m: 500 })
    expect(result).not.toBeNull()
    if (!result) return

    expect(result.model_sources).toEqual(['nbm'])
    expect(result.days).toHaveLength(1)
    const day = result.days[0]
    expect(day).toBeDefined()
    if (!day) return
    expect(day.precip_mm_p10).toBe(1.0)
    expect(day.precip_mm_p50).toBe(3.5)
    expect(day.precip_mm_p90).toBe(7.2)
    expect(day.dewpoint_c).toBe(8)
    expect(day.shortwave_wm2).toBe(250)
  })

  it('returns null when precipitation_p10 is absent', async () => {
    const payload = buildNbmDaily({ withQuantiles: false, elevation: 500 })
    // Add only p90, omit p10 → should still return null
    ;(payload.daily as Record<string, unknown>)['precipitation_p90'] = [7.2]

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => payload,
    } as Response)

    const result = await fetchNBM({ lat: 34, lon: -116, elevation_m: null })
    expect(result).toBeNull()
  })

  it('returns null when precipitation_p90 is absent', async () => {
    const payload = buildNbmDaily({ withQuantiles: false, elevation: 500 })
    ;(payload.daily as Record<string, unknown>)['precipitation_p10'] = [1.0]

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => payload,
    } as Response)

    const result = await fetchNBM({ lat: 34, lon: -116, elevation_m: null })
    expect(result).toBeNull()
  })

  it('applies lapse-rate correction to temp_c_max/min', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => buildNbmDaily({ withQuantiles: true, elevation: 500 }),
    } as Response)

    const result = await fetchNBM({ lat: 34, lon: -116, elevation_m: 2000 })
    expect(result).not.toBeNull()
    if (!result) return
    const day = result.days[0]
    expect(day).toBeDefined()
    if (!day) return

    // elevationDelta = 2000 - 500 = 1500 → correction = 9.75°C reduction
    expect(day.temp_c_max).toBeCloseTo(25 - 9.75, 2)
    expect(day.temp_c_min).toBeCloseTo(10 - 9.75, 2)
  })

  it('skips lapse-rate when location elevation_m is null', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => buildNbmDaily({ withQuantiles: true, elevation: 500 }),
    } as Response)

    const result = await fetchNBM({ lat: 34, lon: -116, elevation_m: null })
    expect(result).not.toBeNull()
    if (!result) return
    const day = result.days[0]
    expect(day).toBeDefined()
    if (!day) return

    expect(day.temp_c_max).toBe(25)
    expect(day.temp_c_min).toBe(10)
  })

  it('falls back to defaults for string sentinels and NaN in daily arrays', async () => {
    const payload = buildNbmDaily({ withQuantiles: true })
    payload.daily['wind_speed_10m_max'] = ['M']
    payload.daily['relative_humidity_2m_mean'] = [NaN]
    payload.daily['temperature_2m_max'] = ['25']

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => payload,
    } as Response)

    const result = await fetchNBM({ lat: 34, lon: -116, elevation_m: null })
    expect(result).not.toBeNull()
    if (!result) return
    const day = result.days[0]
    expect(day).toBeDefined()
    if (!day) return

    expect(day.wind_kmh_max).toBe(0) // 'M' → null → ?? 0 default
    expect(day.humidity_pct).toBe(50) // NaN → null → ?? 50 default
    expect(day.temp_c_max).toBe(0) // numeric string is not a number → default, never the string
    for (const v of Object.values(day)) {
      if (typeof v === 'number') expect(isNaN(v)).toBe(false)
    }
  })

  it('throws after exhausting retries on persistent 5xx (caller must catch and fall back)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    } as Response)

    const settled = fetchNBM({ lat: 34, lon: -116, elevation_m: null }).catch(
      (e: unknown) => e,
    )
    await vi.runAllTimersAsync()
    const result = await settled

    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toBe('HTTP 503')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})
