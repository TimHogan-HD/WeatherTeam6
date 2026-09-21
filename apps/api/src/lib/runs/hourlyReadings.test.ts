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
      ...over,
    })
  }
  return out
}

function model(name: string, hours: RunHour[]): ModelRun {
  return { model: name, hours, probability_is_shared: false }
}

function deterministic(models: ModelRun[]): DeterministicRuns {
  return {
    models,
    unavailable_models: [],
    utc_offset_seconds: OFFSET,
    fetched_at: NOW,
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
  cliffAngleDeg: 0,
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
      'rock',
      'score',
      't_surface_c',
      'valid_at',
    ])
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
})
