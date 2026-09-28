/**
 * **Layers 2, 3 and 4 of the v2 scoring model — the two readings, the number
 * derived from them, and the day's window.** Phase 2 of
 * `docs/handoffs/weatherteam6-scoring-model-handoff-v1.md`.
 *
 * Pure functions over Layer 1 (`rockThermal.ts`, `sweatBalance.ts`). No
 * database, no network, no Express, no clock.
 *
 * **This module is what every screen now reads** (Phase 3, shipped 2026-09-21).
 * Its readings reach `GET /hourly/:id` and `GET /conditions/:id`, the bot's
 * panel and the Mini App, through `summarizeReadings` in `packages/types`.
 * `stateLabel` and the ladder it drove are deleted; `SCORE_BANDS` survives as
 * the colour rungs. The five-component scorer still runs and is rendered
 * nowhere — Phase 5 deletes it.
 * `npm run compare:scoring --workspace=apps/api` is where the two can be
 * compared side by side.
 *
 * ## The shape, and why it makes a veto unnecessary
 *
 * ```
 * score = 100 × wetness^w × friction^f          w + f = 1
 * ```
 *
 * Two factors, both 0-1 continuous versions of the readings above them, and they
 * multiply. There is **no cap, no veto and no clamp on the total** anywhere in
 * this file — the thing issue #21 kept trying to bolt on is what a product does
 * on its own. A factor near zero drags the result down because that is what
 * multiplication is, not because a rule says so.
 *
 * The two guards that look like clamps and are not:
 *
 * - `wetnessFactor` saturates at 1 when the rock has finished drying. That is
 *   the top of a ramp, not a cap on a score: the rock is dry and cannot become
 *   drier.
 * - `condensationFactor` reaches 0 at the dew point. A wall below its dew point
 *   cannot read better than `poor` — and that falls out of it being wet, rather
 *   than being legislated on top.
 *
 * ## What this model deliberately does not say
 *
 * **There is no cold penalty.** A −10 °C day reads as perfect friction here,
 * because both mechanisms the friction reading is built from — water on the rock
 * and sweat on the hand — genuinely improve as it gets colder. Numb fingers are
 * real and are not in this model; they are a property of the climber, not the
 * rock. The old scorer docked 12 points below −5 °C from a band nobody measured
 * (`scoring-findings.md` §4). **This is a reviewable gap, printed by
 * `compare:scoring` as its own row**, not an oversight — if the answer is that
 * cold should cost something, it needs a mechanism rather than a band.
 *
 * **There is no `upcoming_rain` component.** Deleted rather than reweighted, per
 * the handoff: with hourly scoring, rain falling at 6pm lowers the 6pm hours and
 * leaves the morning alone. A 72-hour lookahead inside a per-day score was a
 * trip-planning number in the wrong place, and since #108 each day's own rain
 * already reaches that day's drying clock.
 *
 * ## Nullability is the whole safety property
 *
 * Every reading and the score itself withhold rather than degrade
 * (`defect-patterns.md` §1, issue #34). `score: null` here means an input could
 * not be measured — it is **never** 0, and 0 is a real score meaning the wall is
 * running with water. A caller that renders these must keep the two apart.
 */
import type { RockType } from '@weatherteam6/types'
import { MAX_HOURS, MIN_HOURS } from './dryingModel.js'
import {
  MASS_TAU_HOURS,
  condensationMarginC,
  dryingRateMultiplier,
  isCondensing,
  massTemperatureC,
  surfaceTemperature,
  type MassTemperatureOptions,
  type WallOrientation,
} from './rockThermal.js'
import { skinWettedness, sweatFrictionFactor } from './sweatBalance.js'

export type RockLevel = 'wet' | 'drying' | 'dry'
export type FrictionLevel = 'poor' | 'fair' | 'good' | 'great'

export type Reading = { level: RockLevel; qualified: boolean }
export type Friction = { level: FrictionLevel; condensing: boolean; qualified: boolean }

/**
 * Weights on the two factors. **A judgement call, recorded as one**, in the same
 * register as `RAMP_EXPONENT`.
 *
 * `0.55 / 0.45` is the handoff's default and **Open Question 1 is decided at the
 * Phase 2 stop, not here.** `compare:scoring` prints this split beside
 * `0.50/0.50` and `0.65/0.35` over the same scenarios so the choice is made
 * looking at what each does to 104 °F, to a damp wall in great friction and to a
 * mediocre day.
 */
export const DEFAULT_WEIGHTS = { wetness: 0.55, friction: 0.45 } as const

export type ScoreWeights = { wetness: number; friction: number }

/**
 * Curvature of the wetness ramp. **Inherited from issue #137, and it is the same
 * judgement call it was there** — the research settles the *shape* and nobody
 * has measured a drying curve for any climbing rock.
 *
 * Above 1 awards credit slowly at first, because rock strength returns late:
 * *"much of the weakening, if present, occurs at low moisture contents"* (Duda &
 * Renner, GJI, read at first hand). `1` restores the pre-#137 linear ramp and
 * below 1 inverts the finding into something worse.
 *
 * It is a second copy of `conditionsScore.ts`'s constant rather than an import
 * because that module is deleted in Phase 5 and this one outlives it. The two
 * agreeing today is asserted by `hourlyConditions.test.ts`; when v1 goes, so
 * does the assertion, and this becomes the only copy.
 */
export const WETNESS_RAMP_EXPONENT = 2

/**
 * Margin above the dew point at which condensation stops costing anything, °C.
 *
 * At a margin of 0 the wall is at the dew point and the factor is 0; at this
 * margin and beyond it is 1. Linear between, so there is no step anywhere.
 *
 * **A judgement call.** 2 °C is the order of the disagreement between forecast
 * models on dew point, so a wall within that of its dew point is a wall we
 * cannot confidently call dry. Nothing measured it.
 */
export const CONDENSATION_CLEAR_MARGIN_C = 2

/**
 * Friction level boundaries on the 0-1 factor.
 *
 * **Judgement calls, and they are the words rather than the number** — the
 * factor is what the score is built from, and these only decide which of four
 * labels a surface prints. Chosen so an ordinary settled day reads `great`, a
 * warm sunny one `fair`, and a wall at its dew point `poor`. `compare:scoring`
 * prints the factor beside the label so a boundary can be argued about.
 */
export const FRICTION_BANDS = { fair: 0.35, good: 0.6, great: 0.85 } as const

/**
 * Hourly precipitation that re-wets a wall, mm.
 *
 * **Lower than `dryingModel`'s 2 mm/day, deliberately, and it is a real
 * behaviour change.** That threshold exists because a daily total cannot tell a
 * passing shower from a day of drizzle; an hourly series can, and a wall gets
 * wet from any rain that reaches it. 0.5 mm in an hour is visible rain.
 *
 * The consequence is that the v2 rock reading resets on showers the v1 one
 * ignored, which reads wetter. That is the safe direction and it is the correct
 * one, but it is a change worth seeing rather than discovering:
 * `compare:scoring` says so in its notes.
 */
export const SIGNIFICANT_HOURLY_PRECIP_MM = 0.5

/**
 * A domain guard, **not a cap on anything**. Every factor in this file is
 * already 0-1 by construction; this stops a caller handing `derivedScore` a
 * number outside the domain where `x^0.45` is defined and real. It is named
 * here because "no cap, veto or clamp" is an acceptance criterion for this
 * model and a reader is entitled to check it: nothing in this file limits a
 * *score*, and removing every call below would change no output the model
 * produces.
 */
function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/**
 * `dryingModel`'s angle factor, shared so the two cannot drift: 0° vertical is
 * the base, a 90° slab takes 30% longer.
 *
 * **An overhang (negative `cliff_angle`, Phase 4b) takes the vertical base, not
 * less.** Extending the line past 0 would dry a roof 30% faster than a vertical
 * wall — a magnitude nobody measured, and an inflation (issue #34). Overhangs
 * are drier because rain does not reach them, which is a wetting question
 * (§18.1's catch ratio) this model does not ask, not a faster clock.
 */
export function dryingAngleFactor(cliffAngleDeg: number): number {
  return 1.0 + (Math.min(Math.max(cliffAngleDeg, 0), 90) / 90) * 0.3
}

/** The rock's drying window for a type and tilt, in reference-equivalent hours. */
export function dryingWindowHours(
  rockType: RockType,
  cliffAngleDeg: number,
): { minHours: number; maxHours: number } {
  // Same angle factor as `dryingModel`: 0° vertical is the base, 90° slab takes
  // 30% longer. Duplicating the expression rather than the table, because the
  // table is now imported and cannot drift.
  const angleFactor = dryingAngleFactor(cliffAngleDeg)
  return {
    minHours: MIN_HOURS[rockType] * angleFactor,
    maxHours: MAX_HOURS[rockType] * angleFactor,
  }
}

/**
 * **How dry the rock is, 0-1**, from reference-equivalent drying hours against
 * the rock type's own window.
 *
 * `effectiveHours` is `rockThermal.effectiveDryingHours` — elapsed time with the
 * clock running at a rate set by sun, wind and vapour-pressure deficit rather
 * than flat. The rock-type window it is measured against is unchanged and still
 * means what it meant: the absorptive capacity, and **still folklore**
 * (`scoring-findings.md` §4). Physics on top of folklore is not precision.
 */
export function wetnessFactor(
  effectiveHours: number | null,
  rockType: RockType,
  cliffAngleDeg: number,
): number | null {
  if (effectiveHours === null || !Number.isFinite(effectiveHours)) return null
  if (!Number.isFinite(cliffAngleDeg)) return null
  const { maxHours } = dryingWindowHours(rockType, cliffAngleDeg)
  if (!(maxHours > 0)) return null
  if (effectiveHours <= 0) return 0
  if (effectiveHours >= maxHours) return 1
  return Math.pow(effectiveHours / maxHours, WETNESS_RAMP_EXPONENT)
}

/** `wet` below the rock type's `MIN_HOURS`, `dry` at or past its `MAX_HOURS`. */
export function rockLevel(
  effectiveHours: number | null,
  rockType: RockType,
  cliffAngleDeg: number,
): RockLevel | null {
  if (effectiveHours === null || !Number.isFinite(effectiveHours)) return null
  const { minHours, maxHours } = dryingWindowHours(rockType, cliffAngleDeg)
  if (effectiveHours >= maxHours) return 'dry'
  if (effectiveHours < minHours) return 'wet'
  return 'drying'
}

/**
 * **Water on the rock, 0-1** — the first of the two friction mechanisms.
 *
 * 0 at or below the dew point, 1 at `CONDENSATION_CLEAR_MARGIN_C` above it,
 * linear between. The margin is `T_mass − T_dew` and takes the **mass**
 * temperature, not the surface one: a night of condensation equilibrates against
 * the bulk of the wall, which is the multi-day lag that makes 10 °C and 90%
 * humidity mean opposite things depending on what the rock has been sitting at
 * (`scoring-findings.md` §3.1).
 */
export function condensationFactor(marginC: number | null): number | null {
  if (marginC === null || !Number.isFinite(marginC)) return null
  if (marginC <= 0) return 0
  if (marginC >= CONDENSATION_CLEAR_MARGIN_C) return 1
  return marginC / CONDENSATION_CLEAR_MARGIN_C
}

/**
 * The two mechanisms, multiplied: water on the rock × dry skin on the hand.
 *
 * Multiplied because either one alone ruins the reading and neither can
 * compensate for the other — a bone-dry hand on a wall running with condensation
 * is not a good day, and nor is a dry wall you cannot hold on to.
 */
export function frictionFactor(
  condensation: number | null,
  sweat: number | null,
): number | null {
  if (condensation === null || !Number.isFinite(condensation)) return null
  if (sweat === null || !Number.isFinite(sweat)) return null
  return clamp01(condensation) * clamp01(sweat)
}

export function frictionLevel(factor: number | null): FrictionLevel | null {
  if (factor === null || !Number.isFinite(factor)) return null
  if (factor >= FRICTION_BANDS.great) return 'great'
  if (factor >= FRICTION_BANDS.good) return 'good'
  if (factor >= FRICTION_BANDS.fair) return 'fair'
  return 'poor'
}

/**
 * **`score = 100 × wetness^w × friction^f`.** Layer 3, and the whole of it.
 *
 * Returns `null` if either factor is null — a score with a guessed factor in it
 * would be a measurement-looking number built from a gap. Rounded to a whole
 * number because that is what every surface prints; the rounding is the only
 * discontinuity in the model and it is worth at most a point.
 */
export function derivedScore(
  wetness: number | null,
  friction: number | null,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): number | null {
  if (wetness === null || !Number.isFinite(wetness)) return null
  if (friction === null || !Number.isFinite(friction)) return null
  const w = weights.wetness
  const f = weights.friction
  if (!Number.isFinite(w) || !Number.isFinite(f) || w < 0 || f < 0 || w + f <= 0) return null
  return Math.round(100 * Math.pow(clamp01(wetness), w) * Math.pow(clamp01(friction), f))
}

export type HourConditionsInput = {
  valid_at: string
  airTempC: number | null
  dewPointC: number | null
  windKmh: number | null
  cloudPct: number | null
  shortwaveWm2: number | null
  /**
   * Rock mass temperature for this hour — `rockThermal.massTemperatureC` over
   * the trailing days. **Null withholds the friction reading**; it does not fall
   * back to air temperature, which would be the current humidity bug (#140) with
   * extra steps.
   */
  massTempC: number | null
  /**
   * Reference-equivalent drying hours accumulated at this hour. Null withholds
   * the rock reading — an unknown rain history is not a dry wall (issue #34).
   */
  effectiveDryHours: number | null
  rockType: RockType
  cliffAngleDeg: number
  /** The recorded wall, or absent/null when aspect or angle was not recorded. See `EvaluateSeriesOptions.wall`. */
  wall?: WallOrientation | null
  /** Hours the sample covers, so the sun is taken mid-sample. Defaults to 1. */
  stepHours?: number
  /** `user_preferences.include_sun`. Defaults to true. */
  includeSun?: boolean
  weights?: ScoreWeights
  metabolicW?: number
}

/**
 * **The internals, deliberately fenced off from anything a surface renders.**
 *
 * Owner decision, 2026-09-21. The friction reading rests on one unvalidated
 * step — see `sweatBalance.sweatFrictionFactor` — and the decision was to keep
 * it and quarantine it: **words and ordering reach a screen, magnitudes do
 * not.** A "friction: 0.29" on a location card would be a precision nobody has
 * earned, and it is the kind of number a reader treats as a measurement.
 *
 * This is a nested object rather than a comment because a comment is not a
 * fence. A Phase 3 response built by spreading an `HourlyConditions` picks
 * these up silently; one built by naming its fields cannot pick them up by
 * accident. See `.claude/rules/architecture.md`.
 *
 * They exist because `compare:scoring` and `compare:hourly-v2` have to be able
 * to show the workings, and because a null here is how Phase 3 tells "the model
 * declined to answer" from "the model answered badly".
 */
export type HourlyDiagnostics = {
  t_mass_c: number | null
  /**
   * `sweatBalance.skinWettedness`, unclamped. Null when it could not be read.
   *
   * **Read the direction before using it beside `wetness_factor`, because the
   * two are named alike and point opposite ways.** This one is a *wetness*: 0
   * is a dry hand and higher is worse. `wetness_factor` is how far the *rock*
   * has dried: 1 is a dry wall and higher is better.
   */
  skin_wettedness: number | null
  /** How dry the **rock** is, 0-1. 1 is dry. The `wetness` in Layer 3's formula. */
  wetness_factor: number | null
  /** The product of the two friction mechanisms, 0-1. **Never rendered.** */
  friction_factor: number | null
  effective_dry_hours: number | null
}

export type HourlyConditions = {
  valid_at: string
  /**
   * **Null when the rock's state could not be read**, which the handoff's
   * `type Reading` sketch could not express. A `Reading` has no "unknown" level
   * and inventing `dry` for a wall nobody watched is the defect this repo ships
   * most often. Deliberate deviation from § Data Shapes, recorded there.
   */
  rock: Reading | null
  friction: Friction | null
  /**
   * **Null when an input could not be measured — never 0.** 0 is a real score
   * and it means the wall is wet or condensing.
   */
  score: number | null
  /**
   * Rock surface temperature, °C. Renderable — it is a derived *measurement*
   * with a named bias (§ Unknown aspect), not a guess about grip.
   */
  t_surface_c: number | null
  /** How far the wall's bulk sits above its dew point, °C. Renderable, same reason. */
  condensation_margin_c: number | null
  /** **Not renderable.** See `HourlyDiagnostics`. */
  diagnostics: HourlyDiagnostics
}

/**
 * One hour, from Layer 1 quantities to the two readings and the number.
 *
 * `qualified` travels with each reading rather than the hour, because the two
 * are qualified by different things. The friction reading is unqualified when
 * *this hour's* sun could have changed the answer — which is the per-hour
 * decision in § Unknown aspect, and why a dawn window is fully qualified on a
 * location nobody has ever edited. The rock reading is qualified by every hour
 * that fed its drying clock, which `evaluateHourlyConditions` tracks; a caller
 * scoring a single hour in isolation has no such history and must say so with
 * `rockQualified`.
 */
export function evaluateHour(
  input: HourConditionsInput,
  rockQualified: boolean,
): HourlyConditions {
  return readingsFrom(input, surfaceFor(input), rockQualified)
}

/**
 * The surface temperature for an hour, from the weather fields of whatever
 * shape is describing it.
 *
 * One function so `evaluateHour` and the series walk cannot ask
 * `surfaceTemperature` two subtly different questions — the series needs the
 * answer *before* it can advance the drying clock, and computing it twice is how
 * the two would drift.
 */
function surfaceFor(input: {
  valid_at: string
  airTempC: number | null
  shortwaveWm2: number | null
  windKmh: number | null
  cloudPct: number | null
  cliffAngleDeg: number
  wall?: WallOrientation | null
  stepHours?: number
  includeSun?: boolean
}): ReturnType<typeof surfaceTemperature> {
  return surfaceTemperature({
    airTempC: input.airTempC,
    shortwaveWm2: input.shortwaveWm2,
    windKmh: input.windKmh,
    cloudPct: input.cloudPct,
    cliffAngleDeg: input.cliffAngleDeg,
    wall: wallAt(input.valid_at, input.wall ?? null, input.stepHours ?? 1),
    includeSun: input.includeSun,
  })
}

/**
 * The sun is taken at the **middle** of the sample, because Open-Meteo stamps
 * shortwave at the end of the hour it averages. Using the stamp would put the
 * sun half an hour late all day — at 30°/h near the horizon, enough to turn an
 * east wall's first sunlit hour into shade. An unparseable stamp drops the
 * geometry, which leaves the hour on the unscaled, flagged path rather than
 * inventing a sun position.
 */
function wallAt(
  validAt: string,
  wall: WallOrientation | null,
  stepHours: number,
): { orientation: WallOrientation; at: Date } | null {
  if (wall === null) return null
  const t = Date.parse(validAt)
  if (!Number.isFinite(t)) return null
  return { orientation: wall, at: new Date(t - (stepHours * 3_600_000) / 2) }
}

function readingsFrom(
  input: HourConditionsInput,
  surface: ReturnType<typeof surfaceTemperature>,
  rockQualified: boolean,
): HourlyConditions {
  const margin = condensationMarginC(input.massTempC, input.dewPointC)
  const condensing = isCondensing(margin)

  const wettednessResult = skinWettedness({
    airTempC: input.airTempC,
    radiantTempC: surface.t_surface_c,
    dewPointC: input.dewPointC,
    windKmh: input.windKmh,
    metabolicW: input.metabolicW,
  })
  const wettedness = wettednessResult === null ? null : wettednessResult.wettedness

  const condFactor = condensationFactor(margin)
  const sweatFactor = sweatFrictionFactor(wettedness)
  const friction = frictionFactor(condFactor, sweatFactor)
  const fLevel = frictionLevel(friction)

  const wetness = wetnessFactor(input.effectiveDryHours, input.rockType, input.cliffAngleDeg)
  const rLevel = rockLevel(input.effectiveDryHours, input.rockType, input.cliffAngleDeg)

  return {
    valid_at: input.valid_at,
    rock: rLevel === null ? null : { level: rLevel, qualified: rockQualified },
    friction:
      fLevel === null || condensing === null
        ? null
        : { level: fLevel, condensing, qualified: surface.qualified },
    score: derivedScore(wetness, friction, input.weights ?? DEFAULT_WEIGHTS),
    t_surface_c: surface.t_surface_c,
    condensation_margin_c: margin,
    diagnostics: {
      t_mass_c: input.massTempC,
      skin_wettedness: wettedness,
      wetness_factor: wetness,
      friction_factor: friction,
      effective_dry_hours: input.effectiveDryHours,
    },
  }
}

/** One hour of weather, as the deterministic + ensemble join already produces it. */
export type WeatherHour = {
  /** UTC instant, ISO 8601. */
  valid_at: string
  air_temp_c: number | null
  dewpoint_c: number | null
  wind_kmh: number | null
  cloud_pct: number | null
  shortwave_wm2: number | null
  precip_mm: number | null
}

export type EvaluateSeriesOptions = {
  rockType: RockType
  cliffAngleDeg: number
  /**
   * **The recorded wall, or null when either its aspect or its angle was not
   * recorded.** Present, `T_surface` uses the wall's own irradiance and every
   * hour is qualified; absent, the horizontal value and the per-hour margin rule
   * stand (§ Unknown aspect). `cliffAngleDeg` above may be the 45 default and is
   * **not** evidence of a recorded wall — only this field is.
   */
  wall?: WallOrientation | null
  weights?: ScoreWeights
  includeSun?: boolean
  metabolicW?: number
  massTempOptions?: MassTemperatureOptions
  /**
   * Reference-equivalent drying hours already accumulated **before the first
   * hour of the series**, or `null` when the rain history is unknown.
   *
   * **0 is the honest default and it reads the wall as soaking.** A caller that
   * wants a real rock reading has to hand in enough leading history for the
   * series itself to contain the last rain — `past_days` on the Open-Meteo
   * request is how `compare:hourly-v2` does it. When the series contains no rain
   * at all, the accumulation from its own start is a **lower bound** on how long
   * the wall has been drying, which reads wetter than the truth. That is the
   * direction to be wrong in (issue #34) and it self-resolves as soon as the
   * leading history is longer than the rock type's own window.
   *
   * `null` withholds the rock reading, and therefore the score, until the series
   * reaches a rain hour it can measure from.
   */
  priorEffectiveHours?: number | null
  /** Hours each sample covers. Defaults to 1. */
  stepHours?: number
}

/**
 * **The hourly evaluation.** Walks a weather series once, carrying the two
 * pieces of state the model needs that a single hour cannot have: the trailing
 * temperature the rock mass has been sitting at, and the drying clock.
 *
 * The drying clock is the part that is genuinely new. `dryingModel` measures
 * flat elapsed hours from the end of the last rainy *day*; this accumulates
 * `dryingRateMultiplier` hour by hour from the last rainy *hour*, so a windy
 * sunny afternoon advances it faster than a still grey one and a night barely
 * advances it at all. An hour whose rate could not be computed contributes
 * nothing rather than being filled at the reference rate — under-counting reads
 * the wall wetter, which is the safe direction, and `effectiveDryingHours`
 * documents the same rule.
 *
 * **`T_mass` needs days of history and `weather_run_hours` retains two.** The
 * series handed in must carry its own leading history or the mass temperature —
 * and with it the friction reading — is withheld for every hour. That is the
 * handoff's § Known Risks, and it is why this takes a series rather than
 * fetching one.
 */
export function evaluateHourlyConditions(
  hours: readonly WeatherHour[],
  options: EvaluateSeriesOptions,
): HourlyConditions[] {
  const step = options.stepHours ?? 1
  const massOptions: MassTemperatureOptions = { ...options.massTempOptions, stepHours: step }
  // The trailing window `massTemperatureC` is willing to answer over. Its own
  // default is `2 × tau`; asking it for exactly that keeps the slice at the
  // shortest series it will accept rather than guessing a longer one.
  const tau = massOptions.tauHours ?? MASS_TAU_HOURS
  const massSpanHours = massOptions.minSpanHours ?? 2 * tau
  const massWindow = Math.max(1, Math.ceil(massSpanHours / step))

  const temps: (number | null)[] = []
  let effective: number | null =
    options.priorEffectiveHours === undefined ? 0 : options.priorEffectiveHours
  let rockQualified = true

  const out: HourlyConditions[] = []

  for (const hour of hours) {
    temps.push(hour.air_temp_c)
    const window = temps.slice(-massWindow)
    const massTempC = massTemperatureC(window, massOptions)

    const surface = surfaceFor({
      valid_at: hour.valid_at,
      airTempC: hour.air_temp_c,
      shortwaveWm2: hour.shortwave_wm2,
      windKmh: hour.wind_kmh,
      cloudPct: hour.cloud_pct,
      cliffAngleDeg: options.cliffAngleDeg,
      wall: options.wall ?? null,
      stepHours: step,
      includeSun: options.includeSun,
    })

    /**
     * Rain resets the clock before this hour is scored, not after. An hour it
     * is raining in is an hour the wall is wet, and scoring it on the drying it
     * had done beforehand would report a wall as dry while rain lands on it.
     */
    const precip = hour.precip_mm
    const precipMeasured = precip !== null && Number.isFinite(precip)

    if (precipMeasured && precip >= SIGNIFICANT_HOURLY_PRECIP_MM) {
      effective = 0
      rockQualified = true
    } else if (!precipMeasured) {
      /**
       * **An hour whose rain was not measured is not an hour it did not rain.**
       * Falling through to the drying branch would credit it as dry — a gap
       * read as a favourable value, which is `defect-patterns.md` §1 and the
       * direction issue #34 forbids. It contributes no drying instead, exactly
       * as an hour whose *rate* could not be computed does: the clock stands
       * still, which reads the wall wetter than it may be. That is the
       * direction to be wrong in.
       */
    } else if (effective !== null) {
      const rate = dryingRateMultiplier({
        surfaceTempC: surface.t_surface_c,
        dewPointC: hour.dewpoint_c,
        windKmh: hour.wind_kmh,
      })
      if (rate !== null) {
        effective += rate * step
        // An unqualified hour's drying rate rests on an irradiance that the
        // wall's unknown aspect could have changed, so everything accumulated
        // since the last rain is unqualified with it. Until Phase 4 writes an
        // aspect this is false for any window containing daylight — which is
        // the honest reading of the flag, not a bug in it.
        if (!surface.qualified) rockQualified = false
      }
    }

    out.push(
      readingsFrom(
        {
          valid_at: hour.valid_at,
          airTempC: hour.air_temp_c,
          dewPointC: hour.dewpoint_c,
          windKmh: hour.wind_kmh,
          cloudPct: hour.cloud_pct,
          shortwaveWm2: hour.shortwave_wm2,
          massTempC,
          effectiveDryHours: effective,
          rockType: options.rockType,
          cliffAngleDeg: options.cliffAngleDeg,
          wall: options.wall ?? null,
          stepHours: step,
          includeSun: options.includeSun,
          weights: options.weights,
          metabolicW: options.metabolicW,
        },
        surface,
        rockQualified,
      ),
    )
  }

  return out
}

export type ConditionsWindow = {
  /** `valid_at` of the first hour in the run. */
  from: string
  /** `valid_at` of the last hour in the run. */
  to: string
  hours: number
  /** The lowest score in the run — what the window is worth, not its best hour. */
  min_score: number
  /** False if any hour in the run carries an unqualified reading. */
  qualified: boolean
}

export type WindowMinimums = {
  rock?: RockLevel[]
  friction?: FrictionLevel[]
  score?: number
}

const ROCK_ORDER: RockLevel[] = ['wet', 'drying', 'dry']
const FRICTION_ORDER: FrictionLevel[] = ['poor', 'fair', 'good', 'great']

/**
 * **Layer 4 — the best contiguous run of hours clearing the caller's minimums.**
 * *"Good from 7am to 11am."*
 *
 * The rendering half is Phase 3's; this is the part that decides which hours are
 * in. An hour with a null reading or a null score is **not** in a window — it
 * breaks the run, because a window is a claim about every hour it spans.
 *
 * Ties are broken by length and then by the first run found, so the answer is
 * deterministic. `qualified` is true only when every hour in the run is
 * qualified on both readings, which is the simplest defensible rule for the
 * per-hour flag the handoff leaves to Phase 3 — and Phase 3 may still overrule
 * it, because it is a copy decision as much as a data one.
 */
export function bestWindow(
  hours: readonly HourlyConditions[],
  minimums: WindowMinimums = {},
): ConditionsWindow | null {
  const minRock = minimums.rock ?? ['drying', 'dry']
  const minFriction = minimums.friction ?? ['fair', 'good', 'great']
  const minScore = minimums.score ?? 0

  const clears = (h: HourlyConditions): boolean => {
    if (h.rock === null || h.friction === null || h.score === null) return false
    if (!minRock.includes(h.rock.level)) return false
    if (!minFriction.includes(h.friction.level)) return false
    return h.score >= minScore
  }

  let best: ConditionsWindow | null = null
  let runStart = -1

  const close = (endIndex: number): void => {
    if (runStart < 0) return
    const run = hours.slice(runStart, endIndex)
    const scores = run.map((h) => h.score ?? 0)
    const candidate: ConditionsWindow = {
      from: run[0]!.valid_at,
      to: run[run.length - 1]!.valid_at,
      hours: run.length,
      min_score: Math.min(...scores),
      qualified: run.every((h) => h.rock?.qualified === true && h.friction?.qualified === true),
    }
    if (best === null || candidate.hours > best.hours) best = candidate
    runStart = -1
  }

  for (let i = 0; i < hours.length; i++) {
    if (clears(hours[i]!)) {
      if (runStart < 0) runStart = i
    } else {
      close(i)
    }
  }
  close(hours.length)

  return best
}

/** Level orderings, exported so a caller can build a `WindowMinimums` from a threshold. */
export function rockLevelsAtLeast(level: RockLevel): RockLevel[] {
  return ROCK_ORDER.slice(ROCK_ORDER.indexOf(level))
}

export function frictionLevelsAtLeast(level: FrictionLevel): FrictionLevel[] {
  return FRICTION_ORDER.slice(FRICTION_ORDER.indexOf(level))
}
