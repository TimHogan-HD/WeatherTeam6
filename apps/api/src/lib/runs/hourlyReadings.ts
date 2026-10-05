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
  RockHistoryHour,
  RockType,
} from '@weatherteam6/types'
import {
  bestWindow,
  SIGNIFICANT_HOURLY_PRECIP_MM,
  type HourlyConditions,
  type WeatherHour,
} from '../scoring/hourlyConditions.js'
import {
  dayRepresentative,
  evaluateCragA,
  heldBackBy,
  type CragAHour,
  type TempRangeC,
} from '../scoring/cragModel.js'
import { localDateString } from '../weather/openMeteo.js'
import type { DeterministicRuns, ModelRun } from './latestRuns.js'

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
   * The location itself — Crag A places its eight walls here. There is no
   * aspect or angle input: a location's score is its crag's, and a recorded
   * wall never replaces it (`evaluateWallA` scores walls, separately).
   */
  lat: number
  lon: number
  /**
   * Today's window and score count only the hours not yet over. An hour that
   * has passed stays in `hours` for the charts but cannot carry the day: at
   * 15:00 in the rain, a dry 10:00 is not today's answer.
   */
  now: Date
  windowMinScore?: number
  /** The reader's temperature range for friction (`user_preferences`); absent is Crag A's own. */
  range?: TempRangeC
}

const none = (reason: ReadingsUnavailableReason): HourlyReadings => ({
  model: null,
  rain_models: null,
  unavailable_reason: reason,
  hours: [],
  days: [],
  rock_history: [],
})

/** The published projection of an evaluated hour — readings, measurements and the penalties' order, no factors. */
function toReading(h: CragAHour): HourlyReading {
  return {
    valid_at: h.valid_at,
    rock: h.rock,
    friction: h.friction,
    score: h.score,
    t_surface_c: h.t_surface_c,
    condensation_margin_c: h.condensation_margin_c,
    held_back_by: heldBackBy(h.diagnostics.penalties),
    rock_sun_shade: h.rock_sun_shade,
  }
}

/**
 * **The drying clock's rain is the global models' hourly median** whenever the
 * run carries one (`lib/weather/rainMedian.ts`, issue #209). An hour the median
 * could not be formed for is a gap, and the clock withholds from it. A run
 * stored before the median existed has none, and reads its own rain whole —
 * never mixed hour by hour, so `rain_models` can name one source.
 */
function toWeatherHours(model: ModelRun): WeatherHour[] {
  const median = model.rain_models !== null
  return [...model.hours]
    .sort((a, b) => a.valid_at.getTime() - b.valid_at.getTime())
    .map((h) => ({
      valid_at: h.valid_at.toISOString(),
      air_temp_c: h.temp_c,
      dewpoint_c: h.dewpoint_c,
      wind_kmh: h.wind_kmh,
      cloud_pct: h.cloud_pct,
      shortwave_wm2: h.shortwave_wm2,
      precip_mm: median ? h.rain_median_mm : h.precip_mm,
    }))
}

/**
 * The rock's state for the hours before the window — walked for `T_mass` and,
 * until the Precip tab wanted them, thrown away. Rock state only.
 *
 * **An hour is published only once its state no longer rests on the walk's
 * starting assumption.** The drying clock begins the walk at zero hours dried
 * — "it just rained" — because it cannot see further back. Until rain resets
 * it inside the walk, a wet or drying hour says as much about that assumption
 * as about the weather, so it goes out as `null`, a gap. A `dry` hour stands:
 * starting the clock drier could only have left it dry. Measured on the first
 * fixture: without this, the first days of every history read wet.
 */
function historyRock(
  evaluated: readonly HourlyConditions[],
  weather: readonly WeatherHour[],
  input: BuildReadingsInput,
): RockHistoryHour[] {
  const firstDate = input.dates[0]
  if (firstDate === undefined) return []
  const rainAt = new Map(weather.map((w) => [w.valid_at, w.precip_mm]))
  let reset = false
  const out: RockHistoryHour[] = []
  for (const h of evaluated) {
    if (localDateString(new Date(h.valid_at), input.utcOffsetSeconds) >= firstDate) break
    const mm = rainAt.get(h.valid_at) ?? null
    if (mm !== null && mm >= SIGNIFICANT_HOURLY_PRECIP_MM) reset = true
    const known = h.rock !== null && (reset || h.rock.level === 'dry')
    out.push({ valid_at: h.valid_at, rock: known ? h.rock : null })
  }
  return out
}

/**
 * Build the readings block for a published window.
 *
 * Returns a **reason** rather than an empty block when it cannot answer, so a
 * surface can say *"no reading"* for the right cause instead of rendering an
 * absence as a good day. `insufficient_history` means the thermal run came back
 * without the trailing hours `T_mass` needs. A new place is fetched with them
 * (`deterministicFetch.ts`, #176), so this is upstream returning less than was
 * asked for — a real state, not an error.
 */
export function buildHourlyReadings(input: BuildReadingsInput): HourlyReadings {
  const model = input.deterministic.models.find((m) => m.model === THERMAL_MODEL)
  if (model === undefined || model.hours.length === 0) return none('model_unavailable')

  // Crag A (`cragModel.ts`): the crag's score, whatever wall the location records.
  const weather = toWeatherHours(model)
  const evaluated = evaluateCragA(weather, {
    rockType: input.rockType,
    lat: input.lat,
    lon: input.lon,
    ...(input.range === undefined ? {} : { range: input.range }),
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
  const byDate = new Map<string, CragAHour[]>()
  const firstOpenHourMs = input.now.getTime() - 3_600_000
  for (const h of windowed) {
    if (Date.parse(h.valid_at) <= firstOpenHourMs) continue
    const date = localDateString(new Date(h.valid_at), input.utcOffsetSeconds)
    const list = byDate.get(date) ?? []
    list.push(h)
    byDate.set(date, list)
  }

  const days: ReadingsDay[] = input.dates.map((local_date) => {
    const dayHours = byDate.get(local_date) ?? []
    const window: ConditionsWindow | null = bestWindow(dayHours, { score: minScore })

    /**
     * The day's representative hour is the worst hour of its best three-hour
     * daytime run (`dayRepresentative`), chosen server-side so no two surfaces
     * can pick differently. Its score is the day's score. The single best hour
     * it replaced let one mild 8 am hour carry a hot day.
     */
    const best = dayRepresentative(dayHours, input.utcOffsetSeconds)

    return { local_date, window, best: best === null ? null : toReading(best) }
  })

  const rock_history = historyRock(evaluated, weather, input)

  return {
    model: THERMAL_MODEL,
    rain_models: model.rain_models === null ? [THERMAL_MODEL] : [...model.rain_models],
    unavailable_reason: null,
    hours: windowed.map(toReading),
    days,
    rock_history,
  }
}
