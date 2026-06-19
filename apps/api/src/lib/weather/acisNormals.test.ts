import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchGriddedNormals } from './acisNormals.js'

// Builds a minimal ACIS GridData response: 2 years × 12 months = 24 rows.
// Each month gets fixed pcpn/maxt/mint values for easy assertion.
function buildAcisRows(pcpnPerMonth: number[], maxtPerMonth: number[], mintPerMonth: number[]) {
  const rows: [string, number, number, number][] = []
  for (const year of [2000, 2001]) {
    for (let m = 1; m <= 12; m++) {
      const date = `${year}-${String(m).padStart(2, '0')}`
      rows.push([date, pcpnPerMonth[m - 1]!, maxtPerMonth[m - 1]!, mintPerMonth[m - 1]!])
    }
  }
  return rows
}

// All months have the same value for simplicity; mean = the value itself.
const FLAT_PCPN = Array(12).fill(1.0)   // 1.0 in → 25.4 mm
const FLAT_MAXT = Array(12).fill(86.0)  // 86 °F → 30 °C
const FLAT_MINT = Array(12).fill(32.0)  // 32 °F → 0 °C

describe('fetchGriddedNormals', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('posts correct body — loc is lon,lat; grid=1; sdate/edate; three elems', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: buildAcisRows(FLAT_PCPN, FLAT_MAXT, FLAT_MINT) }),
    } as Response)

    await fetchGriddedNormals(36.03, -93.26)

    const [url, init] = fetchMock.mock.calls[0] ?? []
    expect(url).toBe('https://data.rcc-acis.org/GridData')
    expect(init?.method).toBe('POST')
    const body = JSON.parse(String(init?.body))
    expect(body.loc).toBe('-93.26,36.03')   // lon,lat order
    expect(body.grid).toBe(1)
    expect(body.sdate).toBe('1991-01')
    expect(body.edate).toBe('2020-12')
    expect(body.elems).toHaveLength(3)
    expect(body.elems[0].name).toBe('pcpn')
    expect(body.elems[1].name).toBe('maxt')
    expect(body.elems[2].name).toBe('mint')
  })

  it('returns exactly 12 monthly normals', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: buildAcisRows(FLAT_PCPN, FLAT_MAXT, FLAT_MINT) }),
    } as Response)

    const result = await fetchGriddedNormals(36.03, -93.26)
    expect(result).toHaveLength(12)
    expect(result.map((r) => r.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  })

  it('converts inches→mm and °F→°C correctly', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: buildAcisRows(FLAT_PCPN, FLAT_MAXT, FLAT_MINT) }),
    } as Response)

    const result = await fetchGriddedNormals(36.03, -93.26)
    const jan = result[0]!
    expect(jan.precip_normal_mm).toBeCloseTo(25.4, 5)   // 1.0 in
    expect(jan.temp_max_normal_c).toBeCloseTo(30.0, 5)  // 86 °F
    expect(jan.temp_min_normal_c).toBeCloseTo(0.0, 5)   // 32 °F
    expect(jan.source).toBe('acis_grid_91_20')
  })

  it('averages multiple years per month correctly', async () => {
    // Year 1: Jan pcpn=2.0, Year 2: Jan pcpn=4.0 → mean=3.0 in → 76.2 mm
    const year1rows: [string, number, number, number][] = Array.from({ length: 12 }, (_, i) => [
      `2000-${String(i + 1).padStart(2, '0')}`,
      i === 0 ? 2.0 : 1.0,
      86.0,
      32.0,
    ])
    const year2rows: [string, number, number, number][] = Array.from({ length: 12 }, (_, i) => [
      `2001-${String(i + 1).padStart(2, '0')}`,
      i === 0 ? 4.0 : 1.0,
      86.0,
      32.0,
    ])

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [...year1rows, ...year2rows] }),
    } as Response)

    const result = await fetchGriddedNormals(36.03, -93.26)
    expect(result[0]!.precip_normal_mm).toBeCloseTo(3.0 * 25.4, 5)
  })

  it('skips sentinel -999 values when computing monthly means', async () => {
    // Month 1 has two years: year1=2.0 in, year2=-999 (missing) → mean should be 2.0, not 0.5
    const rows: [string, number, number, number][] = [
      ['2000-01', 2.0, 86.0, 32.0],
      ['2001-01', -999, 86.0, 32.0],
      // Fill the other 11 months for both years so computeMonthlyNormals doesn't throw
      ...Array.from({ length: 11 }, (_, i) => [`2000-${String(i + 2).padStart(2, '0')}`, 1.0, 86.0, 32.0] as [string, number, number, number]),
      ...Array.from({ length: 11 }, (_, i) => [`2001-${String(i + 2).padStart(2, '0')}`, 1.0, 86.0, 32.0] as [string, number, number, number]),
    ]

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: rows }),
    } as Response)

    const result = await fetchGriddedNormals(36.03, -93.26)
    expect(result[0]!.precip_normal_mm).toBeCloseTo(2.0 * 25.4, 5)
  })

  it('throws immediately on ACIS application error — does not retry', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ error: 'invalid grid' }),
    } as Response)

    await expect(fetchGriddedNormals(36.03, -93.26)).rejects.toThrow(/invalid grid/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws immediately on empty data array — does not retry', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    } as Response)

    await expect(fetchGriddedNormals(36.03, -93.26)).rejects.toThrow(/empty data array/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries on 429 and eventually throws after 4 attempts', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
    } as Response)

    const settled = fetchGriddedNormals(36.03, -93.26).catch((e: unknown) => e)
    await vi.runAllTimersAsync()
    const result = await settled

    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toBe('HTTP 429')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('retries on 500 and eventually throws after 4 attempts', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
    } as Response)

    const settled = fetchGriddedNormals(36.03, -93.26).catch((e: unknown) => e)
    await vi.runAllTimersAsync()
    const result = await settled

    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toBe('HTTP 500')
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('throws immediately on non-retryable 4xx', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
    } as Response)

    await expect(fetchGriddedNormals(36.03, -93.26)).rejects.toThrow(/ACIS GridData returned 400/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws when a month has no valid samples (all -999)', async () => {
    // Provide data for months 2-12 only — month 1 has only -999 values
    const rows: [string, number, number, number][] = [
      ['2000-01', -999, -999, -999],
      ['2001-01', -999, -999, -999],
      ...Array.from({ length: 11 }, (_, i) => [`2000-${String(i + 2).padStart(2, '0')}`, 1.0, 86.0, 32.0] as [string, number, number, number]),
      ...Array.from({ length: 11 }, (_, i) => [`2001-${String(i + 2).padStart(2, '0')}`, 1.0, 86.0, 32.0] as [string, number, number, number]),
    ]

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: rows }),
    } as Response)

    await expect(fetchGriddedNormals(36.03, -93.26)).rejects.toThrow(/no valid samples for month 1/)
  })
})
