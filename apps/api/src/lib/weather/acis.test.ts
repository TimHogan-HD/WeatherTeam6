import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseAcisResponse, fetchAcisRainfall } from './acis.js'

describe('parseAcisResponse', () => {
  it('converts inches to mm correctly', () => {
    const result = parseAcisResponse([
      ['2025-05-18', '1.00'],
      ['2025-05-19', '0.50'],
    ])
    expect(result).toHaveLength(2)
    expect(result[0]?.precip_mm).toBeCloseTo(25.4, 1)
    expect(result[1]?.precip_mm).toBeCloseTo(12.7, 1)
  })

  it('treats trace ("T") as 0 mm', () => {
    const result = parseAcisResponse([['2025-05-20', 'T']])
    expect(result).toHaveLength(1)
    expect(result[0]?.precip_mm).toBe(0)
  })

  it('skips missing ("M") entries', () => {
    const result = parseAcisResponse([
      ['2025-05-18', '0.10'],
      ['2025-05-19', 'M'],
      ['2025-05-20', '0.20'],
    ])
    expect(result).toHaveLength(2)
    expect(result.map((r) => r.date)).toEqual(['2025-05-18', '2025-05-20'])
  })

  it('skips entries with no date', () => {
    const result = parseAcisResponse([['', '0.50']])
    expect(result).toHaveLength(0)
  })

  it('skips non-numeric values that are not T or M', () => {
    const result = parseAcisResponse([['2025-05-18', 'N/A']])
    expect(result).toHaveLength(0)
  })

  it('preserves date strings as-is', () => {
    const result = parseAcisResponse([['2025-06-01', '0.00']])
    expect(result[0]?.date).toBe('2025-06-01')
  })

  it('handles an empty data array', () => {
    expect(parseAcisResponse([])).toEqual([])
  })
})

describe('fetchAcisRainfall', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('POSTs to the ACIS endpoint with correct body', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [['2025-05-18', '0.10']] }),
    } as Response)

    await fetchAcisRainfall('KPSP', '2025-05-18', '2025-05-24')

    expect(fetchMock).toHaveBeenCalledOnce()
    const call = fetchMock.mock.calls[0]!
    expect(call[0]).toBe('https://data.rcc-acis.org/StnData')
    expect(call[1]?.method).toBe('POST')
    const body = JSON.parse(call[1]?.body as string)
    expect(body.sid).toBe('KPSP')
    expect(body.sdate).toBe('2025-05-18')
    expect(body.edate).toBe('2025-05-24')
  })

  it('returns parsed entries on success', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [['2025-05-18', '0.50'], ['2025-05-19', 'T']] }),
    } as Response)

    const result = await fetchAcisRainfall('KPSP', '2025-05-18', '2025-05-19')
    expect(result).toHaveLength(2)
    expect(result[0]?.precip_mm).toBeCloseTo(12.7, 1)
    expect(result[1]?.precip_mm).toBe(0)
  })

  it('returns empty array for non-retryable 4xx error', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response)

    const result = await fetchAcisRainfall('KBAD', '2025-05-18', '2025-05-24')
    expect(result).toEqual([])
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('retries on 5xx and throws after 4 attempts', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
    } as Response)

    const settled = fetchAcisRainfall('KPSP', '2025-05-18', '2025-05-24').catch((e: unknown) => e)
    await vi.runAllTimersAsync()
    const result = await settled

    expect(result).toBeInstanceOf(Error)
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('returns empty array when response has no data key', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response)

    const result = await fetchAcisRainfall('KPSP', '2025-05-18', '2025-05-19')
    expect(result).toEqual([])
  })
})
