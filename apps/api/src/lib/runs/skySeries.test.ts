import { describe, expect, it } from 'vitest'
import {
  buildSkySeries,
  CLOUDY_MAX_SUN_MIN,
  skyCondition,
  summarizeSkyDay,
  sunMinutes,
  sunWindows,
  SUNNY_MIN_SUN_MIN,
} from './skySeries.js'
import type { DeterministicRuns, ModelRun, RunHour } from './latestRuns.js'

const HOUR_MS = 3_600_000
/** Las Vegas in September: UTC-7. */
const PDT = -7 * 3600
const LAS_VEGAS = { lat: 36.17, lon: -115.14 }
const DAY = '2026-09-08'
/** 00:00 PDT on `DAY`, as UTC. */
const MIDNIGHT = Date.parse('2026-09-08T07:00:00Z')

function hour(
  localHour: number,
  shortwave_wm2: number | null,
  sunshine_s: number | null = null,
  cloud_pct: number | null = null,
): RunHour {
  return {
    valid_at: new Date(MIDNIGHT + localHour * HOUR_MS),
    temp_c: null,
    dewpoint_c: null,
    humidity_pct: null,
    precip_mm: null,
    wind_kmh: null,
    wind_gust_kmh: null,
    wind_dir_deg: null,
    cloud_pct,
    precip_prob_pct: null,
    pressure_hpa: null,
    shortwave_wm2,
    sunshine_s,
    rain_median_mm: null,
  }
}

function model(name: string, hours: RunHour[]): ModelRun {
  const at = new Date('2026-09-08T06:00:00Z')
  return { model: name, hours, probability_is_shared: false, rain_models: null, fetched_at: at, checked_at: at }
}

function runs(models: ModelRun[]): DeterministicRuns {
  return { models, unavailable_models: [], utc_offset_seconds: PDT, fetched_at: null, checked_at: null }
}

/**
 * Every hour of the day: shortwave at `value` (`override` replaces chosen local
 * hours' shortwave, or drops the hour), sunshine at `sunshine` (`sunOverride`
 * replaces chosen hours'), cloud at `cloud`.
 */
function day(
  value: number | null,
  override: Record<number, number | null | 'absent'> = {},
  sunshine: number | null = null,
  cloud: number | null = null,
  sunOverride: Record<number, number | null> = {},
): RunHour[] {
  const out: RunHour[] = []
  for (let h = 1; h <= 24; h++) {
    const o = override[h]
    if (o === 'absent') continue
    const so = sunOverride[h]
    out.push(hour(h, o === undefined ? value : o, so === undefined ? sunshine : so, cloud))
  }
  return out
}

const build = (models: ModelRun[]) =>
  buildSkySeries({ deterministic: runs(models), dates: [DAY], utcOffsetSeconds: PDT, ...LAS_VEGAS })

const localHourOf = (iso: string) => new Date(Date.parse(iso) + PDT * 1000).getUTCHours()

describe('sunMinutes', () => {
  it('turns seconds into minutes, keeps 0 and withholds what is not a measurement', () => {
    expect(sunMinutes(0)).toBe(0)
    expect(sunMinutes(1800)).toBe(30)
    expect(sunMinutes(3600)).toBe(60)
    expect(sunMinutes(3630)).toBe(60)
    expect(sunMinutes(null)).toBeNull()
    expect(sunMinutes(Number.NaN)).toBeNull()
    expect(sunMinutes(-1)).toBeNull()
    expect(sunMinutes(7200)).toBeNull()
  })
})

describe('skyCondition', () => {
  it('sorts on the cut-offs, inclusive at sunny and exclusive at cloudy', () => {
    expect(skyCondition(SUNNY_MIN_SUN_MIN)).toBe('sunny')
    expect(skyCondition(SUNNY_MIN_SUN_MIN - 0.1)).toBe('partly_cloudy')
    expect(skyCondition(CLOUDY_MAX_SUN_MIN)).toBe('partly_cloudy')
    expect(skyCondition(CLOUDY_MAX_SUN_MIN - 0.1)).toBe('cloudy')
  })

  it('reads 0 minutes as cloudy — a measurement — and null as a gap', () => {
    expect(skyCondition(0)).toBe('cloudy')
    expect(skyCondition(null)).toBeNull()
  })
})

describe('sunWindows', () => {
  const hrs = (pairs: [number, number][]) => pairs.map(([startHour, sunMin]) => ({ startHour, sunMin }))
  it('joins consecutive hours of at least half sun and splits at a dull one', () => {
    expect(sunWindows(hrs([[7, 0], [8, 30], [9, 60], [10, 29], [11, 45], [12, 50], [13, 0]]))).toEqual([
      { start_hour: 8, end_hour: 10 },
      { start_hour: 11, end_hour: 13 },
    ])
  })
  it('does not bridge a missing hour between two sunny ones', () => {
    expect(sunWindows(hrs([[8, 60], [10, 60]]))).toEqual([
      { start_hour: 8, end_hour: 9 },
      { start_hour: 10, end_hour: 11 },
    ])
  })
})

describe('summarizeSkyDay', () => {
  const S = 'sunny' as const
  const P = 'partly_cloudy' as const
  const C = 'cloudy' as const

  it('is null for no daylight and for any gap, even among sunny hours', () => {
    expect(summarizeSkyDay([])).toBeNull()
    expect(summarizeSkyDay([S, S, S, S, S, null, S, S])).toBeNull()
  })

  it('calls a day outright at three quarters of its hours', () => {
    expect(summarizeSkyDay([S, S, S, S, S, S, S, S, S, C, C, C])).toBe('sunny')
    expect(summarizeSkyDay([S, S, S, S, S, S, S, S, C, C, C, C])).not.toBe('sunny')
    expect(summarizeSkyDay([C, C, C, C, C, C, C, C, C, P, S, S])).toBe('cloudy')
  })

  it('names the sunny half when only one half is', () => {
    // Order matters: the same twelve hours reversed are the other half's day.
    const morning = [S, S, S, S, S, P, P, C, C, C, P, P]
    expect(summarizeSkyDay(morning)).toBe('sunny_morning')
    expect(summarizeSkyDay([...morning].reverse())).toBe('sunny_afternoon')
    expect(summarizeSkyDay([C, C, C, C, P, P, S, S, S, S, P, P])).toBe('sunny_afternoon')
  })

  it('is partly cloudy when neither half stands out', () => {
    expect(summarizeSkyDay([S, C, S, C, S, C, S, C, S, C, S, C])).toBe('partly_cloudy')
    // Both halves sunny enough for "sunny morning" on their own, so neither is named.
    expect(summarizeSkyDay([S, S, S, P, P, P, S, S, S, P, P, P])).toBe('partly_cloudy')
  })
})

describe('buildSkySeries', () => {
  it('gives sky words to the hours with the sun 10° up: 08:00 through 18:00 stamps in Las Vegas on 8 September', () => {
    const series = build([model('gfs_seamless', day(0))])
    const local = series.hours.map((h) => localHourOf(h.valid_at))
    // Sunrise ~06:16 and sunset ~19:05 PDT.
    expect(local).toEqual(Array.from({ length: 11 }, (_, i) => 8 + i))
    expect(series.hours.every((h) => h.local_date === DAY)).toBe(true)
  })

  it('puts every hour of the day on the Sun card, night marked, daylight from sunrise to sunset', () => {
    const series = build([model('gfs_seamless', day(0))])
    expect(series.sun).toHaveLength(24)
    const lit = series.sun.filter((h) => h.daylight).map((h) => localHourOf(h.valid_at))
    // The 07:00 stamp covers 06:00–07:00, inside which the sun rises; the geometric sunset falls just before 19:00.
    expect(lit[0]).toBe(7)
    expect(lit[lit.length - 1]).toBe(19)
  })

  it('reads the thermal model, names it, and totals the day', () => {
    const series = build([model('gfs_seamless', day(0, {}, 3600))])
    expect(series.model).toBe('gfs_seamless')
    expect(series.hours.every((h) => h.sky === 'sunny')).toBe(true)
    const d = series.days[0]
    expect(d?.summary).toBe('sunny')
    // Night hours report 3600 in this fixture too, but only daylight counts: 13 hours, 07:00–19:00 stamps.
    expect(d?.sun_min).toBe(13 * 60)
    expect(d?.sun_windows).toEqual([{ start_hour: 6, end_hour: 19 }])
    expect(d?.sun_by_model).toEqual([{ model: 'gfs_seamless', sun_min: 13 * 60 }])
  })

  it('carries sunlight and cloud to the Sun card, and withholds an impossible sunlight figure', () => {
    const series = build([model('gfs_seamless', day(820, { 13: 5000 }, 3600, 40))])
    const at12 = series.sun.find((h) => localHourOf(h.valid_at) === 12)
    expect(at12).toMatchObject({ sun_min: 60, shortwave_wm2: 820, cloud_pct: 40 })
    expect(series.sun.find((h) => localHourOf(h.valid_at) === 13)?.shortwave_wm2).toBeNull()
  })

  it('never borrows another model — GEM and ICON alone leave every hour a gap', () => {
    const series = build([model('gem_seamless', day(0, {}, 3600)), model('icon_seamless', day(0, {}, 3600))])
    expect(series.model).toBeNull()
    expect(series.hours.length).toBe(11)
    expect(series.hours.every((h) => h.sky === null)).toBe(true)
    expect(series.sun.every((h) => h.sun_min === null)).toBe(true)
    expect(series.days[0]).toMatchObject({ summary: null, sun_min: null, sun_windows: null, sun_by_model: [] })
  })

  it('keeps an hour the run did not return as a gap that withholds the day, never as no sun', () => {
    const series = build([model('gfs_seamless', day(0, { 13: 'absent' }, 3600))])
    expect(series.hours.find((h) => localHourOf(h.valid_at) === 13)?.sky).toBeNull()
    expect(series.sun.find((h) => localHourOf(h.valid_at) === 13)?.sun_min).toBeNull()
    expect(series.days[0]).toMatchObject({ summary: null, sun_min: null, sun_windows: null })
  })

  it('reads a dull afternoon as cloud, hour by hour, and as one morning window', () => {
    const dull = Object.fromEntries([14, 15, 16, 17, 18, 19, 20].map((h) => [h, 0]))
    const series = build([model('gfs_seamless', day(0, {}, 3600, null, dull))])
    expect(series.hours.map((h) => h.sky)).toEqual([...Array(6).fill('sunny'), ...Array(5).fill('cloudy')])
    expect(series.days[0]?.summary).toBe('sunny_morning')
    expect(series.days[0]?.sun_windows).toEqual([{ start_hour: 6, end_hour: 13 }])
  })

  it('compares GFS, ECMWF and ICON day totals, never GEM, and only models that answered the whole day', () => {
    const series = build([
      model('gfs_seamless', day(0, {}, 3600)),
      model('ecmwf_ifs025', day(0, {}, 0)),
      model('icon_seamless', day(0, { 12: 'absent' }, 1800)),
      model('gem_seamless', day(0, {}, 1800)),
    ])
    expect(series.days[0]?.sun_by_model).toEqual([
      { model: 'gfs_seamless', sun_min: 780 },
      { model: 'ecmwf_ifs025', sun_min: 0 },
    ])
  })
})
