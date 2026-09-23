/**
 * **Stored runs → the v2 model's two readings.** Phase 3a of
 * `docs/handoffs/weatherteam6-scoring-model-handoff-v1.md`.
 *
 * Pure. Every input is data and every output is data, which is the only reason
 * any of this is reachable from the test suite — same rule as
 * `hourlySeries.ts`, which it sits beside.
 *
 * ## Three things this file exists to get right
 *
 * **1. The readings come from one model, and it is not necessarily the one on
 * screen.** `buildHourlySeries` picks its deterministic model by measured
 * coverage; irradiance may not be pooled or substituted (issue #155 —
 * `gem_seamless` reports shortwave ~3× too high past day 4). So the readings
 * are derived from `THERMAL_MODEL` alone and the response **names it**, because
 * a surface that attributed a reading to the model heading the weather columns
 * would be claiming something the data does not support (`defect-patterns.md`
 * §3). When that model did not answer at this point, there are no readings and
 * the reason says so — the weather columns are unaffected.
 *
 * **2. The history is used and then thrown away.** `T_mass` needs ~4 days of
 * trailing air temperature, so the model walks **every stored hour**, including
 * the past ones `collect-runs` now keeps. The published series is windowed to
 * today onward, so the past hours feed the calculation and never reach the
 * response.
 *
 * **3. Nothing is joined by position.** Readings are matched to hours by
 * instant. `hourlySeries.ts` builds its axis from the union of two sources and
 * this one from a single model's rows; positional alignment would hold until
 * the first hour one side dropped and then misattribute every reading after it
 * while still looking plausible. Same rule as the per-day score join in
 * `computeLiveForecast`.
 */
import type {
  ConditionsWindow,
  HourlyReading,
  HourlyReadings,
  ReadingsDay,
  ReadingsUnavailableReason,
  RockType,
} from '@weatherteam6/types'
import {
  bestWindow,
  evaluateHourlyConditions,
  type HourlyConditions,
  type WeatherHour,
} from '../scoring/hourlyConditions.js'
import { localDateString } from '../weather/openMeteo.js'
import type { DeterministicRuns, ModelRun } from './latestRuns.js'
import type { WallOrientation } from '../scoring/rockThermal.js'

/**
 * **The one model the thermal layer reads, and it is not a preference.**
 *
 * Issue #155, decided in Phase 1: `gem_seamless` reports shortwave ~3× too high
 * past day 4 — 2847 W/m² against GFS's 946 at the same hour, where the physical
 * surface maximum is near 1100 — and a mean across the four carries the error at
 * half weight. GFS is global, has the longest measured shortwave horizon (384 h)
 * and agrees with ECMWF and ICON.
 *
 * Changing this is a decision about which model's irradiance to trust, not a
 * configuration detail.
 */
export const THERMAL_MODEL = 'gfs_seamless'

/**
 * The minimum score an hour needs to be in a day's window.
 *
 * **A placeholder for a user preference, and labelled as one.** Layer 5 of the
 * handoff moves "the minimum readings that define a window" into
 * `user_preferences`, which is Phase 5. Until then every location uses the same
 * number and it is a judgement call: 60 is the bottom of `SCORE_BANDS.mostlyDry`,
 * so the window means "hours this model would call mostly dry or better" rather
 * than a threshold invented for the purpose.
 */
export const DEFAULT_WINDOW_MIN_SCORE = 60

export type BuildReadingsInput = {
  deterministic: DeterministicRuns
  /** The local dates the published series covers, in order. */
  dates: readonly string[]
  utcOffsetSeconds: number
  rockType: RockType
  /**
   * Stored convention: 0 = vertical wall, 90 = flat slab. **Null means nobody
   * has recorded it**, and the caller decides what to substitute — this module
   * will not invent one, because a defaulted angle that reads like a
   * measurement is the defect class this repo ships most often.
   */
  cliffAngleDeg: number
  /** The recorded wall, or null. See `EvaluateSeriesOptions.wall`. */
  wall?: WallOrientation | null
  windowMinScore?: number
}

const none = (reason: ReadingsUnavailableReason): HourlyReadings => ({
  model: null,
  unavailable_reason: reason,
  hours: [],
  days: [],
})

/** The published projection of an evaluated hour — readings and measurements, no factors. */
function toReading(h: HourlyConditions): HourlyReading {
  return {
    valid_at: h.valid_at,
    rock: h.rock,
    friction: h.friction,
    score: h.score,
    t_surface_c: h.t_surface_c,
    condensation_margin_c: h.condensation_margin_c,
  }
}

function toWeatherHours(model: ModelRun): WeatherHour[] {
  return [...model.hours]
    .sort((a, b) => a.valid_at.getTime() - b.valid_at.getTime())
    .map((h) => ({
      valid_at: h.valid_at.toISOString(),
      air_temp_c: h.temp_c,
      dewpoint_c: h.dewpoint_c,
      wind_kmh: h.wind_kmh,
      cloud_pct: h.cloud_pct,
      shortwave_wm2: h.shortwave_wm2,
      precip_mm: h.precip_mm,
    }))
}

/**
 * Build the readings block for a published window.
 *
 * Returns a **reason** rather than an empty block when it cannot answer, so a
 * surface can say *"no reading"* for the right cause instead of rendering an
 * absence as a good day. `insufficient_history` in particular is expected right
 * after a location is added and until `collect-runs` has stored trailing hours
 * for it — a real state, not an error.
 */
export function buildHourlyReadings(input: BuildReadingsInput): HourlyReadings {
  const model = input.deterministic.models.find((m) => m.model === THERMAL_MODEL)
  if (model === undefined || model.hours.length === 0) return none('model_unavailable')

  const evaluated = evaluateHourlyConditions(toWeatherHours(model), {
    rockType: input.rockType,
    cliffAngleDeg: input.cliffAngleDeg,
    wall: input.wall ?? null,
  })

  // Every hour, past and future, went into the calculation. Only the published
  // window comes back out.
  const inWindow = new Set(input.dates)
  const windowed = evaluated.filter((h) =>
    inWindow.has(localDateString(new Date(h.valid_at), input.utcOffsetSeconds)),
  )

  // `T_mass` refuses a series shorter than its own minimum span, so a run with
  // no trailing history scores nothing at all. That is a different answer from
  // "the model says this is a bad day" and it gets its own reason.
  if (!windowed.some((h) => h.score !== null)) return none('insufficient_history')

  const minScore = input.windowMinScore ?? DEFAULT_WINDOW_MIN_SCORE
  const byDate = new Map<string, HourlyConditions[]>()
  for (const h of windowed) {
    const date = localDateString(new Date(h.valid_at), input.utcOffsetSeconds)
    const list = byDate.get(date) ?? []
    list.push(h)
    byDate.set(date, list)
  }

  const days: ReadingsDay[] = input.dates.map((local_date) => {
    const dayHours = byDate.get(local_date) ?? []
    const window: ConditionsWindow | null = bestWindow(dayHours, { score: minScore })

    /**
     * The day's representative hour is its **highest-scoring** one, chosen
     * server-side so the bot and the Mini App cannot pick differently. A mean
     * would be the wrong answer for the same reason a daily score was: a
     * morning window is the thing a climber acts on, and averaging it with a
     * baking afternoon describes neither.
     */
    let best: HourlyConditions | null = null
    for (const h of dayHours) {
      if (h.score === null) continue
      if (best === null || h.score > (best.score ?? -1)) best = h
    }

    return { local_date, window, best: best === null ? null : toReading(best) }
  })

  return {
    model: THERMAL_MODEL,
    unavailable_reason: null,
    hours: windowed.map(toReading),
    days,
  }
}
