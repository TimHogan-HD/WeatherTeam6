import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchCurrentObs } from './iemAsos.js'

const FIXED_NOW = new Date('2025-06-01T12:00:00Z')

describe('fetchCurrentObs', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FIXED_NOW)
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('constructs URL with station and network', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response)

    await fetchCurrentObs('KMSN', 'WI_ASOS')

    const calledUrl = fetchMock.mock.calls[0]?.[0]
    expect(typeof calledUrl).toBe('string')
    if (typeof calledUrl !== 'string') return
    expect(calledUrl).toContain('station=KMSN')
    expect(calledUrl).toContain('network=WI_ASOS')
  })

  it('converts units and returns IemObservation for a fresh observation', async () => {
    // 30 min before FIXED_NOW = fresh
    const fresh = new Date(FIXED_NOW.getTime() - 30 * 60_000).toISOString()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        last_ob: {
          utc_valid: fresh,
          tmpf: 68, // 20°C
          dwpf: 50, // 10°C
          sknt: 10, // 18.52 km/h
          p01i: 0.1, // 2.54 mm
          relh: 65,
        },
      }),
    } as Response)

    const result = await fetchCurrentObs('KMSN', 'WI_ASOS')
    expect(result).not.toBeNull()
    if (!result) return

    expect(result.temp_c).toBeCloseTo(20, 5)
    expect(result.dewpoint_c).toBeCloseTo(10, 5)
    expect(result.wind_kmh).toBeCloseTo(18.52, 2)
    expect(result.precip_1h_mm).toBeCloseTo(2.54, 2)
    expect(result.humidity_pct).toBe(65)
    expect(result.utc_valid).toBe(fresh)
  })

  it('returns null when observation is older than 90 minutes', async () => {
    const stale = new Date(FIXED_NOW.getTime() - 91 * 60_000).toISOString()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        last_ob: { utc_valid: stale, tmpf: 70 },
      }),
    } as Response)

    const result = await fetchCurrentObs('KMSN', 'WI_ASOS')
    expect(result).toBeNull()
  })

  it('accepts observations exactly at the 90-minute boundary as fresh', async () => {
    // Exactly 90 min ago — equals the limit, should pass (not stale)
    const boundary = new Date(FIXED_NOW.getTime() - 90 * 60_000).toISOString()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        last_ob: { utc_valid: boundary, tmpf: 70 },
      }),
    } as Response)

    const result = await fetchCurrentObs('KMSN', 'WI_ASOS')
    expect(result).not.toBeNull()
  })

  it('returns null when last_ob is missing', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response)

    const result = await fetchCurrentObs('KMSN', 'WI_ASOS')
    expect(result).toBeNull()
  })

  it('returns null on persistent 5xx after retries rather than throwing', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response)

    const settled = fetchCurrentObs('KMSN', 'WI_ASOS')
    await vi.runAllTimersAsync()
    const result = await settled

    expect(result).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('returns null immediately on non-retryable 4xx', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({}),
    } as Response)

    const result = await fetchCurrentObs('KMSN', 'WI_ASOS')
    expect(result).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('returns null on persistent fetch network failures rather than throwing', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))

    const settled = fetchCurrentObs('KMSN', 'WI_ASOS')
    await vi.runAllTimersAsync()
    const result = await settled

    expect(result).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('preserves null fields when the raw observation has them', async () => {
    const fresh = new Date(FIXED_NOW.getTime() - 30 * 60_000).toISOString()
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        last_ob: {
          utc_valid: fresh,
          tmpf: null,
          dwpf: null,
          sknt: null,
          p01i: null,
          relh: null,
        },
      }),
    } as Response)

    const result = await fetchCurrentObs('KMSN', 'WI_ASOS')
    expect(result).not.toBeNull()
    if (!result) return
    expect(result.temp_c).toBeNull()
    expect(result.dewpoint_c).toBeNull()
    expect(result.wind_kmh).toBeNull()
    expect(result.precip_1h_mm).toBeNull()
    expect(result.humidity_pct).toBeNull()
  })
})
