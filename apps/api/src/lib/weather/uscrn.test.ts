import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchSoilPoints, localDatesBetween, noaaDays, parseHourlyRain, parseSoilRows, soilRainDays, type HourlyRain } from './uscrn.js'

const STATION = { wban: '54932', file: 'MN_Sandstone_6_W' }
const TZ = 'America/Chicago'
const LON = -92.99

// Real rows, 2026-11-12, with a sentinel and a cut first line added.
const HOURLY = [
  ' 0 20261112 1500 20261112 0900  2.622  -92.99   46.11     0.3', // a tail's cut first line
  '54932 20261112 1600 20261112 1000  2.622  -92.99   46.11     0.7     0.5     0.8     0.3     0.0     98 0    130 0',
  '54932 20261112 1700 20261112 1100  2.622  -92.99   46.11     0.9     0.8     1.4     0.6 -9999.0    143 0    359 0',
  '54932 20261112 1800 20261112 1200  2.622  -92.99   46.11     1.5     1.3     2.1     0.9     1.2    212 0    721 0',
  '99999 20261112 1900 20261112 1300  2.622  -92.99   46.11     2.7     1.8     2.7     1.1     4.0    349 0    699 0',
]

const SOIL = [
  '54932,2026111216,-92.99,46.11,0.234,-0.03,0.472,6.5,0.245,0.23,0.675,7,0.236,0.47,0.837,7.8,0.203,0.14,0.578,8.4,0.276,-1.05,0.183,9.4,0.24,0.09,0.566,0.239,-0.11,0.441',
  '54932,2026110418,-92.99,46.11,,,,,,,,,,,,,,,,,,,,,,,,,,',
  '54932,2026010112,-92.99,46.11,0.31,1.2,0.95,-1.8,0.3,1,0.9,-0.4,0.28,0.9,0.88,0.5,,,,,,,,,,,,,,',
]

describe('parseHourlyRain', () => {
  it("reads P_CALC by the hour's end, a sentinel as null, and only the station's own rows", () => {
    expect(parseHourlyRain(HOURLY, '54932')).toEqual([
      { endMs: Date.UTC(2026, 10, 12, 16), mm: 0 },
      { endMs: Date.UTC(2026, 10, 12, 17), mm: null },
      { endMs: Date.UTC(2026, 10, 12, 18), mm: 1.2 },
    ])
  })
})

describe('parseSoilRows', () => {
  it('reads 5 and 20 cm, oldest first, and a blank row as nulls, never 0', () => {
    const pts = parseSoilRows(SOIL, '54932')
    expect(pts.map((p) => p.at)).toEqual(['2026-01-01T12:00:00.000Z', '2026-11-04T18:00:00.000Z', '2026-11-12T16:00:00.000Z'])
    expect(pts[2]).toEqual({
      at: '2026-11-12T16:00:00.000Z',
      vwc_5: 0.234,
      pct_5: 0.472,
      temp_5_c: 6.5,
      vwc_20: 0.236,
      pct_20: 0.837,
      temp_20_c: 7.8,
    })
    expect(pts[1]).toMatchObject({ vwc_5: null, pct_5: null, temp_5_c: null, vwc_20: null, pct_20: null, temp_20_c: null })
    // A frozen hour keeps its temperature below zero: the client withholds on it.
    expect(pts[0]).toMatchObject({ temp_5_c: -1.8, temp_20_c: 0.5 })
  })
})

describe('noaaDays', () => {
  const hoursFor = (fromMs: number, toMs: number, mm: number, skip: number[] = []): HourlyRain[] => {
    const out: HourlyRain[] = []
    for (let end = fromMs + 3_600_000; end <= toMs; end += 3_600_000) if (!skip.includes(end)) out.push({ endMs: end, mm })
    return out
  }

  it("sums a local day by each hour's start: the hour ending at local midnight is the day before's", () => {
    // Chicago is UTC-6 in November: the 5th is 06:00Z on the 5th to 06:00Z on the 6th.
    const hours = [...hoursFor(Date.UTC(2026, 10, 4, 6), Date.UTC(2026, 10, 6, 6), 0), { endMs: Date.UTC(2026, 10, 6, 6), mm: 3 }]
    const days = noaaDays(hours, ['2026-11-05'], TZ, LON)
    expect(days.get('2026-11-05')).toEqual({ rain_mm: 3, hours_reported: 24, hours_expected: 24 })
  })

  it('withholds a day with a missing or null hour, never a drier total', () => {
    const hours = hoursFor(Date.UTC(2026, 10, 4, 6), Date.UTC(2026, 10, 6, 6), 1, [Date.UTC(2026, 10, 5, 12)])
    hours.push({ endMs: Date.UTC(2026, 10, 5, 12), mm: null })
    hours.sort((a, b) => a.endMs - b.endMs)
    expect(noaaDays(hours, ['2026-11-05'], TZ, LON).get('2026-11-05')).toEqual({
      rain_mm: null,
      hours_reported: 23,
      hours_expected: 24,
    })
    expect(noaaDays(hoursFor(0, 0, 0), ['2026-11-05'], TZ, LON).get('2026-11-05')).toMatchObject({ rain_mm: null, hours_reported: 0 })
  })

  it('expects 25 hours on the day the clocks go back', () => {
    // 2026-11-01 in Chicago runs 05:00Z to 06:00Z the next day.
    const hours = hoursFor(Date.UTC(2026, 10, 1, 5), Date.UTC(2026, 10, 2, 6), 0.1)
    expect(noaaDays(hours, ['2026-11-01'], TZ, LON).get('2026-11-01')).toEqual({ rain_mm: 2.5, hours_reported: 25, hours_expected: 25 })
  })
})

describe('soilRainDays', () => {
  it('lists every date asked, a day with no hours as null', () => {
    const dates = localDatesBetween(Date.UTC(2026, 10, 10, 12), Date.UTC(2026, 10, 12, 12), TZ, LON)
    expect(dates).toEqual(['2026-11-10', '2026-11-11', '2026-11-12'])
    expect(soilRainDays([], dates, TZ, LON)).toEqual(dates.map((local_date) => ({ local_date, rain_mm: null })))
  })
})

describe('fetchSoilPoints', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('refuses a 200: a server that ignores the range would send all 20 MB', async () => {
    const cancel = vi.fn(async () => undefined)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, headers: new Headers(), body: { cancel }, text: async () => SOIL.join('\n') })),
    )
    const now = Date.UTC(2026, 10, 12, 18)
    await expect(fetchSoilPoints(STATION, now - 86_400_000, now, Date.now() + 10_000)).rejects.toThrow(/not a partial response/)
    expect(cancel).toHaveBeenCalled()
  })

  it("drops a tail's cut first line and keeps rows inside the span", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      status: 206,
      headers: new Headers({ 'content-range': 'bytes 19700000-19781218/19781219' }),
      text: async () => `${SOIL[2]?.slice(5) ?? ''}\n${SOIL[1] ?? ''}\n${SOIL[0] ?? ''}\n`,
    }))
    vi.stubGlobal('fetch', fetchMock)
    const now = Date.UTC(2026, 10, 12, 18)
    const pts = await fetchSoilPoints(STATION, now - 15 * 86_400_000, now, Date.now() + 10_000)
    expect(pts.map((p) => p.at)).toEqual(['2026-11-04T18:00:00.000Z', '2026-11-12T16:00:00.000Z'])
    const init = fetchMock.mock.calls[0]?.[1]
    expect((init?.headers as Record<string, string>)['Range']).toMatch(/^bytes=-\d+$/)
  })
})
