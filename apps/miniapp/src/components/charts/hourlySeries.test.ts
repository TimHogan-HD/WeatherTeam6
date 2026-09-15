import { describe, expect, it } from 'vitest'
import type { HourlyDay, HourlySample } from '@weatherteam6/types'
import {
  bandRuns,
  dayIsDrawable,
  dayStarts,
  firstDrawableDay,
  hasValues,
  hoursOnDay,
  rainSeries,
  temperatureSeries,
  timeExtent,
  uniformMemberCount,
  valueExtent,
  valueRuns,
} from './hourlySeries.js'

/**
 * The adapter is where a null becomes a gap or becomes a plausible number, so
 * these fixtures carry the real absences: a padded hour past a model's horizon,
 * a missing row, a band with one edge, an ensemble whose size changes.
 */

const BASE = '2026-09-14'

function hour(index: number, over: Partial<HourlySample> = {}): HourlySample {
  const stamp = new Date(Date.UTC(2026, 8, 14, index)).toISOString()
  return {
    valid_at: stamp,
    local_date: BASE,
    temp_c: null,
    dewpoint_c: null,
    humidity_pct: null,
    precip_mm: null,
    wind_kmh: null,
    wind_gust_kmh: null,
    wind_dir_deg: null,
    cloud_pct: null,
    pressure_hpa: null,
    temp_c_p10: null,
    temp_c_p50: null,
    temp_c_p90: null,
    wind_kmh_p10: null,
    wind_kmh_p50: null,
    wind_kmh_p90: null,
    precip_mm_mean: null,
    precip_mm_p10: null,
    precip_mm_p90: null,
    precip_chance_pct: null,
    member_count: null,
    ...over,
  }
}

describe('temperatureSeries', () => {
  it('reads the ensemble median and its band, in °C', () => {
    const [datum] = temperatureSeries([
      hour(0, { temp_c_p50: 12, temp_c_p10: 9, temp_c_p90: 15, temp_c: 30 }),
    ])
    expect(datum?.value).toBe(12)
    expect(datum?.low).toBe(9)
    expect(datum?.high).toBe(15)
  })

  it('does not fall back to the deterministic model when the ensemble is missing', () => {
    // A line from one source inside a band from another agrees only by luck,
    // and the join would be invisible on screen.
    const [datum] = temperatureSeries([hour(0, { temp_c: 30, temp_c_p50: null })])
    expect(datum?.value).toBeNull()
  })

  it('keeps a missing hour missing rather than turning it into a number', () => {
    const [datum] = temperatureSeries([hour(0)])
    expect(datum?.value).toBeNull()
    expect(datum?.low).toBeNull()
    expect(datum?.high).toBeNull()
  })

  it('drops an hour whose timestamp cannot be read', () => {
    // NaN takes the whole path with it, not just its own point.
    const series = temperatureSeries([
      hour(0, { valid_at: 'not a timestamp', temp_c_p50: 10 }),
      hour(1, { temp_c_p50: 11 }),
    ])
    expect(series).toHaveLength(1)
    expect(series[0]?.value).toBe(11)
  })
})

describe('rainSeries', () => {
  it('reads the ensemble mean, which is the only figure that can be added up', () => {
    const [datum] = rainSeries([hour(0, { precip_mm_mean: 1.4, precip_mm: 9, precip_chance_pct: 80 })])
    expect(datum?.value).toBe(1.4)
  })

  it('keeps a measured zero, which is not the same as no forecast', () => {
    const [zero] = rainSeries([hour(0, { precip_mm_mean: 0 })])
    const [absent] = rainSeries([hour(1)])
    expect(zero?.value).toBe(0)
    expect(absent?.value).toBeNull()
  })
})

describe('valueRuns', () => {
  it('breaks at a null hour', () => {
    const data = temperatureSeries([
      hour(0, { temp_c_p50: 10 }),
      hour(1),
      hour(2, { temp_c_p50: 12 }),
    ])
    expect(valueRuns(data)).toEqual([
      { start: 0, end: 0 },
      { start: 2, end: 2 },
    ])
  })

  it('breaks across a missing row even though both sides have values', () => {
    // An hour with no values at all is never stored, so its absence shows up
    // as a two-hour step between two perfectly good rows. Joining them draws a
    // straight line through a forecast nobody made.
    const data = temperatureSeries([
      hour(0, { temp_c_p50: 10 }),
      hour(1, { temp_c_p50: 11 }),
      hour(3, { temp_c_p50: 13 }),
    ])
    expect(valueRuns(data)).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 2 },
    ])
  })
})

describe('bandRuns', () => {
  it('needs both edges — a half-known band is not a band', () => {
    const data = temperatureSeries([
      hour(0, { temp_c_p50: 10, temp_c_p10: 8, temp_c_p90: 12 }),
      hour(1, { temp_c_p50: 11, temp_c_p10: 9, temp_c_p90: null }),
      hour(2, { temp_c_p50: 12, temp_c_p10: 10, temp_c_p90: 14 }),
    ])
    expect(bandRuns(data)).toEqual([
      { start: 0, end: 0 },
      { start: 2, end: 2 },
    ])
  })
})

describe('dayStarts', () => {
  it('is the first hour of each local day, in order', () => {
    const data = temperatureSeries([
      hour(0, { local_date: '2026-09-14', temp_c_p50: 1 }),
      hour(1, { local_date: '2026-09-14', temp_c_p50: 2 }),
      hour(2, { local_date: '2026-09-15', temp_c_p50: 3 }),
    ])
    expect(dayStarts(data).map((d) => d.localDate)).toEqual(['2026-09-14', '2026-09-15'])
    expect(dayStarts(data)[1]?.value).toBe(3)
  })

  it('uses the server-sent local day, not the instant', () => {
    // `local_date` is the location's calendar day and the client must not
    // re-derive it (#33). Two hours on the same UTC day can be different local
    // days, and the boundary follows the server.
    const data = temperatureSeries([
      hour(0, { local_date: '2026-09-13', temp_c_p50: 1 }),
      hour(1, { local_date: '2026-09-14', temp_c_p50: 2 }),
    ])
    expect(dayStarts(data)).toHaveLength(2)
  })
})

describe('uniformMemberCount', () => {
  it('is the count when every hour that reports one agrees', () => {
    expect(uniformMemberCount([hour(0, { member_count: 143 }), hour(1, { member_count: 143 })])).toBe(143)
  })

  it('ignores hours that report nothing', () => {
    expect(uniformMemberCount([hour(0, { member_count: 143 }), hour(1)])).toBe(143)
  })

  it('is null when the ensemble thins out across the window', () => {
    // The far end of a 7-day window is reached by fewer members. Printing the
    // largest as "143 forecast runs" attributes the whole band to a sample size
    // most of it does not have.
    expect(uniformMemberCount([hour(0, { member_count: 143 }), hour(1, { member_count: 90 })])).toBeNull()
  })

  it('is null when no hour reports a count at all', () => {
    expect(uniformMemberCount([hour(0), hour(1)])).toBeNull()
  })
})

describe('extents', () => {
  it('covers the band as well as the line', () => {
    const data = temperatureSeries([hour(0, { temp_c_p50: 10, temp_c_p10: 2, temp_c_p90: 20 })])
    expect(valueExtent(data)).toEqual({ min: 2, max: 20 })
  })

  it('reports no time span for an empty window', () => {
    expect(timeExtent([])).toBeNull()
  })
})

describe('hasValues', () => {
  it('is false for a window of nothing but padding', () => {
    // Open-Meteo pads every model out to the longest horizon in the request, so
    // an all-null series is a real response, not an empty one.
    expect(hasValues(temperatureSeries([hour(0), hour(1)]))).toBe(false)
  })

  it('is true as soon as one hour has a reading', () => {
    expect(hasValues(temperatureSeries([hour(0), hour(1, { temp_c_p50: 4 })]))).toBe(true)
  })
})

describe('hoursOnDay', () => {
  it('filters on the server-derived local date, not on the instant', () => {
    // The day boundary belongs to the crag's timezone. Re-bucketing the UTC
    // instants here is issue #33 rebuilt in a filter: it would agree with the
    // server for anyone in the crag's own timezone and be a day out elsewhere.
    const hours = [
      hour(0, { local_date: '2026-09-13', temp_c_p50: 5 }),
      hour(1, { local_date: '2026-09-14', temp_c_p50: 6 }),
      hour(2, { local_date: '2026-09-14', temp_c_p50: 7 }),
    ]
    expect(hoursOnDay(hours, '2026-09-14').map((h) => h.temp_c_p50)).toEqual([6, 7])
    expect(hoursOnDay(hours, '2026-09-20')).toEqual([])
  })
})

describe('dayIsDrawable', () => {
  const day = (over: Partial<HourlyDay>): HourlyDay => ({
    local_date: '2026-09-14',
    has_deterministic: false,
    has_ensemble: false,
    ...over,
  })

  it('asks about the ensemble, because that is what these charts draw', () => {
    // A day the deterministic model reached but no ensemble member did would
    // open a drill-down with two empty charts in it. `days[]` carries both
    // flags precisely because they answer different questions.
    expect(dayIsDrawable(day({ has_ensemble: true, has_deterministic: false }))).toBe(true)
    expect(dayIsDrawable(day({ has_ensemble: false, has_deterministic: true }))).toBe(false)
  })
})

describe('firstDrawableDay', () => {
  const day = (date: string, ensemble: boolean): HourlyDay => ({
    local_date: date,
    has_deterministic: true,
    has_ensemble: ensemble,
  })

  it('skips a leading day the ensemble never reached', () => {
    // `days[0]` is routinely the tail of a run that has already passed. Opening
    // on it shows two empty charts for a location whose forecast is fine — and
    // an assertion against a list whose first day is drawable would never
    // notice.
    expect(
      firstDrawableDay([day('2026-09-14', false), day('2026-09-15', true), day('2026-09-16', true)]),
    ).toBe('2026-09-15')
  })

  it('is null when no day in the window is drawable', () => {
    expect(firstDrawableDay([day('2026-09-14', false)])).toBeNull()
    expect(firstDrawableDay([])).toBeNull()
  })
})

describe('a column an older API deployment does not send', () => {
  it('reads as a gap, not as a value the chart can position', () => {
    // **Found in production, not by this suite.** The types say
    // `number | null`, so nothing here could have caught it: a response served
    // by an API older than the client omits a newly added column entirely, and
    // `undefined === null` is false. Every guard downstream waved it through
    // and the rain whiskers stroked `y1="NaN"` — no thrown error, no browser
    // warning, just marks silently missing from a chart that believed it had
    // drawn them. Every release that adds a field has this window.
    const stale = { ...hour(0), precip_mm_mean: 1.4 } as Record<string, unknown>
    delete stale['precip_mm_p10']
    delete stale['precip_mm_p90']

    const [datum] = rainSeries([stale as unknown as HourlySample])
    expect(datum?.low).toBeNull()
    expect(datum?.high).toBeNull()
    // The value still arrives, so the bar is drawn; only its spread is absent.
    expect(datum?.value).toBe(1.4)
  })
})
