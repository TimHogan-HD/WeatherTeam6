import { describe, expect, it } from 'vitest'
import type { DeterministicResult, HourlyPoint, RecentPrecipByModel } from './openMeteo.js'
import { radarChecked, rainMedian, recentPrecipMedian } from './rainMedian.js'

/** Hourly local stamps from 2026-09-25T04:00. */
const stamp = (i: number) => new Date(Date.UTC(2026, 8, 25, 4 + i)).toISOString().slice(0, 16)
const T = [stamp(0), stamp(1)]

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
    sunshine_s: null,
  }
}

function result(series: Record<string, (number | null)[]>): DeterministicResult {
  return {
    models: Object.entries(series).map(([model, values]) => ({
      model,
      hours: values.map((v, i) => hour(stamp(i), v)),
      probability_is_shared: null,
    })),
    unavailable_models: [],
    utc_offset_seconds: -18000,
    model_elevation_m: null,
    fetched_at: new Date('2026-09-25T12:00:00Z'),
  }
}

describe('rainMedian', () => {
  it("takes the middle of the four global models' means, over the hours a series has", () => {
    const out = rainMedian(
      result({
        gfs_seamless: [0, 0],
        ecmwf_ifs025: [0.4, 0],
        icon_seamless: [1.2, 0],
        gem_seamless: [3, 0.2],
      }),
    )!
    expect(out.models).toEqual(['gfs_seamless', 'ecmwf_ifs025', 'icon_seamless', 'gem_seamless'])
    // Two hours: each model's mean is over both. Means 0, 0.2, 0.6, 1.6; even
    // count takes the middle two, so one wet outlier cannot decide it.
    expect(out.byLocal.get(T[0]!)).toBeCloseTo(0.4)
    expect(out.byLocal.get(T[1]!)).toBeCloseTo(0.4)
  })

  /** 24 hours of zeros with `mm` at the given hours. */
  const day = (rain: Record<number, number>) => Array.from({ length: 24 }, (_, i) => rain[i] ?? 0)
  const total = (m: ReadonlyMap<string, number | null>) => [...m.values()].reduce<number>((a, v) => a + (v ?? 0), 0)

  it('keeps a shower the models put in different hours (issue #324, Sandstone 4 Oct)', () => {
    // The issue's table, 14:00-20:00: three models wet, each peaking at its own hour.
    const out = rainMedian(
      result({
        gfs_seamless: day({ 16: 5.8, 17: 0.4, 20: 2.5 }),
        ecmwf_ifs025: day({ 14: 1.8, 15: 1.8, 16: 1.8, 17: 0.9, 18: 0.9 }),
        icon_seamless: day({ 15: 0.7, 16: 0.3, 17: 2.2, 18: 0.8, 20: 0.1 }),
        gem_seamless: day({}),
      }),
    )!
    // The wet models total 8.7, 7.2 and 4.1 mm; the hour-by-hour median kept 2.5.
    expect(total(out.byLocal)).toBeGreaterThan(4)
  })

  it('spreads a storm the models agree on without changing its total', () => {
    const storm = day({ 12: 6 })
    const out = rainMedian(
      result({ gfs_seamless: storm, ecmwf_ifs025: storm, icon_seamless: storm, gem_seamless: storm }),
    )!
    expect(total(out.byLocal)).toBeCloseTo(6)
    // Rain at hour 12 reaches the hours whose window holds it: 10 through 15.
    expect(out.byLocal.get(stamp(9))).toBe(0)
    expect(out.byLocal.get(stamp(10))).toBeCloseTo(1)
    expect(out.byLocal.get(stamp(15))).toBeCloseTo(1)
    expect(out.byLocal.get(stamp(16))).toBe(0)
  })

  it('does not fill a model gap from its neighbours', () => {
    const wet = day({ 11: 3, 13: 3 })
    const gappy: (number | null)[] = [...wet]
    gappy[12] = null
    const out = rainMedian(
      result({ gfs_seamless: gappy, ecmwf_ifs025: [...gappy], icon_seamless: wet, gem_seamless: wet }),
    )!
    expect(out.byLocal.get(stamp(12))).toBeNull()
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

describe('radarChecked: radar overrules the median, cautiously (owner, 2026-11-02)', () => {
  const T0 = Date.UTC(2026, 10, 1, 12)
  const H = 3_600_000
  /** Radar for the six hours the median averages (T0-3h..T0+2h); `at` overrides one hour. */
  const radar = (mm: number, at: Record<number, number | null> = {}) => (ms: number) => {
    const o = (ms - T0) / H
    if (o < -3 || o > 2) return undefined
    return o in at ? at[o] : mm
  }

  it('zeroes the hour when radar read no rain across the whole window', () => {
    expect(radarChecked(1.2, T0, radar(0))).toEqual({ precip_mm: 0, byRadar: true })
  })

  it('counts the window as dry only under 0.1 mm in total, not per hour', () => {
    // 0.02 mm in each of six hours is 0.12 mm: rain fell, so the median stands.
    expect(radarChecked(1.2, T0, radar(0.02))).toEqual({ precip_mm: 1.2, byRadar: true })
    expect(radarChecked(1.2, T0, radar(0.01))).toEqual({ precip_mm: 0, byRadar: true })
  })

  it('takes the larger of radar’s hour and the median when radar saw rain', () => {
    expect(radarChecked(0.4, T0, radar(0, { 0: 3 }))).toEqual({ precip_mm: 3, byRadar: true })
    // Radar under the median never takes the models' rain away on a wet day.
    expect(radarChecked(2, T0, radar(0, { 0: 0.5 }))).toEqual({ precip_mm: 2, byRadar: true })
    // Rain elsewhere in the window, none this hour: the median stands.
    expect(radarChecked(2, T0, radar(0, { [-3]: 1 }))).toEqual({ precip_mm: 2, byRadar: true })
  })

  it('leaves the median alone when any hour of the window has no radar, at either end', () => {
    for (const o of [-3, 0, 2]) {
      expect(radarChecked(1.2, T0, radar(0, { [o]: null }))).toEqual({ precip_mm: 1.2, byRadar: false })
    }
    // The newest hours: their window reaches past the newest radar hour.
    expect(radarChecked(1.2, T0, (ms) => (ms > T0 ? undefined : 0))).toEqual({ precip_mm: 1.2, byRadar: false })
  })

  it('keeps a gap a gap: no median, no reading, whatever radar says', () => {
    expect(radarChecked(null, T0, radar(5))).toEqual({ precip_mm: null, byRadar: false })
  })
})
