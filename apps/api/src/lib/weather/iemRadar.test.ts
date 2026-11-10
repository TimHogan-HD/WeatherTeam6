import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchLatestRadar, fetchRadarLayers, parseForecast, parsePeriod, parseScans } from './iemRadar.js'

const answer = (status: number, body: unknown): Response =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response

describe('fetchLatestRadar', () => {
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

  it("returns the composite's valid time as an ISO instant", async () => {
    fetchMock.mockResolvedValueOnce(
      answer(200, { meta: { product: 'N0Q', site: 'USCOMP', valid: '2026-10-26T19:25:00Z', radar_quorum: '143/147' } }),
    )
    await expect(fetchLatestRadar()).resolves.toEqual({ valid_at: '2026-10-26T19:25:00.000Z' })
  })

  it.each([
    ['no meta', {}],
    ['a missing valid time', { meta: { product: 'N0Q' } }],
    ['an unreadable valid time', { meta: { valid: 'soon' } }],
    ['a numeric valid time', { meta: { valid: 1_761_506_700 } }],
  ])('is null for %s, never a made-up time', async (_name, body) => {
    fetchMock.mockResolvedValueOnce(answer(200, body))
    await expect(fetchLatestRadar()).resolves.toBeNull()
  })

  it('is null on a 4xx without retrying', async () => {
    fetchMock.mockResolvedValueOnce(answer(404, {}))
    await expect(fetchLatestRadar()).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('is null once every retry has failed', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const result = fetchLatestRadar()
    await vi.runAllTimersAsync()
    await expect(result).resolves.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})

const at = (iso: string): number => Date.parse(iso)

describe('parseScans', () => {
  const latest = at('2026-11-10T15:50:00Z')

  it('lists the last hour of scans oldest first, ending on the newest frame', () => {
    const scans = ['14:50', '14:55', '15:00', '15:45', '15:50'].map((t) => ({ ts: `2026-11-10T${t}Z` }))
    expect(parseScans({ scans }, latest)).toEqual([
      '2026-11-10T14:55:00.000Z',
      '2026-11-10T15:00:00.000Z',
      '2026-11-10T15:45:00.000Z',
      '2026-11-10T15:50:00.000Z',
    ])
  })

  it('leaves out a scan IEM did not list rather than inventing its time', () => {
    const scans = [{ ts: '2026-11-10T15:40Z' }, { ts: '2026-11-10T15:50Z' }]
    expect(parseScans({ scans }, latest)).toEqual(['2026-11-10T15:40:00.000Z', '2026-11-10T15:50:00.000Z'])
  })

  it('never lists a scan newer than the newest frame, which may not be drawn yet', () => {
    const scans = [{ ts: '2026-11-10T15:45Z' }, { ts: '2026-11-10T15:55Z' }]
    expect(parseScans({ scans }, latest)).toEqual(['2026-11-10T15:45:00.000Z', '2026-11-10T15:50:00.000Z'])
  })

  it.each([
    ['a failed listing', null],
    ['no scans', {}],
    ['unreadable scans', { scans: [{ ts: 'soon' }, null, 7] }],
  ])('is the newest frame alone for %s', (_name, body) => {
    expect(parseScans(body, latest)).toEqual(['2026-11-10T15:50:00.000Z'])
  })
})

describe('parsePeriod', () => {
  it('reads the span a rain total covers', () => {
    expect(parsePeriod({ meta: { start_valid: '2026-11-09T15:00:00Z', end_valid: '2026-11-10T15:00:00Z', units: 'mm' } })).toEqual({
      start_at: '2026-11-09T15:00:00.000Z',
      end_at: '2026-11-10T15:00:00.000Z',
    })
  })

  it.each([
    ['no answer', null],
    ['no meta', {}],
    ['a missing end', { meta: { start_valid: '2026-11-09T15:00:00Z' } }],
    ['an end before the start', { meta: { start_valid: '2026-11-10T15:00:00Z', end_valid: '2026-11-09T15:00:00Z' } }],
  ])('is null for %s', (_name, body) => {
    expect(parsePeriod(body)).toBeNull()
  })
})

describe('parseForecast', () => {
  const run = { model_init_utc: '2026-11-10T14:00:00Z', forecast_minute: 1080.0 }

  it('lists half-hourly frames from after the newest radar frame to six hours past it', () => {
    const forecast = parseForecast(run, at('2026-11-10T15:50:00Z'))
    expect(forecast?.run_at).toBe('2026-11-10T14:00:00.000Z')
    expect(forecast?.frames[0]).toBe('2026-11-10T16:00:00.000Z')
    expect(forecast?.frames.at(-1)).toBe('2026-11-10T21:30:00.000Z')
    expect(forecast?.frames).toHaveLength(12)
  })

  it('starts on the next half hour when the radar frame sits on one', () => {
    expect(parseForecast(run, at('2026-11-10T16:00:00Z'))?.frames[0]).toBe('2026-11-10T16:30:00.000Z')
  })

  it("stops at the run's last frame", () => {
    const forecast = parseForecast(run, at('2026-11-11T05:10:00Z'))
    expect(forecast?.frames.at(-1)).toBe('2026-11-11T08:00:00.000Z')
  })

  it('is null when the run ended before the radar frame', () => {
    expect(parseForecast(run, at('2026-11-11T09:00:00Z'))).toBeNull()
  })

  it.each([
    ['no answer', null],
    ['no run time', { forecast_minute: 1080 }],
    ['an unreadable run time', { model_init_utc: 'soon' }],
  ])('is null for %s', (_name, body) => {
    expect(parseForecast(body, at('2026-11-10T15:50:00Z'))).toBeNull()
  })
})

describe('fetchRadarLayers', () => {
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

  const bodies: Record<string, unknown> = {
    'USCOMP/n0q_0.json': { meta: { valid: '2026-11-10T15:50:00Z' } },
    'radar.py': { scans: [{ ts: '2026-11-10T15:45Z' }, { ts: '2026-11-10T15:50Z' }] },
    'mrms/p24h.json': { meta: { start_valid: '2026-11-09T15:00:00Z', end_valid: '2026-11-10T15:00:00Z' } },
    'mrms/p72h.json': { meta: { start_valid: '2026-11-07T15:00:00Z', end_valid: '2026-11-10T15:00:00Z' } },
    'hrrr/refd_1080.json': { model_init_utc: '2026-11-10T14:00:00Z' },
  }
  const serve = (failing: string | null) => (input: Parameters<typeof fetch>[0]) => {
    const url = String(input)
    const key = Object.keys(bodies).find((k) => url.includes(k))
    if (key === undefined || key === failing) return Promise.resolve(answer(404, {}))
    return Promise.resolve(answer(200, bodies[key]))
  }

  it('reads every layer', async () => {
    fetchMock.mockImplementation(serve(null))
    const layers = await fetchRadarLayers(at('2026-11-10T15:52:00Z'))
    expect(layers.past).toEqual(['2026-11-10T15:45:00.000Z', '2026-11-10T15:50:00.000Z'])
    expect(layers.rain_24h?.end_at).toBe('2026-11-10T15:00:00.000Z')
    expect(layers.rain_72h?.start_at).toBe('2026-11-07T15:00:00.000Z')
    expect(layers.forecast?.frames[0]).toBe('2026-11-10T16:00:00.000Z')
    const listUrl = fetchMock.mock.calls.map(([u]) => String(u)).find((u) => u.includes('radar.py'))
    expect(listUrl).toContain('start=2026-11-10T14:55Z')
  })

  it.each([
    ['the 24 hour total', 'mrms/p24h.json', 'rain_24h'],
    ['the 72 hour total', 'mrms/p72h.json', 'rain_72h'],
    ['the forecast', 'hrrr/refd_1080.json', 'forecast'],
    ['the newest frame', 'USCOMP/n0q_0.json', 'past'],
  ] as const)('blanks only %s when it fails', async (_name, failing, field) => {
    fetchMock.mockImplementation(serve(failing))
    const layers = await fetchRadarLayers(at('2026-11-10T15:52:00Z'))
    expect(layers[field]).toBeNull()
    for (const other of (['past', 'rain_24h', 'rain_72h', 'forecast'] as const).filter((f) => f !== field)) {
      expect(layers[other]).not.toBeNull()
    }
  })
})
