import { describe, expect, it } from 'vitest'
import type { DeterministicResult, HourlyPoint, RecentPrecipByModel } from './openMeteo.js'
import { rainMedian, recentPrecipMedian } from './rainMedian.js'

const T = ['2026-09-25T04:00', '2026-09-25T05:00']

function hour(valid_at_local: string, precip_mm: number | null): HourlyPoint {
  return {
    valid_at_local,
    temp_c: 12,
    dewpoint_c: 10,
    humidity_pct: 90,
    precip_mm,
    wind_kmh: 5,
    wind_gust_kmh: 8,
    wind_dir_deg: 180,
    cloud_pct: 100,
    precip_prob_pct: null,
    pressure_hpa: 1010,
    shortwave_wm2: 0,
  }
}

function result(series: Record<string, (number | null)[]>): DeterministicResult {
  return {
    models: Object.entries(series).map(([model, values]) => ({
      model,
      hours: values.map((v, i) => hour(T[i]!, v)),
      probability_is_shared: null,
    })),
    unavailable_models: [],
    utc_offset_seconds: -18000,
    model_elevation_m: null,
    fetched_at: new Date('2026-09-25T12:00:00Z'),
  }
}

describe('rainMedian', () => {
  it('takes the middle of the four global models, hour by hour', () => {
    const out = rainMedian(
      result({
        gfs_seamless: [0, 0],
        ecmwf_ifs025: [0.4, 0],
        icon_seamless: [1.2, 0],
        gem_seamless: [3, 0.2],
      }),
    )!
    expect(out.models).toEqual(['gfs_seamless', 'ecmwf_ifs025', 'icon_seamless', 'gem_seamless'])
    // Even count: the mean of the middle two, so one wet outlier cannot decide it.
    expect(out.byLocal.get(T[0]!)).toBeCloseTo(0.8)
    expect(out.byLocal.get(T[1]!)).toBe(0)
  })

  it('leaves the US-only models out, so a crag abroad gets the same statistic', () => {
    const out = rainMedian(
      result({
        gfs_seamless: [0, 0],
        ecmwf_ifs025: [0, 0],
        icon_seamless: [0, 0],
        ncep_hrrr_conus: [9, 9],
        ncep_nbm_conus: [9, 9],
      }),
    )!
    expect(out.models).toEqual(['gfs_seamless', 'ecmwf_ifs025', 'icon_seamless'])
    expect(out.byLocal.get(T[0]!)).toBe(0)
  })

  it('is a gap at an hour fewer than three models answered, not a median of two', () => {
    const out = rainMedian(
      result({
        gfs_seamless: [0, 0],
        ecmwf_ifs025: [null, 0],
        icon_seamless: [null, 0],
        gem_seamless: [2, 0],
      }),
    )!
    expect(out.byLocal.get(T[0]!)).toBeNull()
    expect(out.byLocal.get(T[1]!)).toBe(0)
  })

  it('returns nothing when fewer than three models answered at all', () => {
    expect(
      rainMedian(
        result({ gfs_seamless: [0, 0], ecmwf_ifs025: [1, 1], icon_seamless: [null, null] }),
      ),
    ).toBeNull()
  })
})

describe('recentPrecipMedian', () => {
  type Part = { precip: number; rain?: number | null; snow?: number | null }
  function byModel(series: Record<string, (Part | null)[]>): RecentPrecipByModel {
    return {
      models: Object.entries(series).map(([model, parts]) => ({
        model,
        hours: parts.flatMap((p, i) =>
          p === null
            ? []
            : [{ valid_at_local: T[i]!, precip_mm: p.precip, rain_mm: p.rain === undefined ? p.precip : p.rain, snowfall_cm: p.snow ?? 0 }],
        ),
      })),
      utc_offset_seconds: -18000,
      from_date: '2026-09-25',
    }
  }

  it('draws the median, so one dry model cannot hide a storm the others saw', () => {
    // The shape of the 2026-09-29 gauge check: GFS (HRRR) dry while the rest were wet.
    const out = recentPrecipMedian(
      byModel({
        gfs_seamless: [{ precip: 0 }, { precip: 0 }],
        ecmwf_ifs025: [{ precip: 4 }, { precip: 0 }],
        icon_seamless: [{ precip: 5 }, { precip: 0 }],
        gem_seamless: [{ precip: 6 }, { precip: 0.2 }],
      }),
    )
    expect(out.hours.map((h) => h.precip_mm)).toEqual([4.5, 0])
    expect(out.models).toEqual(['gfs_seamless', 'ecmwf_ifs025', 'icon_seamless', 'gem_seamless'])
    expect(out.utc_offset_seconds).toBe(-18000)
    expect(out.from_date).toBe('2026-09-25')
  })

  it('leaves out an hour fewer than three models answered, rather than calling it dry', () => {
    const out = recentPrecipMedian(
      byModel({
        gfs_seamless: [{ precip: 0 }, { precip: 1 }],
        ecmwf_ifs025: [null, { precip: 1 }],
        icon_seamless: [null, { precip: 1 }],
        gem_seamless: [{ precip: 0 }, null],
      }),
    )
    expect(out.hours.map((h) => h.valid_at_local)).toEqual([T[1]])
  })

  it('names only the models that answered, and none when no hour could be formed', () => {
    const answered = recentPrecipMedian(
      byModel({
        gfs_seamless: [{ precip: 0 }, { precip: 0 }],
        ecmwf_ifs025: [{ precip: 0 }, { precip: 0 }],
        icon_seamless: [{ precip: 0 }, { precip: 0 }],
        gem_seamless: [null, null],
      }),
    )
    expect(answered.models).toEqual(['gfs_seamless', 'ecmwf_ifs025', 'icon_seamless'])

    const tooFew = recentPrecipMedian(
      byModel({ gfs_seamless: [{ precip: 1 }, { precip: 1 }], ecmwf_ifs025: [{ precip: 1 }, { precip: 1 }] }),
    )
    expect(tooFew.hours).toEqual([])
    expect(tooFew.models).toEqual([])
  })

  it('keeps the kind of precipitation unknown when too few models could say', () => {
    const out = recentPrecipMedian(
      byModel({
        gfs_seamless: [{ precip: 2, rain: null, snow: 1 }, { precip: 0 }],
        ecmwf_ifs025: [{ precip: 2, rain: null, snow: 1 }, { precip: 0 }],
        icon_seamless: [{ precip: 2, rain: 0, snow: 1.4 }, { precip: 0 }],
        gem_seamless: [{ precip: 2, rain: 0.5, snow: 0.8 }, { precip: 0 }],
      }),
    )
    expect(out.hours[0]?.rain_mm).toBeNull()
    expect(out.hours[0]?.snowfall_cm).toBe(1)
  })
})
