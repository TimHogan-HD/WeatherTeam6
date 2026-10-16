import { describe, expect, it } from 'vitest'
import {
  buildSkySeries,
  clearSkyWm2,
  CLOUDY_MAX_RATIO,
  skyCondition,
  summarizeSkyDay,
  SUNNY_MIN_RATIO,
} from './skySeries.js'
import type { DeterministicRuns, ModelRun, RunHour } from './latestRuns.js'

const HOUR_MS = 3_600_000
/** Las Vegas in September: UTC-7. */
const PDT = -7 * 3600
const LAS_VEGAS = { lat: 36.17, lon: -115.14 }
const DAY = '2026-09-08'
/** 00:00 PDT on `DAY`, as UTC. */
const MIDNIGHT = Date.parse('2026-09-08T07:00:00Z')

function hour(localHour: number, shortwave_wm2: number | null): RunHour {
  return {
    valid_at: new Date(MIDNIGHT + localHour * HOUR_MS),
    temp_c: null,
    dewpoint_c: null,
    humidity_pct: null,
    precip_mm: null,
    wind_kmh: null,
    wind_gust_kmh: null,
    wind_dir_deg: null,
    cloud_pct: null,
    precip_prob_pct: null,
    pressure_hpa: null,
    shortwave_wm2,
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

/** Every hour of the day at one value; `override` replaces chosen local hours. */
function day(value: number | null, override: Record<number, number | null | 'absent'> = {}): RunHour[] {
  const out: RunHour[] = []
  for (let h = 1; h <= 24; h++) {
    const o = override[h]
    if (o === 'absent') continue
    out.push(hour(h, o === undefined ? value : o))
  }
  return out
}

const build = (models: ModelRun[]) =>
  buildSkySeries({ deterministic: runs(models), dates: [DAY], utcOffsetSeconds: PDT, ...LAS_VEGAS })

const localHourOf = (iso: string) => new Date(Date.parse(iso) + PDT * 1000).getUTCHours()

describe('clearSkyWm2', () => {
  it('is 0 with the sun down and Haurwitz overhead', () => {
    expect(clearSkyWm2(-3)).toBe(0)
    expect(clearSkyWm2(0)).toBe(0)
    // 1098 · e^(-0.057), by hand.
    expect(clearSkyWm2(90)).toBeCloseTo(1037.2, 1)
  })
})

describe('skyCondition', () => {
  it('sorts on the cut-offs, inclusive at sunny and exclusive at cloudy', () => {
    expect(skyCondition(SUNNY_MIN_RATIO * 800, 800)).toBe('sunny')
    expect(skyCondition(SUNNY_MIN_RATIO * 800 - 1, 800)).toBe('partly_cloudy')
    expect(skyCondition(CLOUDY_MAX_RATIO * 800, 800)).toBe('partly_cloudy')
    expect(skyCondition(CLOUDY_MAX_RATIO * 800 - 1, 800)).toBe('cloudy')
  })

  it('reads 0 W/m² in daylight as cloudy — a measurement, not a gap', () => {
    expect(skyCondition(0, 800)).toBe('cloudy')
  })

  it('withholds a missing, negative or impossible reading rather than calling it cloudy', () => {
    expect(skyCondition(null, 800)).toBeNull()
    expect(skyCondition(Number.NaN, 800)).toBeNull()
    expect(skyCondition(-1, 800)).toBeNull()
    expect(skyCondition(2847, 800)).toBeNull()
    expect(skyCondition(500, 0)).toBeNull()
    expect(skyCondition(500, null)).toBeNull()
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
  it('decides daylight by the sun: 08:00 through 18:00 stamps in Las Vegas on 8 September', () => {
    const series = build([model('gfs_seamless', day(0))])
    const local = series.hours.map((h) => localHourOf(h.valid_at))
    // Sunrise ~06:16 and sunset ~19:05 PDT. The 07:00 stamp's middle, 06:30, has the sun
    // under 10° and the 08:00 stamp's, 07:30, over it; at the other end 17:30 is over and
    // 18:30 under.
    expect(local[0]).toBe(8)
    expect(local[local.length - 1]).toBe(18)
    expect(local).toEqual(Array.from({ length: 11 }, (_, i) => 8 + i))
    expect(series.hours.every((h) => h.local_date === DAY)).toBe(true)
  })

  it('reads the thermal model and names it', () => {
    const series = build([model('gfs_seamless', day(1000))])
    expect(series.model).toBe('gfs_seamless')
    // Midday at 1000 W/m² is past any cloudless figure here; the low-sun ends are too.
    expect(series.hours.every((h) => h.sky === 'sunny')).toBe(true)
    expect(series.days).toEqual([{ local_date: DAY, summary: 'sunny' }])
  })

  it('never borrows another model — GEM alone leaves every hour a gap', () => {
    const series = build([model('gem_seamless', day(1000)), model('icon_seamless', day(1000))])
    expect(series.model).toBeNull()
    expect(series.hours.length).toBe(11)
    expect(series.hours.every((h) => h.sky === null)).toBe(true)
    expect(series.days).toEqual([{ local_date: DAY, summary: null }])
  })

  it('keeps an hour the run did not return, as a gap that withholds the day', () => {
    const series = build([model('gfs_seamless', day(1000, { 13: 'absent' }))])
    const at13 = series.hours.find((h) => localHourOf(h.valid_at) === 13)
    expect(at13?.sky).toBeNull()
    expect(series.hours.filter((h) => h.sky === 'sunny')).toHaveLength(10)
    expect(series.days[0]?.summary).toBeNull()
  })

  it('reads a dark afternoon as cloud, hour by hour', () => {
    const dark = Object.fromEntries([14, 15, 16, 17, 18, 19].map((h) => [h, 0]))
    const series = build([model('gfs_seamless', day(1000, dark))])
    const sky = series.hours.map((h) => h.sky)
    expect(sky).toEqual([...Array(6).fill('sunny'), ...Array(5).fill('cloudy')])
    expect(series.days[0]?.summary).toBe('sunny_morning')
  })
})
