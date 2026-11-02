import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('./mrmsGrib.js', () => ({ readMrmsPoints: vi.fn() }))

const { readMrmsPoints } = await import('./mrmsGrib.js')
const { fetchQpeHour, inMrmsGrid, publishedQpeHours, qpeHourOfKey, qpeKeyFor } = await import('./mrmsQpe.js')

const read = vi.mocked(readMrmsPoints)
const H = 3_600_000
const listing = (hours: number[]) =>
  `<?xml version="1.0"?><ListBucketResult>${hours
    .map((t) => `<Contents><Key>${qpeKeyFor(new Date(t))}</Key></Contents>`)
    .join('')}</ListBucketResult>`
const answer = (status: number, body = ''): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    arrayBuffer: async () => new ArrayBuffer(8),
  }) as Response

describe('the MRMS grid', () => {
  it('holds US crags and nothing past its edges', () => {
    expect(inMrmsGrid({ lat: 44.5625, lon: -92.5338 })).toBe(true) // Red Wing
    expect(inMrmsGrid({ lat: 36.13, lon: -115.43 })).toBe(true) // Red Rock
    expect(inMrmsGrid({ lat: 50.5, lon: -115.5 })).toBe(true) // inside the box, in Canada: radar may read null
    expect(inMrmsGrid({ lat: 55.01, lon: -100 })).toBe(false)
    expect(inMrmsGrid({ lat: 19.99, lon: -100 })).toBe(false)
    expect(inMrmsGrid({ lat: 40, lon: -130.01 })).toBe(false)
    expect(inMrmsGrid({ lat: 36.95, lon: 26.98 })).toBe(false) // Kalymnos
  })
})

describe('qpe keys', () => {
  it('stamps a file by the hour it ends and reads the hour back', () => {
    const t = Date.UTC(2026, 10, 2, 7)
    expect(qpeKeyFor(new Date(t))).toBe(
      'CONUS/MultiSensor_QPE_01H_Pass2_00.00/20261102/MRMS_MultiSensor_QPE_01H_Pass2_00.00_20261102-070000.grib2.gz',
    )
    expect(qpeHourOfKey(qpeKeyFor(new Date(t)))).toBe(t)
    expect(qpeHourOfKey('CONUS/MultiSensor_QPE_01H_Pass2_00.00/20261102/README')).toBeNull()
  })
})

describe('publishedQpeHours and fetchQpeHour', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    read.mockReset()
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('lists every UTC day the span crosses and keeps only hours inside it', async () => {
    const to = Date.UTC(2026, 10, 2, 1)
    const from = to - 3 * H // 22:00 the day before
    fetchMock.mockImplementation(async (input) => {
      const prefix = new URL(String(input)).searchParams.get('prefix') ?? ''
      if (prefix.endsWith('20261101/')) return answer(200, listing([from - H, from, from + H]))
      return answer(200, listing([to - H, to, to + H]))
    })
    const got = await publishedQpeHours(from, to)
    expect([...got!].sort()).toEqual([from, from + H, to - H, to])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('answers null when any day’s listing failed, never "nothing published"', async () => {
    const to = Date.UTC(2026, 10, 2, 1)
    fetchMock.mockImplementation(async (input) => {
      const prefix = new URL(String(input)).searchParams.get('prefix') ?? ''
      return prefix.endsWith('20261101/') ? answer(403) : answer(200, listing([to]))
    })
    await expect(publishedQpeHours(to - 3 * H, to)).resolves.toBeNull()
  })

  it('reads a negative as no value and a missing file as null, never zeros', async () => {
    fetchMock.mockResolvedValueOnce(answer(200))
    read.mockReturnValueOnce([1.234, 0, -3])
    const pts = [{ lat: 44, lon: -92 }, { lat: 45, lon: -93 }, { lat: 46, lon: -94 }]
    await expect(fetchQpeHour(new Date(Date.UTC(2026, 10, 2, 7)), pts)).resolves.toEqual([1.23, 0, null])
    fetchMock.mockResolvedValueOnce(answer(404))
    await expect(fetchQpeHour(new Date(Date.UTC(2026, 10, 2, 7)), pts)).resolves.toBeNull()
    fetchMock.mockResolvedValueOnce(answer(200))
    read.mockImplementationOnce(() => {
      throw new Error('section 7 is not PNG')
    })
    await expect(fetchQpeHour(new Date(Date.UTC(2026, 10, 2, 7)), pts)).resolves.toBeNull()
  })
})
