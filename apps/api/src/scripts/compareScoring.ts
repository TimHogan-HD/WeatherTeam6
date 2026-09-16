/**
 * Score impact harness — what the research findings did, and would still do, to real scores.
 *
 * `npm run compare:scoring --workspace=apps/api`
 *
 * **One finding has now been applied; the rest have not.** Issue #137 shipped on
 * 2026-09-16 and the concave drying ramp is what production does today, so it is
 * the `Now` column rather than a proposal. This script changes no production code
 * path: it imports the real scorer, reimplements the variants beside it, and
 * prints them together.
 *
 * Deliberately offline and deterministic — no database, no network, no clock
 * dependence. It is not a `check:*` script because it has no pass/fail: it is a
 * report, and its output *is* the result.
 *
 * Three columns, and they are independent of each other:
 *
 *   Pre  **The linear ramp, as production scored before #137.** Kept so the size
 *        of that change stays readable rather than becoming folklore. The
 *        research corrected the saturation curve — weakening happens at *low*
 *        moisture contents, so a linear ramp is most wrong near its end, the day
 *        after rain when the wall looks dry.
 *
 *   Now  **Production today.** Concave ramp, exponent `RAMP_EXPONENT`.
 *
 *   Geo  **Weighted geometric mean** (issue #21, still open). The additive sum
 *        lets four good components outvote one fatal one, which is why 104 °F can
 *        only cost 12 points. A geometric mean lets any single near-zero factor
 *        drag the whole result down, which is how climbers actually talk. It is
 *        applied on top of the shipped ramp, because that is what shipping it
 *        would now mean.
 *
 * **The exponent and the floor below are judgement calls, not measurements.**
 * The research establishes the *shape* of the drying curve and says nothing
 * about its exponent, because nobody has measured a drying curve for any
 * climbing rock. That was true when the exponent was a proposal and it is still
 * true now that it ships. Treat both constants as dials to argue about, and see
 * `scoring-findings.md` §1.2 and §1.4.
 */
import { conditionsScore } from '../lib/scoring/conditionsScore.js'
import { TEMP_BAND_C } from '@weatherteam6/types'
import type { ScoreInput } from '@weatherteam6/types'

type RockType = ScoreInput['rockType']

/** Mirrors `conditionsScore`'s own table. Kept local so this script cannot alter it. */
const MAX_HOURS: Record<RockType, number> = {
  sandstone: 72,
  limestone: 24,
  granite: 12,
  basalt: 48,
  basalt_dense: 8,
  basalt_vesicular: 48,
  unknown: 48,
}

/**
 * Curvature of the drying ramp. **This must equal `RAMP_EXPONENT` in
 * `conditionsScore.ts`** — it is mirrored rather than imported for the same
 * reason `MAX_HOURS` is, and the MISMATCH check below is what catches a drift.
 * `1` reproduces the pre-#137 linear curve, which is the `Pre` column.
 * `2` halves the credit at the midpoint (0.5 → 0.25) while still reaching full
 * marks at the same hour.
 *
 * **Note what this does not do.** It makes the ramp far more conservative
 * *through* its range but keeps the same endpoint. Pushing full marks later is a
 * separate lever — raising `MAX_HOURS` — and the research does not settle either.
 * That lever was deliberately not pulled by #137: the ceiling is pinned to
 * `dryingModel`'s `estimated_dry` by a cross-module test.
 */
const RAMP_EXPONENT = 2

/**
 * Floor applied to each normalised component before the geometric mean.
 *
 * Without it a single component at exactly 0 forces the whole score to 0. That
 * is arguably correct for drying and indefensible for humidity, which hits 0 at
 * 90% RH — a damp day, not an impossible one. `0.05` means a fully failed
 * component costs most of the score without erasing it.
 */
const GEO_FLOOR = 0.05

type Components = { drying: number; rain: number; wind: number; temp: number; humidity: number }

/** The raw component values, recomputed exactly as `conditionsScore` does. */
function rawComponents(input: ScoreInput, rampExponent: number): Components {
  const angleFactor = 1.0 + (input.cliffAngle / 90) * 0.3
  const windFactor = input.currentWindKmh > 20 ? 0.8 : 1.0
  const humidityFactor = input.currentHumidityPct > 80 ? 1.3 : 1.0
  const maxDry = MAX_HOURS[input.rockType] * angleFactor * windFactor * humidityFactor

  let drying: number
  if (input.hoursSinceRain >= maxDry) drying = 40
  else if (input.hoursSinceRain <= 0) drying = 0
  else drying = Math.pow(input.hoursSinceRain / maxDry, rampExponent) * 40

  let rain: number
  if (input.forecastRain72hMm <= 0) rain = 25
  else if (input.forecastRain72hMm >= 10) rain = 0
  else rain = 25 * (1 - input.forecastRain72hMm / 10)

  let wind: number
  if (input.maxWindKmh24h <= 15) wind = 15
  else if (input.maxWindKmh24h >= 50) wind = 0
  else wind = 15 * (1 - (input.maxWindKmh24h - 15) / 35)

  const t = input.forecastHighC
  const { min, idealMin, idealMax, max } = TEMP_BAND_C
  let temp: number
  if (t < min || t > max) temp = 0
  else if (t >= idealMin && t <= idealMax) temp = 12
  else if (t < idealMin) temp = ((t - min) / (idealMin - min)) * 12
  else temp = 12 - ((t - idealMax) / (max - idealMax)) * 6

  let humidity: number
  if (input.currentHumidityPct <= 50) humidity = 8
  else if (input.currentHumidityPct >= 90) humidity = 0
  else humidity = 8 * (1 - (input.currentHumidityPct - 50) / 40)

  return { drying, rain, wind, temp, humidity }
}

const WEIGHTS: Components = { drying: 40, rain: 25, wind: 15, temp: 12, humidity: 8 }

function additive(c: Components): number {
  return Math.min(
    100,
    Math.round(c.drying) +
      Math.round(c.rain) +
      Math.round(c.wind) +
      Math.round(c.temp) +
      Math.round(c.humidity),
  )
}

/**
 * Weighted geometric mean, using the existing point allocations as exponents.
 *
 * Keeping the current weights as exponents means the *ranking* of what matters
 * is unchanged — drying still dominates. What changes is that a component near
 * zero pulls the product down instead of merely contributing nothing.
 */
function geometric(c: Components): number {
  const keys = Object.keys(WEIGHTS) as (keyof Components)[]
  const product = keys.reduce((acc, k) => {
    const normalised = Math.max(GEO_FLOOR, c[k] / WEIGHTS[k])
    return acc * Math.pow(normalised, WEIGHTS[k] / 100)
  }, 1)
  return Math.round(product * 100)
}

type Scenario = { name: string; note: string; input: ScoreInput }

const base: ScoreInput = {
  rockType: 'sandstone',
  aspectDegrees: 180,
  cliffAngle: 45,
  hoursSinceRain: 72,
  lastRainMm: 0,
  forecastRain72hMm: 0,
  forecastRain72hP10: 0,
  forecastRain72hP90: 0,
  currentWindKmh: 8,
  maxWindKmh24h: 10,
  currentTempC: 16,
  forecastHighC: 16,
  currentHumidityPct: 45,
  forecastDateDaysOut: 1,
}

const s = (over: Partial<ScoreInput>): ScoreInput => ({ ...base, ...over })

const scenarios: Scenario[] = [
  {
    name: 'Perfect day, sandstone',
    note: 'Dry a week, no rain coming, 16 °C. Nothing here should move it.',
    input: s({ hoursSinceRain: 168 }),
  },
  {
    name: '12h after rain, sandstone',
    note: 'Still obviously wet. Everyone agrees it is low.',
    input: s({ hoursSinceRain: 12, lastRainMm: 12 }),
  },
  {
    name: '36h after rain, sandstone',
    note: 'THE CASE #137 IS ABOUT — looks dry, is not. Sandstone needs 72h+.',
    input: s({ hoursSinceRain: 36, lastRainMm: 12 }),
  },
  {
    name: '60h after rain, sandstone',
    note: 'Nearly there by the old linear curve. The research said be slower.',
    input: s({ hoursSinceRain: 60, lastRainMm: 12 }),
  },
  {
    name: '36h after rain, granite',
    note: 'Same elapsed time, fast-drying rock. Should be barely affected.',
    input: s({ rockType: 'granite', hoursSinceRain: 36, lastRainMm: 12 }),
  },
  {
    name: '104 °F / 40 °C, everything else perfect',
    note: 'ISSUE #21. Dry, calm, no rain coming — and dangerously hot.',
    input: s({ hoursSinceRain: 168, forecastHighC: 40, currentTempC: 40 }),
  },
  {
    name: '-10 °C, everything else perfect',
    note: 'The other end of the band. Same structural question as #21.',
    input: s({ hoursSinceRain: 168, forecastHighC: -10, currentTempC: -10 }),
  },
  {
    name: 'Gale, everything else perfect',
    note: '60 km/h. A safety input per the community, not a performance one.',
    input: s({ hoursSinceRain: 168, currentWindKmh: 60, maxWindKmh24h: 60 }),
  },
  {
    name: '95% humidity, everything else perfect',
    note: 'Where GEO_FLOOR earns its keep — damp, not impossible.',
    input: s({ hoursSinceRain: 168, currentHumidityPct: 95 }),
  },
  {
    name: 'Heavy rain coming, rock currently dry',
    note: '15mm forecast. Dry now, pointless to drive.',
    input: s({ hoursSinceRain: 168, forecastRain72hMm: 15, forecastRain72hP90: 20 }),
  },
  {
    name: 'Mediocre across the board',
    note: 'Nothing fatal, nothing good. The case a geometric mean should NOT punish.',
    input: s({
      hoursSinceRain: 100,
      forecastRain72hMm: 4,
      maxWindKmh24h: 30,
      forecastHighC: 24,
      currentHumidityPct: 70,
    }),
  },
]

function pad(v: string, n: number): string {
  return v.length >= n ? v.slice(0, n) : v + ' '.repeat(n - v.length)
}
function padL(v: string, n: number): string {
  return v.length >= n ? v : ' '.repeat(n - v.length) + v
}
function delta(from: number, to: number): string {
  const d = to - from
  if (d === 0) return '     ·'
  return padL((d > 0 ? '+' : '') + String(d), 6)
}

function main(): void {
  console.log('')
  console.log('SCORE IMPACT — what the research findings changed, and would still change')
  console.log('='.repeat(96))
  console.log('')
  console.log('  "Now" is what production returns today. Pre and Geo are not applied.')
  console.log('')
  console.log(`  Pre       the linear ramp production used before #137 shipped`)
  console.log(`  Now       PRODUCTION — concave ramp, exponent ${RAMP_EXPONENT} (issue #137, shipped)`)
  console.log(`  Geo       weighted geometric mean, floor ${GEO_FLOOR} (issue #21, still open)`)
  console.log('')
  console.log('  Both constants are judgement calls. The research fixes the SHAPE of the')
  console.log('  drying curve and says nothing about its exponent — nobody has measured a')
  console.log('  drying curve for any climbing rock. See scoring-findings.md §1.2 and §1.4.')
  console.log('')
  console.log('-'.repeat(96))
  console.log(
    `  ${pad('Scenario', 38)}${padL('Pre', 5)}${delta(0, 0)}${padL('Now', 6)}${padL('Geo', 6)}${delta(0, 0)}`,
  )
  console.log('-'.repeat(96))

  for (const sc of scenarios) {
    const linear = rawComponents(sc.input, 1)
    const concave = rawComponents(sc.input, RAMP_EXPONENT)

    const pre = additive(linear)
    const now = additive(concave)
    const geo = geometric(concave)

    // Sanity: the real scorer must agree with this script's "Now" column, or
    // every other number here is measured against the wrong baseline. This is
    // the only thing keeping MAX_HOURS and RAMP_EXPONENT above in step with the
    // scorer's own copies, and it is why they are mirrored rather than imported.
    const real = conditionsScore(sc.input).score
    const mismatch = real !== now ? `  << MISMATCH: real scorer says ${real}` : ''

    console.log(
      `  ${pad(sc.name, 38)}${padL(String(pre), 5)}${delta(pre, now)}${padL(String(now), 6)}${padL(String(geo), 6)}${delta(now, geo)}${mismatch}`,
    )
    console.log(`    ${sc.note}`)
    console.log('')
  }

  console.log('-'.repeat(96))
  console.log('')
  console.log('  HOW TO READ IT')
  console.log('')
  console.log('  The Pre→Now delta is issue #137, already shipped. It was the smaller, safer')
  console.log('  change: it only moves days partway through drying, and it only moves them')
  console.log('  DOWN. Nothing else shifted. A fully dry day and a soaking one both sit still.')
  console.log('')
  console.log('  The Geo column is the structural one, and it is still a proposal. It barely')
  console.log('  touches a genuinely good day and collapses a day with one fatal component —')
  console.log('  which is the entire point of issue #21, and also why it needs looking at')
  console.log('  before it ships: it moves every score on every screen, not just the broken')
  console.log('  ones.')
  console.log('')
  console.log('  What NEITHER column can show: a crag that is seeping (#138), a wall in the')
  console.log('  sun (#139), or a cold rock face condensing at 90% humidity (#140). Those')
  console.log('  need inputs the scorer does not currently receive.')
  console.log('')
  console.log('  TWO THINGS THIS HARNESS SURFACED THAT THE RESEARCH DID NOT')
  console.log('')
  console.log('  1. Sandstone 12 hours after 12mm of rain still scores in the 60s, even')
  console.log('     after #137. The drying component correctly contributes almost nothing')
  console.log('     — and the other four hand back a full 60, because nothing about them')
  console.log('     is wrong. #137 could not fix this and was never going to: the drying')
  console.log('     component was already near its floor. That is the additive problem in')
  console.log('     its purest form, and a worse example than the 104 °F one #21 was filed')
  console.log('     over. It is the strongest argument in this table for the Geo column.')
  console.log('')
  console.log('  2. The geometric mean does NOT fully fix #21 on its own. A failed')
  console.log('     temperature component can only cost 30% of the score, because the')
  console.log(`     floor and temperature's 0.12 weight bound it: 1 - ${GEO_FLOOR}^0.12 = 0.30.`)
  console.log('     40 °C still scores 70. If "too hot to climb" should read lower than')
  console.log('     that, it needs a heavier temperature weight or a hard override —')
  console.log('     changing the mean alone is not enough. Worth settling on #21.')
  console.log('')
}

main()
