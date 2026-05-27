import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchPrecipHistory } from './acis.js'

describe('fetchPrecipHistory', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('posts a JSON body with sid, sdate, edate, and pcpn elem', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    } as Response)

    await fetchPrecipHistory('KMSN', '2025-05-25', '2025-05-31')

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('https://data.rcc-acis.org/StnData')
    expect(init?.method).toBe('POST')
    const body = JSON.parse(String(init?.body))
    expect(body).toEqual({
      sid: 'KMSN',
      sdate: '2025-05-25',
      edate: '2025-05-31',
      elems: [{ name: 'pcpn', units: 'mm' }],
    })
  })

  it('parses numeric daily values into AcisDailyPrecip rows', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          ['2025-05-29', '12.7'],
          ['2025-05-30', '0.0'],
          ['2025-05-31', 3.1],
        ],
      }),
    } as Response)

    const result = await fetchPrecipHistory('KMSN', '2025-05-29', '2025-05-31')
    expect(result).toEqual([
      { date: '2025-05-29', precip_mm: 12.7 },
      { date: '2025-05-30', precip_mm: 0.0 },
      { date: '2025-05-31', precip_mm: 3.1 },
    ])
  })

  it('skips missing (M) and trace (T) values', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: [
          ['2025-05-29', 'M'],
          ['2025-05-30', 'T'],
          ['2025-05-31', '5.2'],
        ],
      }),
    } as Response)

    const result = await fetchPrecipHistory('KMSN', '2025-05-29', '2025-05-31')
    expect(result).toEqual([{ date: '2025-05-31', precip_mm: 5.2 }])
  })

  it('throws when the response contains an error field', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ error: 'invalid station' }),
    } as Response)

    await expect(fetchPrecipHistory('KBADSTATION', '2025-05-29', '2025-05-31')).rejects.toThrow(
      /invalid station/,
    )
  })

  it('throws after exhausting retries on persistent 5xx', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    } as Response)

    const settled = fetchPrecipHistory('KMSN', '2025-05-29', '2025-05-31').catch(
      (e: unknown) => e,
    )
    await vi.runAllTimersAsync()
    const result = await settled

    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toBe('HTTP 503')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('throws immediately on non-retryable 4xx', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'Bad Request',
    } as Response)

    await expect(fetchPrecipHistory('KMSN', '2025-05-29', '2025-05-31')).rejects.toThrow(
      /ACIS API returned 400/,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
