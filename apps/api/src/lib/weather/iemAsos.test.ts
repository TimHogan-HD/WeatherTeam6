import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { parseObservation, fetchCurrentObs } from './iemAsos.js'

const FRESH_UTC = new Date('2025-05-25T15:00:00Z')
const freshDatum = {
  utc_valid: '2025-05-25T14:30:00Z', // 30 min old — within 90 min window
  tmpf: 77,    // 25°C
  dwpf: 50,    // ~10°C
  sknt: 10,    // 18.52 km/h
  p01i: 0,
  mslp: 1013.2,
  relh: 40,
}

describe('parseObservation', () => {
  it('converts temperature F to C correctly', () => {
    const obs = parseObservation(freshDatum, FRESH_UTC)
    expect(obs).not.toBeNull()
    expect(obs!.tempC).toBeCloseTo(25, 1)
  })

  it('converts wind knots to km/h correctly', () => {
    const obs = parseObservation(freshDatum, FRESH_UTC)
    expect(obs).not.toBeNull()
    expect(obs!.windKmh).toBeCloseTo(18.52, 1)
  })

  it('converts precip inches to mm correctly', () => {
    const datum = { ...freshDatum, p01i: 0.1 } // 0.1 in = 2.54 mm
    const obs = parseObservation(datum, FRESH_UTC)
    expect(obs).not.toBeNull()
    expect(obs!.precip1hMm).toBeCloseTo(2.54, 2)
  })

  it('returns null for a stale observation (>90 min old)', () => {
    const staleUtc = new Date('2025-05-25T16:35:00Z') // 125 min after 14:30
    const obs = parseObservation(freshDatum, staleUtc)
    expect(obs).toBeNull()
  })

  it('accepts an observation exactly at 90 min boundary', () => {
    // obs at 14:30, asOf at 16:00 = exactly 90 min
    const boundaryUtc = new Date('2025-05-25T16:00:00Z')
    const obs = parseObservation(freshDatum, boundaryUtc)
    expect(obs).not.toBeNull()
  })

  it('returns null when utc_valid is missing', () => {
    const obs = parseObservation({ tmpf: 70 }, FRESH_UTC)
    expect(obs).toBeNull()
  })

  it('returns null when utc_valid is unparseable', () => {
    const obs = parseObservation({ utc_valid: 'not-a-date' }, FRESH_UTC)
    expect(obs).toBeNull()
  })

  it('uses null for mslp when not provided', () => {
    const datum = { ...freshDatum, mslp: undefined }
    const obs = parseObservation(datum, FRESH_UTC)
    expect(obs).not.toBeNull()
    expect(obs!.pressureMb).toBeNull()
  })

  it('defaults humidity to 50 when relh is missing', () => {
    const datum = { ...freshDatum, relh: undefined }
    const obs = parseObservation(datum, FRESH_UTC)
    expect(obs).not.toBeNull()
    expect(obs!.humidityPct).toBe(50)
  })
})

describe('fetchCurrentObs', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(FRESH_UTC)
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('builds the correct IEM URL', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [freshDatum] }),
    } as Response)

    await fetchCurrentObs('KPSP', 'CA_ASOS')

    const url = fetchMock.mock.calls[0]?.[0] as string
    expect(url).toContain('station=KPSP')
    expect(url).toContain('network=CA_ASOS')
    expect(url).toContain('mesonet.agron.iastate.edu')
  })

  it('returns a CurrentObservation on fresh data', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [freshDatum] }),
    } as Response)

    const obs = await fetchCurrentObs('KPSP', 'CA_ASOS')
    expect(obs).not.toBeNull()
    expect(obs!.tempC).toBeCloseTo(25, 1)
  })

  it('returns null when fetch fails', async () => {
    fetchMock.mockRejectedValue(new Error('network error'))

    const settled = fetchCurrentObs('KBAD', 'XX_ASOS').catch(() => null)
    await vi.runAllTimersAsync()
    const obs = await settled
    expect(obs).toBeNull()
  })

  it('returns null on non-ok response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
    } as Response)

    const obs = await fetchCurrentObs('KBAD', 'XX_ASOS')
    expect(obs).toBeNull()
  })

  it('returns null when data array is empty', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    } as Response)

    const obs = await fetchCurrentObs('KPSP', 'CA_ASOS')
    expect(obs).toBeNull()
  })
})
