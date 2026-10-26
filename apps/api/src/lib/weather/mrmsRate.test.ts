import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./mrmsGrib.js', () => ({ readMrmsPoints: vi.fn() }))

const { readMrmsPoints } = await import('./mrmsGrib.js')
const { fetchRainRates, clearRainRateCache, validTimeOfKey } = await import('./mrmsRate.js')

const read = vi.mocked(readMrmsPoints)
const NOW = new Date('2026-10-26T21:20:00Z')
const key = (hhmmss: string, day = '20261026') =>
  `CONUS/PrecipRate_00.00/${day}/MRMS_PrecipRate_00.00_${day}-${hhmmss}.grib2.gz`
const listing = (keys: string[]) =>
  `<?xml version="1.0"?><ListBucketResult>${keys.map((k) => `<Contents><Key>${k}</Key></Contents>`).join('')}</ListBucketResult>`
const answer = (status: number, body = ''): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    arrayBuffer: async () => new ArrayBuffer(8),
  }) as Response
const POINTS = [{ lat: 44.57, lon: -92.53 }, { lat: 45.02, lon: -92.68 }, { lat: 60, lon: -150 }]

describe('fetchRainRates', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    vi.useFakeTimers()
    clearRainRateCache()
    read.mockReset()
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('reads the newest frame in the listing, and a negative as no coverage', async () => {
    fetchMock
      .mockResolvedValueOnce(answer(200, listing([key('211400'), key('211800'), key('211600')])))
      .mockResolvedValueOnce(answer(200))
    read.mockReturnValueOnce([0.5, 0, -3])
    await expect(fetchRainRates(POINTS, NOW)).resolves.toEqual({
      validAt: new Date('2026-10-26T21:18:00Z'),
      ratesMmH: [0.5, 0, null],
    })
    expect(String(fetchMock.mock.calls[1]![0])).toContain(key('211800'))
  })

  it('lists from 20 minutes back, in the day that time falls on', async () => {
    fetchMock.mockResolvedValueOnce(answer(200, listing([])))
    await fetchRainRates(POINTS, new Date('2026-10-27T00:05:00Z'))
    const url = new URL(String(fetchMock.mock.calls[0]![0]))
    expect(url.searchParams.get('prefix')).toBe('CONUS/PrecipRate_00.00/20261026/')
    expect(url.searchParams.get('start-after')).toBe(key('234500'))
  })

  it('is null when the newest frame is more than 15 minutes old — no radar, not "no rain"', async () => {
    fetchMock.mockResolvedValueOnce(answer(200, listing([key('210400')]))).mockResolvedValueOnce(answer(200))
    read.mockReturnValueOnce([0, 0, 0])
    await expect(fetchRainRates(POINTS, NOW)).resolves.toBeNull()
  })

  it('is null when the listing holds no frame', async () => {
    fetchMock.mockResolvedValueOnce(answer(200, listing([])))
    await expect(fetchRainRates(POINTS, NOW)).resolves.toBeNull()
  })

  it('is null on a listing 4xx', async () => {
    fetchMock.mockResolvedValueOnce(answer(403))
    await expect(fetchRainRates(POINTS, NOW)).resolves.toBeNull()
  })

  it('is null when the frame cannot be fetched', async () => {
    fetchMock.mockResolvedValueOnce(answer(200, listing([key('211800')]))).mockResolvedValueOnce(answer(404))
    await expect(fetchRainRates(POINTS, NOW)).resolves.toBeNull()
  })

  it('is null once every retry has failed', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const result = fetchRainRates(POINTS, NOW)
    await vi.runAllTimersAsync()
    await expect(result).resolves.toBeNull()
  })

  it('is null when the frame does not decode, and asks again next time', async () => {
    fetchMock
      .mockResolvedValueOnce(answer(200, listing([key('211800')])))
      .mockResolvedValueOnce(answer(200))
      .mockResolvedValueOnce(answer(200, listing([key('211800')])))
      .mockResolvedValueOnce(answer(200))
    read.mockImplementationOnce(() => {
      throw new Error('not GRIB2')
    })
    read.mockReturnValueOnce([1, 1, 1])
    await expect(fetchRainRates(POINTS, NOW)).resolves.toBeNull()
    await expect(fetchRainRates(POINTS, NOW)).resolves.not.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('reuses a frame for two minutes, then lists again', async () => {
    fetchMock
      .mockResolvedValueOnce(answer(200, listing([key('211800')])))
      .mockResolvedValueOnce(answer(200))
      .mockResolvedValueOnce(answer(200, listing([key('212000')])))
      .mockResolvedValueOnce(answer(200))
    read.mockReturnValue([0, 0, 0])
    await fetchRainRates(POINTS, NOW)
    await fetchRainRates(POINTS, new Date(NOW.getTime() + 60_000))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const later = await fetchRainRates(POINTS, new Date(NOW.getTime() + 150_000))
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(later?.validAt).toEqual(new Date('2026-10-26T21:20:00Z'))
  })

  it('does not fetch the same frame twice when the listing has nothing newer', async () => {
    fetchMock
      .mockResolvedValueOnce(answer(200, listing([key('211800')])))
      .mockResolvedValueOnce(answer(200))
      .mockResolvedValueOnce(answer(200, listing([key('211800')])))
    read.mockReturnValue([0, 0, 0])
    await fetchRainRates(POINTS, NOW)
    await expect(fetchRainRates(POINTS, new Date(NOW.getTime() + 150_000))).resolves.not.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

describe('validTimeOfKey', () => {
  it('reads the valid time from the file name', () => {
    expect(validTimeOfKey(key('211800'))).toEqual(new Date('2026-10-26T21:18:00Z'))
  })
  it('is null for a name without one', () => {
    expect(validTimeOfKey('CONUS/PrecipRate_00.00/20261026/README.txt')).toBeNull()
  })
})
