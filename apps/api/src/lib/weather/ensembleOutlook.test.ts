import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchOutlook, parseOutlook } from './ensembleOutlook.js'

const DATES = ['2026-10-02', '2026-10-03', '2026-10-04']

/**
 * The live key shapes (probed 2026-10-02): perturbed members carry `_memberNN`,
 * the control run does not, and the suffix is not the model's request name.
 * ICON reaches the first two days only, as it stops short of ECMWF and GEFS live.
 */
function fixture(): Record<string, unknown> {
  return {
    time: DATES,
    // GEFS: control + two members, through all three days.
    precipitation_sum_ncep_gefs_seamless: [0, 0.1, 2],
    precipitation_sum_member01_ncep_gefs_seamless: [0.05, 0, 4],
    precipitation_sum_member02_ncep_gefs_seamless: [0, 0.3, 6],
    temperature_2m_max_ncep_gefs_seamless: [10, 11, 12],
    temperature_2m_max_member01_ncep_gefs_seamless: [12, 13, 14],
    temperature_2m_max_member02_ncep_gefs_seamless: [14, 15, 16],
    temperature_2m_min_ncep_gefs_seamless: [0, 1, 2],
    temperature_2m_min_member01_ncep_gefs_seamless: [2, 3, 4],
    temperature_2m_min_member02_ncep_gefs_seamless: [4, 5, 6],
    // ICON: control + one member, gone on the third day. The hot member is the
    // one a global max would report.
    precipitation_sum_icon_seamless_eps: [1, 1, null],
    precipitation_sum_member01_icon_seamless_eps: [0, 0, null],
    temperature_2m_max_icon_seamless_eps: [30, 13, null],
    temperature_2m_max_member01_icon_seamless_eps: [40, 13, null],
    temperature_2m_min_icon_seamless_eps: [3, 3, null],
    temperature_2m_min_member01_icon_seamless_eps: [3, 3, null],
  }
}

describe('parseOutlook', () => {
  it('pools members from every model, control runs included, per day', () => {
    const days = parseOutlook(fixture(), '2026-10-02')
    expect(days.map((d) => d.member_count)).toEqual([5, 5, 3])
    expect(days[0]?.models).toEqual(['gfs_seamless', 'icon_seamless_eps'])
    expect(days[2]?.models).toEqual(['gfs_seamless'])
  })

  it("takes the median of each member's own daily extreme, never the hottest member", () => {
    const [first] = parseOutlook(fixture(), '2026-10-02')
    // Highs 10, 12, 14, 30, 40: the median is 14, the max would be 40.
    expect(first?.temp_c_max).toBe(14)
    // Lows 0, 2, 4, 3, 3.
    expect(first?.temp_c_min).toBe(3)
  })

  it('counts a member wet at 0.1 mm and dry below it', () => {
    const days = parseOutlook(fixture(), '2026-10-02')
    // Day one: 0, 0.05, 0, 1, 0 — only the ICON control.
    expect(days[0]?.members_wet).toBe(1)
    // Day two: 0.1, 0, 0.3, 1, 0.
    expect(days[1]?.members_wet).toBe(3)
    expect(days[2]?.members_wet).toBe(3)
  })

  it('means precipitation over the members that reached the day', () => {
    const days = parseOutlook(fixture(), '2026-10-02')
    expect(days[1]?.precip_mm_mean).toBeCloseTo(1.4 / 5)
    // Day three: ICON is gone, so (2 + 4 + 6) / 3 and not / 5.
    expect(days[2]?.precip_mm_mean).toBeCloseTo(4)
  })

  it('leaves out a day no member reached rather than writing zeros', () => {
    const daily = fixture()
    daily['time'] = [...DATES, '2026-10-05']
    const days = parseOutlook(daily, '2026-10-02')
    expect(days.map((d) => d.local_date)).toEqual(DATES)
  })

  it('withholds the rain figures on a day with temperatures but no precipitation members', () => {
    const daily: Record<string, unknown> = {
      time: ['2026-10-02'],
      precipitation_sum_ncep_gefs_seamless: [null],
      temperature_2m_max_ncep_gefs_seamless: [10],
      temperature_2m_min_ncep_gefs_seamless: [1],
    }
    const [day] = parseOutlook(daily, '2026-10-02')
    expect(day).toMatchObject({
      member_count: 0,
      members_wet: null,
      precip_mm_mean: null,
      temp_c_max: 10,
      models: [],
    })
  })

  it('marks today from the date it is given', () => {
    const days = parseOutlook(fixture(), '2026-10-03')
    expect(days.map((d) => d.is_today)).toEqual([false, true, false])
  })

  it('shifts temperatures by the lapse correction', () => {
    const [first] = parseOutlook(fixture(), '2026-10-02', -2)
    expect(first?.temp_c_max).toBe(12)
    expect(first?.temp_c_min).toBe(1)
  })
})

describe('fetchOutlook', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const LOC = { lat: 44.37, lon: -91.84, elevation_m: 372 }

  it('asks for 16 local days of daily members from all four models', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ utc_offset_seconds: -18000, elevation: 372, daily: fixture() }),
    } as Response)

    await fetchOutlook(LOC, new Date('2026-10-02T12:00:00Z'))

    const called = fetchMock.mock.calls[0]?.[0]
    expect(typeof called).toBe('string')
    const url = new URL(String(called))
    expect(url.searchParams.get('forecast_days')).toBe('16')
    expect(url.searchParams.get('timezone')).toBe('auto')
    expect(url.searchParams.get('daily')).toBe('temperature_2m_max,temperature_2m_min,precipitation_sum')
    expect(url.searchParams.get('models')).toBe('gfs_seamless,ecmwf_ifs025,icon_seamless_eps,gem_global')
  })

  it("marks today on the location's local day, not UTC's", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ utc_offset_seconds: -18000, elevation: 372, daily: fixture() }),
    } as Response)

    // 02:00 UTC on the 3rd is still the evening of the 2nd at UTC-5.
    const outlook = await fetchOutlook(LOC, new Date('2026-10-03T02:00:00Z'))
    expect(outlook.utc_offset_seconds).toBe(-18000)
    expect(outlook.days.find((d) => d.is_today)?.local_date).toBe('2026-10-02')
  })

  it('applies the lapse rate from the upstream elevation to the crag', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ utc_offset_seconds: 0, elevation: 172, daily: fixture() }),
    } as Response)

    const outlook = await fetchOutlook(LOC, new Date('2026-10-02T12:00:00Z'))
    // 200 m higher than the grid: 1.3 °C colder.
    expect(outlook.days[0]?.temp_c_max).toBeCloseTo(14 - 1.3)
  })

  it('throws when the response carries no offset, rather than guessing UTC', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ daily: fixture() }),
    } as Response)

    await expect(fetchOutlook(LOC, new Date())).rejects.toThrow('utc_offset_seconds')
  })

  it('throws on a non-retryable upstream error', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'bad request',
    } as Response)

    await expect(fetchOutlook(LOC, new Date())).rejects.toThrow('400')
  })
})
