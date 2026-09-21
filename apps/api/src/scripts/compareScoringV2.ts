/**
 * **The v2 half of the score-impact harness — the two readings and the number
 * derived from them, beside what production returns today.** Phase 2 of
 * `docs/handoffs/weatherteam6-scoring-model-handoff-v1.md`.
 *
 * Printed by `npm run compare:scoring --workspace=apps/api`. It lives in its own
 * file because `compareScoring.ts` is the **record of issue #21's costing** —
 * the geometric mean, the two reweights and the two vetoes, all built, measured
 * and rejected — and that record is worth keeping legible rather than growing a
 * second model inside it.
 *
 * Deliberately offline, deterministic and clock-free. No database, no network.
 * It is a report, not a check: its output *is* the result.
 *
 * ## What is a real model and what is a harness simplification
 *
 * Every number below comes from `hourlyConditions.ts` and the Layer 1 modules.
 * Nothing is reimplemented here — that was the mistake `compareScoring.ts`
 * guards against with its `MISMATCH` line, and the way to avoid needing that
 * guard is to import rather than mirror.
 *
 * **One simplification, and it is the reason `compare:hourly-v2` exists.** A
 * scenario describes one hour, so the days before it are **synthesized** — a
 * repeating diurnal cycle built by `buildSeries` — and the real
 * `evaluateHourlyConditions` is then run over them. The drying clock and the
 * mass temperature are therefore accumulated by the model rather than
 * approximated, but they are accumulated over weather that does not exist. A
 * real location's week is not a repeating day, and `compare:hourly-v2` is what
 * runs this against one.
 *
 * ## Nothing here is calibrated
 *
 * The same honesty bound the model is written to. It orders days; it does not
 * measure them. Two constants decide most of what the columns below do —
 * `METABOLIC_HEAT_W_M2` and the choice of sweat map — and both are printed with
 * their sensitivity rather than asserted.
 */
import { conditionsScore } from '../lib/scoring/conditionsScore.js'
import {
  DEFAULT_WEIGHTS,
  condensationFactor,
  derivedScore,
  evaluateHour,
  evaluateHourlyConditions,
  frictionFactor,
  type HourlyConditions,
  type ScoreWeights,
  type WeatherHour,
} from '../lib/scoring/hourlyConditions.js'
import { saturationVapourPressureKpa } from '../lib/scoring/rockThermal.js'
import {
  METABOLIC_HEAT_W_M2,
  dryFractionFrictionFactor,
  sweatFrictionFactor,
} from '../lib/scoring/sweatBalance.js'
import { SCORE_BANDS, stateLabel } from '@weatherteam6/types'
import type { ScoreInput } from '@weatherteam6/types'

/**
 * Dew point from temperature and relative humidity, by inverting the Magnus form
 * `saturationVapourPressureKpa` uses.
 *
 * Only the scenarios need it. **The model never converts** — Open-Meteo supplies
 * dew point directly, and relative humidity is the variable
 * `scoring-findings.md` §3.1 says obscures the answer. Scenarios are written in
 * RH because that is how the old scorer's cases were written and how a person
 * describes a day.
 */
function dewPointC(tempC: number, rhPct: number): number {
  const es = saturationVapourPressureKpa(tempC)
  if (es === null) throw new Error('scenario temperature is not a number')
  const ea = (es * rhPct) / 100
  const ln = Math.log(ea / 0.6108)
  return (237.3 * ln) / (17.27 - ln)
}

type V2Scenario = {
  name: string
  note: string
  airTempC: number
  rhPct: number
  windKmh: number
  shortwaveWm2: number
  cloudPct: number
  /**
   * `T_mass` as an offset from air temperature, °C. The rock mass lags the air,
   * so a warm spell leaves it below air temperature and a cold snap above.
   * Written as an offset because that is the only way to say "the wall has been
   * sitting colder than today" in a single-hour scenario.
   */
  massOffsetC: number
  /** Elapsed hours since the last significant rain. */
  hoursSinceRain: number
  rockType: ScoreInput['rockType']
  cliffAngle: number
}

const baseV2: V2Scenario = {
  name: '',
  note: '',
  airTempC: 16,
  rhPct: 45,
  windKmh: 8,
  shortwaveWm2: 500,
  cloudPct: 0,
  massOffsetC: 0,
  hoursSinceRain: 168,
  rockType: 'sandstone',
  cliffAngle: 45,
}

const v2 = (over: Partial<V2Scenario>): V2Scenario => ({ ...baseV2, ...over })

/**
 * The scenarios, chosen to line up with `compareScoring.ts`'s where the two
 * models can be asked the same question, plus the cases only v2 can express.
 */
const SCENARIOS: V2Scenario[] = [
  v2({
    name: 'Perfect day, sandstone',
    note: 'Dry a week, 16 °C, light breeze, sunny.',
  }),
  v2({
    name: '12h after rain, sandstone',
    note: 'THE ADDITIVE CASE. v1 scores this in the 60s because four good components hand back 60.',
    hoursSinceRain: 12,
  }),
  v2({
    name: '36h after rain, sandstone',
    note: 'Looks dry, is not. Sandstone needs 72h+ of reference-rate drying.',
    hoursSinceRain: 36,
  }),
  v2({
    name: '36h after rain, granite',
    note: 'Same elapsed time, fast-drying rock. Should be barely affected.',
    hoursSinceRain: 36,
    rockType: 'granite',
  }),
  v2({
    name: '104 °F / 40 °C, sun on the wall',
    note: 'ISSUE #21. Dry, calm, no rain coming — and dangerously hot. v1 says 88.',
    airTempC: 40,
    shortwaveWm2: 900,
  }),
  v2({
    name: '104 °F / 40 °C, in shade',
    note: 'The same air, no sun on the rock. Shows how much of #21 the sun term carries.',
    airTempC: 40,
    shortwaveWm2: 0,
  }),
  v2({
    name: '35 °C, sun on the wall',
    note: 'The top of v1 TEMP_BAND_C, where the old component reaches 0.',
    airTempC: 35,
    shortwaveWm2: 900,
  }),
  v2({
    name: '-10 °C, sun on the wall',
    note: 'THE COLD CASE. No friction penalty — but the rock never finishes drying at -10 °C.',
    airTempC: -10,
    shortwaveWm2: 300,
  }),
  v2({
    name: 'Gale, everything else perfect',
    note: 'THE WIND GAP. 60 km/h. v2 reads wind as drying, never as danger.',
    windKmh: 60,
  }),
  v2({
    name: 'Muggy 27 °C, 85% RH',
    note: 'Dew point 24 °C against a wall that has been sitting at 25. Barely above condensing.',
    airTempC: 27,
    rhPct: 85,
    windKmh: 5,
    shortwaveWm2: 200,
    cloudPct: 80,
    massOffsetC: -2,
  }),
  v2({
    name: 'Dry 27 °C, 30% RH',
    note: 'THE ORDERING THE HANDOFF ASKS FOR: same air temperature as the row above.',
    airTempC: 27,
    rhPct: 30,
    windKmh: 5,
    shortwaveWm2: 800,
    massOffsetC: -2,
  }),
  v2({
    name: 'Condensing wall',
    note: 'A wall sitting below its dew point. It is running with water whatever the rain did.',
    airTempC: 12,
    rhPct: 95,
    windKmh: 3,
    shortwaveWm2: 0,
    cloudPct: 100,
    massOffsetC: -2,
  }),
  v2({
    name: 'Mediocre across the board',
    note: 'Nothing fatal, nothing good — and v2 says it is a fine day. See the note under the table.',
    airTempC: 24,
    rhPct: 70,
    windKmh: 25,
    shortwaveWm2: 400,
    cloudPct: 50,
    hoursSinceRain: 100,
  }),
]

/**
 * The `ScoreInput` that asks the current scorer the same question. Fields v2
 * does not have an equivalent for are left at the v1 harness's own defaults, so
 * the `Now` column here is directly comparable to the one in
 * `compareScoring.ts`.
 */
function toScoreInput(sc: V2Scenario): ScoreInput {
  return {
    rockType: sc.rockType,
    aspectDegrees: 180,
    cliffAngle: sc.cliffAngle,
    hoursSinceRain: sc.hoursSinceRain,
    lastRainMm: sc.hoursSinceRain < 168 ? 12 : 0,
    forecastRain72hMm: 0,
    forecastRain72hP10: 0,
    forecastRain72hP90: 0,
    currentWindKmh: sc.windKmh,
    maxWindKmh24h: sc.windKmh,
    currentTempC: sc.airTempC,
    forecastHighC: sc.airTempC,
    currentHumidityPct: sc.rhPct,
    forecastDateDaysOut: 1,
  }
}

type V2Result = {
  hour: HourlyConditions
  /** Score under each weight split, default sweat map. */
  byWeights: Record<string, number | null>
  /** Score under the dry-skin-fraction map at the default weights. */
  dryFractionScore: number | null
  /** Score with the metabolic rate at the top of its defensible range. */
  hotMetabolicScore: number | null
}

const WEIGHT_SPLITS: Record<string, ScoreWeights> = {
  '55/45': { wetness: 0.55, friction: 0.45 },
  '50/50': { wetness: 0.5, friction: 0.5 },
  '65/35': { wetness: 0.65, friction: 0.35 },
}

const HOT_METABOLIC_W = 500

/**
 * Hours of synthetic weather generated before the hour being scored.
 *
 * 120 is the shortest window that satisfies both consumers: `massTemperatureC`
 * refuses a series under 96 hours, and the longest rock-type drying window is
 * sandstone's 94 reference-equivalent hours on a slab.
 */
const HISTORY_HOURS = 120

/**
 * Local hour of day the scored hour sits at — mid-afternoon, near the daily peak
 * of both sun and temperature.
 *
 * The same for a shaded scenario as for a sunlit one: "in shade" here means a
 * wall the sun does not reach, not the middle of the night. Anchoring a shaded
 * scenario to a night hour instead made its synthetic afternoons nine degrees
 * hotter than the air temperature the scenario is named after.
 */
const SCORED_LOCAL_HOUR = 13

/** Peak-to-mean swing of the synthetic diurnal temperature cycle, °C. */
const DIURNAL_SWING_C = 5

/**
 * **A synthetic diurnal history ending at the hour being scored**, so the
 * scenarios run through the real hour-by-hour accumulator rather than an
 * approximation of it.
 *
 * The first cut of this harness scaled elapsed hours by the scored hour's own
 * drying rate, and it reported a sandstone wall 36 hours after rain as **dry** —
 * because it applied a sunlit afternoon's rate to the nights as well. That is
 * the #137 bug arriving through the back door of a report, so the history is
 * synthesized instead: sun follows a daylight sine, temperature a cosine peaking
 * mid-afternoon, wind and dew point hold at the scenario's values.
 *
 * **It is still synthetic.** A real location's weather is not a repeating day
 * and `compare:hourly-v2` is what runs this model against one. What this buys is
 * that every number in the tables below comes out of
 * `evaluateHourlyConditions`, including the drying clock.
 *
 * Rain is one hour of 5 mm placed `hoursSinceRain` before the end. When that is
 * further back than the window, the hours outside it are credited at the
 * reference rate through `priorEffectiveHours` — stated here because it is the
 * one figure in the drying column that is not derived from synthesized weather.
 */
function buildSeries(sc: V2Scenario): { hours: WeatherHour[]; priorEffectiveHours: number } {
  const dew = dewPointC(sc.airTempC, sc.rhPct)
  const endLocalHour = SCORED_LOCAL_HOUR

  // Daylight sine, zero outside 06:00-18:00, normalised so the scored hour
  // carries exactly the scenario's irradiance.
  const daylight = (localHour: number): number =>
    localHour < 6 || localHour > 18 ? 0 : Math.sin((Math.PI * (localHour - 6)) / 12)
  const peakShare = daylight(endLocalHour)
  const solarPeak = peakShare > 0 ? sc.shortwaveWm2 / peakShare : 0

  // Cosine peaking at 15:00, offset so the scored hour is the scenario's air
  // temperature rather than the daily mean.
  const swing = (localHour: number): number =>
    DIURNAL_SWING_C * Math.cos((2 * Math.PI * (localHour - 15)) / 24)
  const meanTemp = sc.airTempC - swing(endLocalHour)

  const rainIndex = HISTORY_HOURS - 1 - sc.hoursSinceRain
  const hours: WeatherHour[] = []

  for (let i = 0; i < HISTORY_HOURS; i++) {
    const hoursBeforeEnd = HISTORY_HOURS - 1 - i
    const localHour = ((endLocalHour - hoursBeforeEnd) % 24 + 24) % 24
    hours.push({
      valid_at: `T-${hoursBeforeEnd}h`,
      air_temp_c: meanTemp + swing(localHour),
      dewpoint_c: dew,
      wind_kmh: sc.windKmh,
      cloud_pct: sc.cloudPct,
      shortwave_wm2: solarPeak * daylight(localHour),
      precip_mm: i === rainIndex ? 5 : 0,
    })
  }

  return {
    hours,
    priorEffectiveHours: rainIndex >= 0 ? 0 : sc.hoursSinceRain - (HISTORY_HOURS - 1),
  }
}

/**
 * Run one scenario through the real model, end to end.
 *
 * `massOffsetC` overrides the mass temperature the synthetic history produces.
 * A flat repeating day cannot express *"the wall has been sitting 2 °C colder
 * than today"*, which is the discriminator `scoring-findings.md` §3.1 is about —
 * identical humidity, opposite outcomes — so the scenarios that need it say so
 * explicitly. The drying clock is unaffected either way: it runs off
 * `T_surface`, which is fast, not off `T_mass`, which is slow.
 */
function runScenario(sc: V2Scenario, weights: ScoreWeights, metabolicW?: number): HourlyConditions {
  const { hours, priorEffectiveHours } = buildSeries(sc)
  const evaluated = evaluateHourlyConditions(hours, {
    rockType: sc.rockType,
    cliffAngleDeg: sc.cliffAngle,
    weights,
    metabolicW,
    priorEffectiveHours,
  })
  const last = evaluated[evaluated.length - 1]!
  if (sc.massOffsetC === 0) return last

  const end = hours[hours.length - 1]!
  return evaluateHour(
    {
      valid_at: last.valid_at,
      airTempC: end.air_temp_c,
      dewPointC: end.dewpoint_c,
      windKmh: end.wind_kmh,
      cloudPct: end.cloud_pct,
      shortwaveWm2: end.shortwave_wm2,
      massTempC: sc.airTempC + sc.massOffsetC,
      effectiveDryHours: last.diagnostics.effective_dry_hours,
      rockType: sc.rockType,
      cliffAngleDeg: sc.cliffAngle,
      weights,
      metabolicW,
    },
    last.rock?.qualified ?? true,
  )
}

/** The dry-skin-fraction map applied to an already-evaluated hour. */
function dryFractionScoreOf(hour: HourlyConditions, weights = DEFAULT_WEIGHTS): number | null {
  return derivedScore(
    hour.diagnostics.wetness_factor,
    frictionFactor(
      condensationFactor(hour.condensation_margin_c),
      dryFractionFrictionFactor(hour.diagnostics.skin_wettedness),
    ),
    weights,
  )
}

function evaluate(sc: V2Scenario): V2Result {
  const hour = runScenario(sc, DEFAULT_WEIGHTS)

  const byWeights: Record<string, number | null> = {}
  for (const [label, weights] of Object.entries(WEIGHT_SPLITS)) {
    byWeights[label] =
      label === '55/45' ? hour.score : runScenario(sc, weights).score
  }

  return {
    hour,
    byWeights,
    dryFractionScore: dryFractionScoreOf(hour),
    hotMetabolicScore: runScenario(sc, DEFAULT_WEIGHTS, HOT_METABOLIC_W).score,
  }
}

function pad(v: string, n: number): string {
  return v.length >= n ? v.slice(0, n) : v + ' '.repeat(n - v.length)
}
function padL(v: string, n: number): string {
  return v.length >= n ? v : ' '.repeat(n - v.length) + v
}
const num = (v: number | null, dp = 0): string => (v === null ? '—' : v.toFixed(dp))

function scenarioTable(): void {
  console.log('')
  console.log('  1. THE SCENARIOS — v1 beside v2')
  console.log('')
  console.log('     Now   what production returns today (the real conditionsScore)')
  console.log('     55/45 v2 at the handoff default: wetness 0.55, friction 0.45')
  console.log('     50/50 v2, equal weight       65/35 v2, wetness-heavy')
  console.log('     Dry%  v2 at 55/45 with the DRY-SKIN-FRACTION sweat map (1-w) instead of exp(-w)')
  console.log(`     M500  v2 at 55/45 with the metabolic rate at ${HOT_METABOLIC_W} W/m² instead of ${METABOLIC_HEAT_W_M2}`)
  console.log('')
  console.log('-'.repeat(112))
  console.log(
    `  ${pad('Scenario', 34)}${padL('Now', 5)}${padL('55/45', 7)}${padL('50/50', 7)}${padL('65/35', 7)}` +
      `${padL('Dry%', 6)}${padL('M500', 6)}  ${pad('Rock', 8)}${pad('Friction', 10)}`,
  )
  console.log('-'.repeat(112))

  for (const sc of SCENARIOS) {
    const v1 = conditionsScore(toScoreInput(sc)).score
    const r = evaluate(sc)
    const rock = r.hour.rock === null ? '—' : r.hour.rock.level
    const friction =
      r.hour.friction === null
        ? '—'
        : `${r.hour.friction.level}${r.hour.friction.condensing ? '*' : ''}`

    console.log(
      `  ${pad(sc.name, 34)}${padL(num(v1), 5)}${padL(num(r.byWeights['55/45'] ?? null), 7)}` +
        `${padL(num(r.byWeights['50/50'] ?? null), 7)}${padL(num(r.byWeights['65/35'] ?? null), 7)}` +
        `${padL(num(r.dryFractionScore), 6)}${padL(num(r.hotMetabolicScore), 6)}  ` +
        `${pad(rock, 8)}${pad(friction, 10)}`,
    )
    console.log(
      `    ${sc.note}`,
    )
    console.log(
      `      T_surface ${num(r.hour.t_surface_c, 1)} °C · dew margin ${num(r.hour.condensation_margin_c, 1)} °C · ` +
        `skin wettedness ${num(r.hour.diagnostics.skin_wettedness, 2)} · ` +
        `wetness ${num(r.hour.diagnostics.wetness_factor, 2)} × friction ${num(r.hour.diagnostics.friction_factor, 2)}` +
        `${r.hour.friction?.qualified === false ? ' · sun UNQUALIFIED' : ''}`,
    )
    console.log('')
  }
  console.log('     * = the wall is below its dew point and condensing.')
  console.log('')
  console.log('  THE ROW THAT DESERVES AN ARGUMENT is the last one. v1 calls a breezy,')
  console.log('  half-cloudy, 70%-humidity 24 °C day "90"; v2 calls it 98. Two of v1\'s five')
  console.log('  components were docking it for things this model says are not costs — 25')
  console.log('  km/h of wind, which dries the rock and the hand, and 70% RH against a wall')
  console.log('  nowhere near its dew point. The third, a 4 mm 72-hour rain forecast, has no')
  console.log('  v2 equivalent at all: hourly scoring puts that rain in the hours it falls')
  console.log('  in. Whether "mediocre" days should read this well is a real question for the')
  console.log('  stop below, and it is the flip side of the 12h-after-rain row — the same')
  console.log('  shape that stops four good components outvoting a fatal one also stops four')
  console.log('  mediocre ones adding up to a poor day.')
  console.log('')
}

/**
 * The slide the handoff's Layer 3 table stands in for, rebuilt from the real
 * model. **Whatever this prints replaces that table** — it said so.
 */
function temperatureSlide(): void {
  console.log('')
  console.log('  2. THE HEAT SLIDE — issue #21, measured')
  console.log('')
  console.log('     Everything else perfect: dry a week, 45% RH, 8 km/h, sandstone at 45°.')
  console.log('     Sun = 900 W/m² on the horizontal. Shade = the same air with no sun term.')
  console.log('')
  console.log('-'.repeat(96))
  console.log(
    `  ${padL('°F', 6)}${padL('°C', 6)}${padL('v1', 6)}${padL('sun', 6)}${padL('sun Dry%', 10)}` +
      `${padL('shade', 7)}${padL('shade Dry%', 12)}  ${pad('friction (sun)', 16)}`,
  )
  console.log('-'.repeat(96))

  for (const f of [45, 60, 72, 80, 86, 94, 100, 104, 108, 112, 120]) {
    const c = ((f - 32) * 5) / 9
    const v1 = conditionsScore(toScoreInput(v2({ airTempC: c }))).score

    const sun = evaluate(v2({ airTempC: c, shortwaveWm2: 900 }))
    const shade = evaluate(v2({ airTempC: c, shortwaveWm2: 0 }))

    console.log(
      `  ${padL(String(f), 6)}${padL(c.toFixed(1), 6)}${padL(num(v1), 6)}` +
        `${padL(num(sun.byWeights['55/45'] ?? null), 6)}${padL(num(sun.dryFractionScore), 10)}` +
        `${padL(num(shade.byWeights['55/45'] ?? null), 7)}${padL(num(shade.dryFractionScore), 12)}  ` +
        `${pad(sun.hour.friction?.level ?? '—', 16)}`,
    )
  }
  console.log('')
  console.log(`     The Mixed band is ${SCORE_BANDS.mixed}-${SCORE_BANDS.mostlyDry - 1}: "${stateLabel(50)}".`)
  console.log('')
}

/**
 * **Continuity, which is the invariant issue #148 was filed over.**
 *
 * v1 stepped 6 points of the total at 95 °F, from a fifth of a degree no
 * forecast resolves, and every mechanism that made a zero matter amplified it.
 * The v1 scorer now carries a tenths walk in its own tests; this is the same
 * walk over the new model, printed rather than asserted, because a harness
 * showing the largest step in the whole range is what makes it obvious when one
 * reappears. `hourlyConditions.test.ts` is where it fails a build.
 */
/**
 * One hour whose only variable is how far the wall's mass temperature sits above
 * its dew point. Everything else is fixed and the rock is long dry, so the score
 * moves for exactly one reason.
 */
function dewMarginHour(marginC: number): HourlyConditions {
  const sc = v2({ airTempC: 16, rhPct: 80, shortwaveWm2: 0 })
  const dew = dewPointC(sc.airTempC, sc.rhPct)
  return evaluateHour(
    {
      valid_at: '—',
      airTempC: sc.airTempC,
      dewPointC: dew,
      windKmh: sc.windKmh,
      cloudPct: sc.cloudPct,
      shortwaveWm2: 0,
      massTempC: dew + marginC,
      effectiveDryHours: 500,
      rockType: sc.rockType,
      cliffAngleDeg: sc.cliffAngle,
    },
    true,
  )
}

function continuityWalk(): void {
  console.log('')
  console.log('  3. CONTINUITY — the largest single-tenth-of-a-degree move, anywhere')
  console.log('')

  const probe = (
    label: string,
    over: Partial<V2Scenario>,
    score: (hour: HourlyConditions) => number | null,
  ) => {
    let worst = 0
    let worstAt = 0
    let previous: number | null = null
    for (let tenths = -200; tenths <= 600; tenths++) {
      const c = tenths / 10
      const value = score(runScenario(v2({ ...over, airTempC: c }), DEFAULT_WEIGHTS))
      if (value !== null && previous !== null) {
        const move = Math.abs(value - previous)
        if (move > worst) {
          worst = move
          worstAt = c
        }
      }
      previous = value
    }
    console.log(
      `     ${pad(label, 40)} worst step ${worst} point(s) at ${worstAt.toFixed(1)} °C`,
    )
  }

  probe('v2 55/45, sun', { shortwaveWm2: 900 }, (h) => h.score)
  probe('v2 55/45, shade', { shortwaveWm2: 0 }, (h) => h.score)
  probe('v2 dry-skin map, sun', { shortwaveWm2: 900 }, (h) => dryFractionScoreOf(h))
  probe('v2 55/45, sun, 12h after rain', { shortwaveWm2: 900, hoursSinceRain: 12 }, (h) => h.score)
  probe('v2 55/45, sun, condensing wall', { shortwaveWm2: 900, rhPct: 95, massOffsetC: -3 }, (h) => h.score)

  let v1Worst = 0
  let v1WorstAt = 0
  let previous: number | null = null
  for (let tenths = -200; tenths <= 600; tenths++) {
    const c = tenths / 10
    const value = conditionsScore(toScoreInput(v2({ airTempC: c }))).score
    if (value !== null && previous !== null) {
      const move = Math.abs(value - previous)
      if (move > v1Worst) {
        v1Worst = move
        v1WorstAt = c
      }
    }
    previous = value
  }
  console.log(`     ${pad('v1 (production, post-#148)', 40)} worst step ${v1Worst} point(s) at ${v1WorstAt.toFixed(1)} °C`)

  // The other axis, and the one the temperature walk cannot reach: the wall
  // crossing its own dew point. `condensationFactor` is linear to exactly zero
  // there, and a fractional exponent has unbounded slope at zero — so the score
  // collapses into 0 over the last fraction of a degree rather than arriving
  // there. Measured rather than described, because it is a real property of the
  // shape and Phase 3 has to render it.
  let dewWorst = 0
  let dewWorstAt = 0
  let dewPrevious: number | null = null
  for (let tenths = -50; tenths <= 50; tenths++) {
    const margin = tenths / 10
    const value = dewMarginHour(margin).score
    if (value !== null && dewPrevious !== null) {
      const move = Math.abs(value - dewPrevious)
      if (move > dewWorst) {
        dewWorst = move
        dewWorstAt = margin
      }
    }
    dewPrevious = value
  }
  console.log(
    `     ${pad('v2 55/45, DEW MARGIN axis (rock dry)', 40)} worst step ${dewWorst} point(s) at ${dewWorstAt.toFixed(1)} °C margin`,
  )
  console.log('')
  console.log('     …and what that step actually looks like, either side of the dew point:')
  console.log('')
  for (const margin of [1.0, 0.5, 0.3, 0.2, 0.1, 0.0, -0.1]) {
    const hour = dewMarginHour(margin)
    console.log(
      `       margin ${padL(margin.toFixed(1), 5)} °C   score ${padL(num(hour.score), 3)}   ` +
        `${pad(stateLabel(hour.score), 18)}${hour.friction?.level ?? '—'}` +
        `${hour.friction?.condensing ? ', condensing' : ''}`,
    )
  }

  console.log('')
  console.log('  1 point is what rounding to a whole score forces. Anything above it is a step,')
  console.log('  and two of the rows above are. Both come from the same place and it is worth')
  console.log('  understanding before choosing anything in §5:')
  console.log('')
  console.log('  A WEIGHTED GEOMETRIC MEAN HAS UNBOUNDED SLOPE AT ZERO. The score is')
  console.log('  100 × wetness^0.55 × friction^0.45, and x^0.45 has an infinite derivative at')
  console.log('  x = 0 — so a factor that reaches EXACTLY zero does not arrive there, it')
  console.log('  collapses into it. A factor that only approaches zero has no such problem.')
  console.log('')
  console.log('  That is what separates the two sweat maps, and it is a measurement rather')
  console.log('  than a preference: exp(-w) never reaches zero and holds the issue #148')
  console.log('  invariant across the whole temperature axis. 1-w reaches zero at the point')
  console.log('  heat stress becomes uncompensable and steps 12 points off a tenth of a degree')
  console.log('  there — which is the exact defect #148 was filed over, in a new model.')
  console.log('')
  console.log('  The dew-margin row is the same shape and the sweat map does not fix it:')
  console.log('  condensationFactor is linear to exactly zero at the dew point, by design,')
  console.log('  because below it the wall is wet. It is left as it is, for one reason that')
  console.log('  the rows above the note make checkable rather than asserted: THE WHOLE')
  console.log('  COLLAPSE HAPPENS INSIDE THE BOTTOM BAND. The reading is `poor` and the words')
  console.log('  are "Wet or unsettled" on both sides of it, so no screen changes what it')
  console.log('  says — which is what made #148 a defect and this a steep curve. The score is')
  console.log('  already below 40 well before the step, and 0 is a true statement about a')
  console.log('  wall running with water.')
  console.log('')
  console.log('  It is still worth knowing, because Phase 3 will render these numbers: the')
  console.log('  three ways to soften it are a floor on the factor (the clamp this model was')
  console.log('  built to do without), a ramp that reaches zero with zero slope (which makes')
  console.log('  the whole condensation curve far harsher), or widening the ramp (which moves')
  console.log('  the step without removing it, because the infinite slope is at zero itself).')
  console.log('')
}

/** The two gaps that are deliberate, stated as numbers rather than as prose. */
function whatIsMissing(): void {
  console.log('')
  console.log('  4. WHAT v2 DELIBERATELY DOES NOT SAY')
  console.log('')
  console.log('-'.repeat(80))
  console.log(`  ${pad('Case', 44)}${padL('v1', 6)}${padL('v2', 6)}`)
  console.log('-'.repeat(80))

  const rows: [string, Partial<V2Scenario>][] = [
    ['-10 °C, everything else perfect', { airTempC: -10 }],
    ['-20 °C, everything else perfect', { airTempC: -20 }],
    ['60 km/h gale, everything else perfect', { windKmh: 60 }],
    ['80 km/h gale, everything else perfect', { windKmh: 80 }],
  ]
  for (const [label, over] of rows) {
    const sc = v2(over)
    const v1 = conditionsScore(toScoreInput(sc)).score
    const r = evaluate(sc)
    const f = r.hour.diagnostics.friction_factor
    const w = r.hour.diagnostics.wetness_factor
    console.log(
      `  ${pad(label, 44)}${padL(num(v1), 6)}${padL(num(r.byWeights['55/45'] ?? null), 6)}` +
        `    wetness ${num(w, 2)} × friction ${num(f, 2)}`,
    )
  }
  console.log('')
  console.log('  Both are BY DESIGN and both are reviewable.')
  console.log('')
  console.log('  COLD COSTS NOTHING IN FRICTION, and that is deliberate: both mechanisms the')
  console.log('  friction reading is built from genuinely improve as it gets colder — less')
  console.log('  water on the rock, and a hand that sheds sweat easily. Numb fingers are real')
  console.log('  and are a property of the climber, not the rock. v1 docked 12 points below')
  console.log('  -5 °C from a band nobody measured (scoring-findings.md §4).')
  console.log('')
  console.log('  BUT COLD IS NOT FREE, and this was not designed in — it fell out. Read the')
  console.log('  wetness column above: a cold wall dries slowly, because the vapour-pressure')
  console.log('  deficit that drives evaporation collapses with temperature. A week after')
  console.log('  rain at -20 °C the model still does not call the rock dry, where v1 gave it')
  console.log('  full drying credit at 168 flat hours regardless of the weather. That is the')
  console.log('  clock running at a rate rather than by the calendar (Layer 1d), and it is')
  console.log('  the single largest difference between the two models on ordinary days.')
  console.log('')
  console.log('  WIND is a positive here — it dries the rock and cools the hand. The handoff is')
  console.log('  explicit that safety stays out of the number and that the Severe+ alert')
  console.log('  suppression already carries lightning and extreme wind. v1 spent 15 points on')
  console.log('  it as a performance component. If a gale should cost something, it needs a')
  console.log('  mechanism, not a band.')
  console.log('')
}

/** The decision this phase stops for. */
function theDecision(): void {
  console.log('')
  console.log('  5. WHAT THE OWNER HAS TO DECIDE — Open Question 1, and one more')
  console.log('')
  console.log('  A. THE WEIGHT SPLIT. 55/45, 50/50 or 65/35 on wetness/friction. Read the')
  console.log('     columns in §1: the split decides whether a damp wall in perfect friction')
  console.log('     beats a dry one in bad friction. Nothing measures it.')
  console.log('')
  console.log('  B. THE SWEAT MAP, which turns out to matter more than the weights.')
  console.log('')
  console.log('     exp(-w)  the default. Never reaches zero, so the ordering above the point')
  console.log('              where heat stress becomes uncompensable survives, AND the issue')
  console.log('              #148 continuity invariant holds across the whole temperature')
  console.log('              axis (§3). More forgiving of a hot day — the optimistic')
  console.log('              direction, which issue #34 warns about.')
  console.log('     1 - w    the literal dry fraction of skin. Reaches exactly 0 when the body')
  console.log('              can no longer shed its heat, so every hour past that scores the')
  console.log('              same as a wall under a waterfall. Harsher, and it puts the 104 °F')
  console.log('              case where the handoff said it should land — but it STEPS 12')
  console.log('              POINTS off a tenth of a degree doing it (§3).')
  console.log('')
  console.log('     The recommendation is exp(-w), and #148 is the reason rather than taste.')
  console.log('     If the 104 °F case has to land lower than 58, the lever that does it')
  console.log('     without reintroducing a step is the metabolic rate, not the map.')
  console.log('')
  console.log('     Both are in §1 and §2. Neither is measured. `w` is skin wettedness —')
  console.log('     E_required / E_max — and the metabolic rate in its numerator is the other')
  console.log('     judgement call, costed in the M500 column.')
  console.log('')
  console.log('  C. WHETHER 58 IS LOW ENOUGH FOR 104 °F. The handoff asked for "materially')
  console.log('     below the Mixed band" and offered an illustrative 48; the model built to')
  console.log('     its own specification returns 58 with sun on the wall and 65 in shade —')
  console.log('     inside Mixed, thirty points below where production puts it today, with')
  console.log('     Friction: Poor and Rock: Dry. No cap, veto or clamp was used to get there')
  console.log('     and the handoff said the table, not the criteria, was the thing to')
  console.log('     replace. Whether that is far enough is the owner\'s call.')
  console.log('')
}

export function printV2Comparison(): void {
  // A hand-check that the default map is the one the model actually uses, so the
  // "Dry%" column cannot silently become a second copy of the default column.
  if (sweatFrictionFactor(1) === dryFractionFrictionFactor(1)) {
    throw new Error('the two sweat maps have converged — one of them is not what it says it is')
  }

  console.log('')
  console.log('='.repeat(112))
  console.log('SCORING MODEL v2 — the two readings, and the number derived from them')
  console.log('='.repeat(112))
  console.log('')
  console.log('  Phase 2 of docs/handoffs/weatherteam6-scoring-model-handoff-v1.md.')
  console.log('  NOTHING BELOW IS APPLIED. Production still returns the "Now" column.')
  console.log('')
  console.log('    score = 100 × wetness^w × friction^f          w + f = 1')
  console.log('')
  console.log('  There is no cap, no veto and no clamp on the total anywhere in the model.')
  console.log('  A bad factor drags the result down because that is what multiplying is.')
  console.log('')
  console.log('  Each scenario is ONE HOUR, so the drying clock is approximated as elapsed')
  console.log('  hours × this hour\'s drying rate. The real evaluation accumulates hour by')
  console.log('  hour — `npm run compare:hourly-v2` runs that against a live location.')
  console.log('')
  console.log('  One behaviour change to know before reading: v2 resets the drying clock on')
  console.log('  any hour with 0.5 mm of rain, where v1 needed 2 mm in a day. Showers that')
  console.log('  v1 ignored now re-wet the wall, which reads wetter.')

  scenarioTable()
  temperatureSlide()
  continuityWalk()
  whatIsMissing()
  theDecision()
}

