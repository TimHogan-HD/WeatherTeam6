import { describe, it, expect } from 'vitest'
import {
  DEFAULT_WINDOW_MIN_SCORE,
  THERMAL_MODEL,
  buildHourlyReadings,
  type BuildReadingsInput,
} from './hourlyReadings.js'
import type { DeterministicRuns, ModelRun, RunHour } from './latestRuns.js'
import { saturationVapourPressureKpa } from '../scoring/rockThermal.js'

/**
 * Every fixture here is built from real instants on a real clock, because the
 * two things this module can get wrong are both about time: which hours feed
 * the calculation, and which come back out. A fixture of three synthetic hours
 * could not reach either — `defect-patterns.md` §11.
 */

function dewPointC(tempC: number, rhPct: number): number {
  const es = saturationVapourPressureKpa(tempC)!
  const ln = Math.log((es * rhPct) / 100 / 0.6108)
  return (237.3 * ln) / (17.27 - ln)
}

const OFFSET = 0
const NOW = new Date('2026-09-21T12:00:00Z')

/** Hours running from `hoursBack` before NOW to `hoursForward` after it. */
function runHours(
  hoursBack: number,
  hoursForward: number,
  over: Partial<RunHour> = {},
): RunHour[] {
  const out: RunHour[] = []
  for (let i = -hoursBack; i <= hoursForward; i++) {
    out.push({
      valid_at: new Date(NOW.getTime() + i * 3_600_000),
      temp_c: 14,
      dewpoint_c: dewPointC(14, 45),
      humidity_pct: 45,
      precip_mm: 0,
      wind_kmh: 10,
      wind_gust_kmh: 15,
      wind_dir_deg: 200,
      cloud_pct: 0,
      precip_prob_pct: 0,
      pressure_hpa: 1010,
      shortwave_wm2: 0,
      rain_median_mm: 0,
      ...over,
    })
  }
  return out
}

function model(name: string, hours: RunHour[], rainModels: string[] | null = null): ModelRun {
  return {
    model: name,
    hours,
    probability_is_shared: false,
    rain_models: rainModels,
    fetched_at: NOW,
    checked_at: NOW,
  }
}

function deterministic(models: ModelRun[]): DeterministicRuns {
  return {
    models,
    unavailable_models: [],
    utc_offset_seconds: OFFSET,
    fetched_at: NOW,
    checked_at: NOW,
  }
}

/** The local dates a 7-day window covers from NOW at UTC. */
const DATES = [
  '2026-09-21',
  '2026-09-22',
  '2026-09-23',
  '2026-09-24',
  '2026-09-25',
  '2026-09-26',
  '2026-09-27',
]

const input = (over: Partial<BuildReadingsInput> = {}): BuildReadingsInput => ({
  deterministic: deterministic([model(THERMAL_MODEL, runHours(120, 48))]),
  dates: DATES,
  utcOffsetSeconds: OFFSET,
  rockType: 'granite',
  lat: 36.13,
  lon: -115.43,
  now: NOW,
  ...over,
})

describe('which model the readings come from', () => {
  it('derives them from the thermal model and names it', () => {
    const out = buildHourlyReadings(input())
    expect(out.model).toBe(THERMAL_MODEL)
    expect(out.unavailable_reason).toBeNull()
    expect(out.hours.length).toBeGreaterThan(0)
  })

  /**
   * The attribution rule, and the reason this is not just "use whichever model
   * the series picked". `gem_seamless` reports shortwave ~3x too high past day
   * 4 (issue #155), so irradiance comes from one model — and if that model is
   * not here, the honest answer is no reading, not another model's numbers.
   */
  it('withholds entirely when the thermal model did not answer, even if others did', () => {
    const out = buildHourlyReadings(
      input({
        deterministic: deterministic([
          model('gem_seamless', runHours(120, 48)),
          model('icon_seamless', runHours(120, 48)),
        ]),
      }),
    )
    expect(out.unavailable_reason).toBe('model_unavailable')
    expect(out.model).toBeNull()
    expect(out.hours).toEqual([])
    expect(out.days).toEqual([])
  })

  it('withholds when the thermal model is present but carried no hours', () => {
    const out = buildHourlyReadings(
      input({ deterministic: deterministic([model(THERMAL_MODEL, [])]) }),
    )
    expect(out.unavailable_reason).toBe('model_unavailable')
  })
})

describe('the trailing history', () => {
  /**
   * The property `collect-runs`' `past_days` exists for. `T_mass` refuses a
   * series under 96 hours, so a run with only forecast hours scores nothing —
   * and that is a different answer from "these are bad days".
   */
  it('reports insufficient_history rather than a run of unscored hours', () => {
    const out = buildHourlyReadings(
      input({ deterministic: deterministic([model(THERMAL_MODEL, runHours(0, 48))]) }),
    )
    expect(out.unavailable_reason).toBe('insufficient_history')
    expect(out.hours).toEqual([])
  })

  it('scores once there is enough history behind the window', () => {
    const out = buildHourlyReadings(input())
    expect(out.unavailable_reason).toBeNull()
    expect(out.hours.some((h) => h.score !== null)).toBe(true)
  })

  /**
   * The history is an input, not output. A past hour that reached the response
   * would be a forecast surface showing yesterday — and worse, it would shift
   * every index if a client ever joined by position.
   */
  it('never returns an hour from before the window', () => {
    const out = buildHourlyReadings(input())
    const earliest = Math.min(...out.hours.map((h) => Date.parse(h.valid_at)))
    expect(earliest).toBeGreaterThanOrEqual(Date.parse('2026-09-21T00:00:00Z'))
    // And the 120 hours of history really were supplied — otherwise this test
    // passes for the wrong reason.
    expect(out.hours.length).toBeLessThan(120 + 48)
  })

  /**
   * The Precip tab draws the rock under the past week's rain, so the history
   * comes back — as the rock's state only, beside `hours` rather than in it.
   */
  it('returns the history before the window as rock state alone, in order', () => {
    const out = buildHourlyReadings(input())
    const history = out.rock_history ?? []
    // 120 hours back from 12:00 on the 21st: everything before its midnight.
    expect(history).toHaveLength(120 - 12)
    expect(history.every((h) => Date.parse(h.valid_at) < Date.parse('2026-09-21T00:00:00Z'))).toBe(true)
    expect(history.map((h) => h.valid_at)).toEqual([...history.map((h) => h.valid_at)].sort())
    // Nothing but the instant and the rock: a past hour carries no score.
    for (const h of history) expect(Object.keys(h).sort()).toEqual(['rock', 'valid_at'])
    // The window's own hours never repeat in the history.
    const inWindow = new Set(out.hours.map((h) => h.valid_at))
    expect(history.some((h) => inWindow.has(h.valid_at))).toBe(false)
  })

  it('keeps an hour the model could not read as null, never as dry', () => {
    const history = buildHourlyReadings(input()).rock_history ?? []
    // The first hours of the walk precede T_mass's span: there is no reading yet.
    expect(history[0]?.rock).toBeNull()
    expect(history.some((h) => h.rock !== null)).toBe(true)
  })

  it('reports rain in the history as wet rock', () => {
    // A soaking two days before NOW, inside the history.
    const hours = runHours(120, 48).map((h) =>
      h.valid_at.getTime() >= Date.parse('2026-09-19T08:00:00Z') && h.valid_at.getTime() <= Date.parse('2026-09-19T11:00:00Z')
        ? { ...h, rain_median_mm: 3, precip_mm: 3, humidity_pct: 95 }
        : h,
    )
    const out = buildHourlyReadings(
      input({ deterministic: deterministic([model(THERMAL_MODEL, hours, ['gfs_seamless', 'ecmwf_ifs025', 'icon_seamless'])]) }),
    )
    const at = (iso: string) => out.rock_history?.find((h) => h.valid_at === iso)?.rock?.level
    expect(at('2026-09-19T11:00:00.000Z')).toBe('wet')
    // Before that rain the clock was still running on its starting guess
    // ("it just rained"): wet or drying there would be the guess talking.
    const before = (out.rock_history ?? []).filter((h) => h.valid_at < '2026-09-19T08:00:00.000Z')
    expect(before.every((h) => h.rock === null || h.rock.level === 'dry')).toBe(true)
  })

  it('reads each whole day before the window by the forecast day rule, and leaves out the day the walk began in', () => {
    const out = buildHourlyReadings(input())
    // 120 hours back from 12:00 on the 21st starts at 12:00 on the 16th: that day is half a day.
    expect(out.past_days?.map((d) => d.local_date)).toEqual(['2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'])
    const last = out.past_days?.at(-1)
    expect(last?.rain_mm).toBe(0)
    expect(last?.temp_c_max).toBe(14)
    expect(last?.best?.rock?.level).toBe('dry')
    expect(last?.best?.score).not.toBeNull()
  })

  it('sums the day’s rain from the median the clock walked, and scores a soaked day wet', () => {
    const hours = runHours(120, 48).map((h) =>
      h.valid_at.getTime() >= Date.parse('2026-09-20T08:00:00Z') && h.valid_at.getTime() <= Date.parse('2026-09-20T18:00:00Z')
        ? { ...h, rain_median_mm: 3, precip_mm: 9, humidity_pct: 95 }
        : h,
    )
    const out = buildHourlyReadings(
      input({ deterministic: deterministic([model(THERMAL_MODEL, hours, ['gfs_seamless', 'ecmwf_ifs025', 'icon_seamless'])]) }),
    )
    const day = out.past_days?.find((d) => d.local_date === '2026-09-20')
    expect(day?.rain_mm).toBe(33)
    expect(day?.best?.rock?.level).toBe('wet')
  })

  it('withholds a day’s score while its rock still rests on the walk’s starting guess', () => {
    // Humid and sunless from the start, and no rain resets the clock. Every dry hour still
    // credits one (2026-11-02), so the guess lasts the rock's full window: 120 hours for
    // `sandstone`, which reaches past the 20th from the walk's start on the 16th.
    const hours = runHours(120, 48, { humidity_pct: 99, dewpoint_c: 13.9 })
    const out = buildHourlyReadings(input({ rockType: 'sandstone', deterministic: deterministic([model(THERMAL_MODEL, hours)]) }))
    // The 20th is past T_mass's span, so only the guess can withhold it.
    const day = out.past_days?.find((d) => d.local_date === '2026-09-20')
    expect(day?.best).toBeNull()
    expect(day?.rain_mm).toBe(0)
    // Granite's six-hour window is long worked off by then: the guess no longer holds it.
    const granite = buildHourlyReadings(input({ deterministic: deterministic([model(THERMAL_MODEL, hours)]) }))
    expect(granite.past_days?.find((d) => d.local_date === '2026-09-20')?.best?.rock?.level).toBe('dry')
  })

  it('credits rain stamped at midnight to the day that ended, since the stamp closes its hour', () => {
    const hours = runHours(120, 48).map((h) =>
      h.valid_at.toISOString() === '2026-09-20T00:00:00.000Z' ? { ...h, rain_median_mm: 5, precip_mm: 5 } : h,
    )
    const out = buildHourlyReadings(
      input({ deterministic: deterministic([model(THERMAL_MODEL, hours, ['gfs_seamless', 'ecmwf_ifs025', 'icon_seamless'])]) }),
    )
    const rain = (date: string) => out.past_days?.find((d) => d.local_date === date)?.rain_mm
    expect(rain('2026-09-19')).toBe(5)
    expect(rain('2026-09-20')).toBe(0)
  })

  it('leaves out a day the run is missing an hour of, rather than summing what is there', () => {
    const hours = runHours(120, 48).filter((h) => h.valid_at.toISOString() !== '2026-09-19T05:00:00.000Z')
    const out = buildHourlyReadings(input({ deterministic: deterministic([model(THERMAL_MODEL, hours)]) }))
    expect(out.past_days?.map((d) => d.local_date)).toEqual(['2026-09-17', '2026-09-18', '2026-09-20'])
  })

  it('withholds a figure when any hour of the day lacks it, never summing past a gap', () => {
    const hours = runHours(120, 48).map((h) =>
      h.valid_at.toISOString() === '2026-09-20T03:00:00.000Z' ? { ...h, rain_median_mm: null, temp_c: null } : h,
    )
    const out = buildHourlyReadings(
      input({ deterministic: deterministic([model(THERMAL_MODEL, hours, ['gfs_seamless', 'ecmwf_ifs025', 'icon_seamless'])]) }),
    )
    const day = out.past_days?.find((d) => d.local_date === '2026-09-20')
    expect(day?.rain_mm).toBeNull()
    expect(day?.temp_c_max).toBeNull()
    expect(day?.temp_c_min).toBeNull()
  })

  it('sends an empty history, not an absent one, when there are no readings', () => {
    const out = buildHourlyReadings(input({ deterministic: deterministic([model('gem_seamless', runHours(120, 48))]) }))
    expect(out.rock_history).toEqual([])
  })
})

describe('what reaches the response', () => {
  it('publishes the readings and the two measurements, and no factors', () => {
    const out = buildHourlyReadings(input())
    const hour = out.hours.find((h) => h.score !== null)
    expect(hour).toBeDefined()
    // The fence from the owner's decision: words and ordering, never a
    // magnitude. `diagnostics` exists on the internal type and must not survive
    // the projection.
    expect(Object.keys(hour!).sort()).toEqual([
      'condensation_margin_c',
      'friction',
      'held_back_by',
      'rock',
      'rock_sun_shade',
      'score',
      't_surface_c',
      'valid_at',
    ])
    // The penalties reach the response as names in order, never as their values.
    expect(hour!.held_back_by!.every((l) => typeof l === 'string')).toBe(true)
    // Two modelled temperatures, like t_surface_c — not factors.
    expect(Object.keys(hour!.rock_sun_shade ?? {}).sort()).toEqual(['shade_c', 'sun_c'])
  })

  it('carries one day entry per window date, in order, even for days it cannot score', () => {
    const out = buildHourlyReadings(input())
    expect(out.days.map((d) => d.local_date)).toEqual(DATES)
    // The model run only reaches 48 hours out; the later dates have no hours at
    // all and must still appear, saying so.
    const last = out.days[out.days.length - 1]!
    expect(last.best).toBeNull()
    expect(last.window).toBeNull()
  })

  it("picks the day's best hour server-side, not its first or its mean", () => {
    // One hour of the first day is made clearly worse by putting the wall below
    // its dew point. The day's `best` must not be it.
    const hours = runHours(120, 48)
    const bad = hours.find((h) => h.valid_at.toISOString() === '2026-09-21T15:00:00.000Z')!
    bad.dewpoint_c = 30

    const out = buildHourlyReadings(
      input({ deterministic: deterministic([model(THERMAL_MODEL, hours)]) }),
    )
    const day = out.days.find((d) => d.local_date === '2026-09-21')!
    expect(day.best).not.toBeNull()
    expect(day.best!.valid_at).not.toBe('2026-09-21T15:00:00.000Z')
    const worst = out.hours.find((h) => h.valid_at === '2026-09-21T15:00:00.000Z')!
    expect(day.best!.score!).toBeGreaterThan(worst.score!)
  })
})

describe('the day window', () => {
  it('finds a run of hours clearing the minimum', () => {
    const out = buildHourlyReadings(input())
    const day = out.days.find((d) => d.local_date === '2026-09-22')!
    expect(day.window).not.toBeNull()
    expect(day.window!.min_score).toBeGreaterThanOrEqual(DEFAULT_WINDOW_MIN_SCORE)
    expect(day.window!.hours).toBeGreaterThan(0)
  })

  it('reports no window on a day whose hours are all below the minimum', () => {
    // A wall sitting under its dew point all day: dry rock, no grip, no window.
    const out = buildHourlyReadings(
      input({
        deterministic: deterministic([
          model(THERMAL_MODEL, runHours(120, 48, { dewpoint_c: 30, temp_c: 14 })),
        ]),
      }),
    )
    const day = out.days.find((d) => d.local_date === '2026-09-22')!
    expect(day.window).toBeNull()
    expect(day.best!.friction!.condensing).toBe(true)
  })

  it('honours a caller-supplied minimum rather than the default', () => {
    const strict = buildHourlyReadings(input({ windowMinScore: 101 }))
    expect(strict.days.every((d) => d.window === null)).toBe(true)
    const loose = buildHourlyReadings(input({ windowMinScore: 0 }))
    expect(loose.days.some((d) => d.window !== null)).toBe(true)
  })

  /**
   * A dry morning that has already passed must not carry a wet afternoon.
   * NOW is 12:00; rain from 12:00 on leaves no hour still to come that clears
   * the minimum, so today has no window and its score comes from after NOW.
   */
  it('counts only the hours not yet over for today', () => {
    const hours = runHours(120, 48).map((h) =>
      h.valid_at.getTime() >= NOW.getTime() ? { ...h, precip_mm: 3 } : h,
    )
    const out = buildHourlyReadings(
      input({ deterministic: deterministic([model(THERMAL_MODEL, hours, null)]) }),
    )
    const today = out.days.find((d) => d.local_date === '2026-09-21')!
    expect(today.window).toBeNull()
    expect(Date.parse(today.best!.valid_at)).toBeGreaterThanOrEqual(NOW.getTime())
    expect(today.best!.rock!.level).not.toBe('dry')
    // The past hours are still published for the charts.
    expect(out.hours.some((h) => h.valid_at === '2026-09-21T09:00:00.000Z')).toBe(true)
  })
})

describe('the rain the drying clock reads (issue #209)', () => {
  const RAIN_MODELS = ['gfs_seamless', 'ecmwf_ifs025', 'icon_seamless', 'gem_seamless']
  const RAINED = new Set(['2026-09-21T09:00:00.000Z', '2026-09-21T10:00:00.000Z'])
  /** Heavy rain at 09:00-10:00 in one column and none in the other. */
  const hoursWithRainIn = (column: 'precip_mm' | 'rain_median_mm'): RunHour[] =>
    runHours(120, 48).map((h) =>
      RAINED.has(h.valid_at.toISOString()) ? { ...h, [column]: 6 } : h,
    )
  const rockAt = (out: ReturnType<typeof buildHourlyReadings>, iso: string) =>
    out.hours.find((h) => h.valid_at === iso)?.rock?.level

  it('reads the median and names its models, ignoring the thermal model’s own rain', () => {
    const wetMedian = buildHourlyReadings(
      input({ deterministic: deterministic([model(THERMAL_MODEL, hoursWithRainIn('rain_median_mm'), RAIN_MODELS)]) }),
    )
    const wetOwn = buildHourlyReadings(
      input({ deterministic: deterministic([model(THERMAL_MODEL, hoursWithRainIn('precip_mm'), RAIN_MODELS)]) }),
    )
    expect(rockAt(wetMedian, '2026-09-21T12:00:00.000Z')).not.toBe('dry')
    expect(rockAt(wetOwn, '2026-09-21T12:00:00.000Z')).toBe('dry')
    expect(wetMedian.rain_models).toEqual(RAIN_MODELS)
    // The rock figures still come from one model; only the rain was pooled.
    expect(wetMedian.model).toBe(THERMAL_MODEL)
  })

  it('reads the run’s own rain whole, and names only it, when the run carries no median', () => {
    const out = buildHourlyReadings(
      input({ deterministic: deterministic([model(THERMAL_MODEL, hoursWithRainIn('precip_mm'), null)]) }),
    )
    expect(rockAt(out, '2026-09-21T12:00:00.000Z')).not.toBe('dry')
    expect(out.rain_models).toEqual([THERMAL_MODEL])
  })

  /**
   * A missing median is a gap. Filling it with the thermal model's own rain
   * would mix two sources under one `rain_models`, and the thermal model is
   * the one measured to miss most rain.
   */
  it('withholds after an hour with no median rather than falling back to the run’s own rain', () => {
    const hours = runHours(120, 48).map((h) =>
      h.valid_at.toISOString() === '2026-09-21T10:00:00.000Z' ? { ...h, rain_median_mm: null } : h,
    )
    const out = buildHourlyReadings(
      input({ deterministic: deterministic([model(THERMAL_MODEL, hours, RAIN_MODELS)]) }),
    )
    expect(out.hours.find((h) => h.valid_at === '2026-09-21T11:00:00.000Z')?.rock).toBeNull()
  })
})

describe('radar overrules the median (owner, 2026-11-02)', () => {
  const RAIN_MODELS = ['gfs_seamless', 'ecmwf_ifs025', 'icon_seamless', 'gem_seamless']
  /** The median put 6 mm at 09:00 and 10:00; the rock reads wet at noon without radar. */
  const wetMedianHours = runHours(120, 48).map((h) =>
    ['2026-09-21T09:00:00.000Z', '2026-09-21T10:00:00.000Z'].includes(h.valid_at.toISOString())
      ? { ...h, rain_median_mm: 6 }
      : h,
  )
  /** Radar read every hour from 120 h back to `last`, all at `mm`. */
  const radarUpTo = (last: Date, mm: number) => {
    const m = new Map<number, number | null>()
    for (let t = NOW.getTime() - 120 * 3_600_000; t <= last.getTime(); t += 3_600_000) m.set(t, mm)
    return m
  }
  const build = (radarRain: ReadonlyMap<number, number | null> | null) =>
    buildHourlyReadings(
      input({ deterministic: deterministic([model(THERMAL_MODEL, wetMedianHours, RAIN_MODELS)]), radarRain }),
    )
  const rockAtNoon = (out: ReturnType<typeof buildHourlyReadings>) =>
    out.hours.find((h) => h.valid_at === '2026-09-21T12:00:00.000Z')?.rock?.level

  it('reads the rock dry where radar saw no rain, and says radar decided', () => {
    const out = build(radarUpTo(NOW, 0))
    expect(rockAtNoon(out)).toBe('dry')
    expect(out.rain_radar).toBe(true)
    expect(out.rain_models).toEqual(RAIN_MODELS)
  })

  /**
   * Radar saw a trace where the models put 6 mm. Radar alone would read the
   * rock dry at noon; the rule keeps the models' rain, so it stays wet.
   */
  it('keeps the models’ rain where radar saw only a trace of it', () => {
    const trace = radarUpTo(NOW, 0)
    for (const iso of ['2026-09-21T09:00:00.000Z', '2026-09-21T10:00:00.000Z']) trace.set(Date.parse(iso), 0.1)
    const radarOnly = buildHourlyReadings(
      input({
        deterministic: deterministic([
          model(
            THERMAL_MODEL,
            wetMedianHours.map((h) => ({ ...h, rain_median_mm: trace.get(h.valid_at.getTime()) ?? h.rain_median_mm })),
            RAIN_MODELS,
          ),
        ]),
      }),
    )
    expect(rockAtNoon(radarOnly)).toBe('dry')
    const out = build(trace)
    expect(rockAtNoon(out)).not.toBe('dry')
    expect(out.rain_radar).toBe(true)
  })

  it('reads the median alone without radar, and with radar that stops before the rain', () => {
    expect(rockAtNoon(build(null))).not.toBe('dry')
    expect(build(null).rain_radar).toBe(false)
    expect(rockAtNoon(build(radarUpTo(new Date('2026-09-21T06:00:00Z'), 0)))).not.toBe('dry')
  })

  it('never checks a run’s own rain, which the rule was not measured on', () => {
    const own = runHours(120, 48).map((h) =>
      h.valid_at.toISOString() === '2026-09-21T10:00:00.000Z' ? { ...h, precip_mm: 6 } : h,
    )
    const out = buildHourlyReadings(
      input({ deterministic: deterministic([model(THERMAL_MODEL, own, null)]), radarRain: radarUpTo(NOW, 0) }),
    )
    expect(rockAtNoon(out)).not.toBe('dry')
    expect(out.rain_radar).toBe(false)
  })
})

/**
 * `rain_split`: each good day's weather models that leave the rock wet. The
 * thermal run carries the median (zero here); each model's own rain is what
 * splits the count. The fixture's shower lands on the 22nd at 04:00-06:00,
 * before the day's climbing hours, heavy enough that a model with it reads the
 * rock wet through the morning — and the median of four models, two of them
 * dry, never sees it.
 */
describe('rain_split', () => {
  const RAIN = ['gfs_seamless', 'ecmwf_ifs025', 'icon_seamless', 'gem_seamless']
  const shower = (hours: RunHour[]): RunHour[] =>
    hours.map((h) => {
      const iso = h.valid_at.toISOString()
      return iso >= '2026-09-22T04' && iso < '2026-09-22T07' ? { ...h, precip_mm: 8 } : h
    })
  const thermal = (rain = false) => model(THERMAL_MODEL, rain ? shower(runHours(120, 48)) : runHours(120, 48), RAIN)
  const other = (name: string, rain = false) => model(name, rain ? shower(runHours(12, 48)) : runHours(12, 48))
  const day = (out: ReturnType<typeof buildHourlyReadings>, date: string) => out.days.find((d) => d.local_date === date)

  it('counts the models whose own rain leaves a good day wet', () => {
    const out = buildHourlyReadings(
      input({
        rainSplit: true, rockType: 'sandstone',
        deterministic: deterministic([thermal(), other('ecmwf_ifs025'), other('icon_seamless', true), other('gem_seamless', true)]),
      }),
    )
    const d = day(out, '2026-09-22')!
    expect(d.best?.score ?? 0).toBeGreaterThanOrEqual(80)
    expect(d.rain_split).toEqual({ wet: 2, models: 4 })
  })

  it('is left off when the caller did not ask', () => {
    const out = buildHourlyReadings(
      input({ rockType: 'sandstone', deterministic: deterministic([thermal(), other('ecmwf_ifs025'), other('icon_seamless', true), other('gem_seamless', true)]) }),
    )
    expect(day(out, '2026-09-22')).not.toHaveProperty('rain_split')
  })

  it('counts three models when one did not answer, and withholds with two', () => {
    const three = buildHourlyReadings(
      input({ rainSplit: true, rockType: 'sandstone', deterministic: deterministic([thermal(), other('icon_seamless', true), other('gem_seamless', true)]) }),
    )
    expect(day(three, '2026-09-22')!.rain_split).toEqual({ wet: 2, models: 3 })

    const two = buildHourlyReadings(
      input({ rainSplit: true, rockType: 'sandstone', deterministic: deterministic([thermal(), other('icon_seamless', true)]) }),
    )
    expect(day(two, '2026-09-22')!.rain_split).toBeNull()
  })

  it('withholds a model whose rain has a gap, never reading it as dry', () => {
    const gappy = model(
      'ecmwf_ifs025',
      runHours(12, 48).map((h) => (h.valid_at.toISOString().startsWith('2026-09-22T10') ? { ...h, precip_mm: null } : h)),
    )
    const out = buildHourlyReadings(
      input({ rainSplit: true, rockType: 'sandstone', deterministic: deterministic([thermal(), gappy, other('icon_seamless', true), other('gem_seamless', true)]) }),
    )
    expect(day(out, '2026-09-22')!.rain_split).toEqual({ wet: 2, models: 3 })
  })

  it('reads the week before today as the median, not each model', () => {
    const pastShower = (name: string) =>
      model(
        name,
        runHours(120, 48).map((h) => (h.valid_at.toISOString().startsWith('2026-09-20T1') ? { ...h, precip_mm: 30 } : h)),
      )
    const out = buildHourlyReadings(
      input({
        rainSplit: true, rockType: 'sandstone',
        deterministic: deterministic([thermal(), pastShower('ecmwf_ifs025'), pastShower('icon_seamless'), pastShower('gem_seamless')]),
      }),
    )
    expect(day(out, '2026-09-21')!.rain_split).toEqual({ wet: 0, models: 4 })
  })

  it('is null on a day the median itself scores under 80', () => {
    const wetMedian = model(
      THERMAL_MODEL,
      runHours(120, 48).map((h) => (h.valid_at.toISOString().startsWith('2026-09-22T0') ? { ...h, rain_median_mm: 8 } : h)),
      RAIN,
    )
    const out = buildHourlyReadings(
      input({ rainSplit: true, rockType: 'sandstone', deterministic: deterministic([wetMedian, other('ecmwf_ifs025', true), other('icon_seamless', true), other('gem_seamless', true)]) }),
    )
    const d = day(out, '2026-09-22')!
    expect(d.best?.score ?? 0).toBeLessThan(80)
    expect(d.rain_split).toBeNull()
  })
})
