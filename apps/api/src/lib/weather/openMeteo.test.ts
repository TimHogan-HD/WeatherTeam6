import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  computePercentile,
  parseEnsemble,
  fetchEnsembleForecast,
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
  }

  return hourly
}

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
  })
})

describe('fetchEnsembleForecast', () => {
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

    await fetchEnsembleForecast(34.0, -116.0)

    const calledUrl = fetchMock.mock.calls[0]?.[0]
    expect(typeof calledUrl).toBe('string')
    if (typeof calledUrl !== 'string') return
    expect(calledUrl).toContain('latitude=34')
    expect(calledUrl).toContain('longitude=-116')
    expect(calledUrl).toContain('models=')
    expect(calledUrl).toContain('hourly=')
  })

  it('returns parsed OpenMeteoResult on success', async () => {
    const mockHourly = buildSyntheticHourly(3, '2025-06-01')
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ latitude: 34.0, longitude: -116.0, hourly: mockHourly }),
    } as Response)

    const result = await fetchEnsembleForecast(34.0, -116.0)

    expect(result.days).toHaveLength(1)
    expect(result.model_sources).toContain('gfs_seamless')
  })

  it('throws after exhausting retries on persistent 5xx', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    } as Response)

    // Catch the rejection eagerly so it doesn't surface as unhandled while
    // we advance through the 1s + 2s + 4s retry delays with fake timers.
    const settled = fetchEnsembleForecast(34.0, -116.0).catch((e: unknown) => e)
    await vi.runAllTimersAsync()
    const result = await settled

    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toBe('HTTP 503')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})
