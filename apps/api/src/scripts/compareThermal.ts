/**
 * **Layer 1 sensitivity report — what the derived quantities actually do.**
 *
 * `npm run compare:thermal --workspace=apps/api`
 *
 * Phase 1 of `docs/handoffs/weatherteam6-scoring-model-handoff-v1.md` is
 * required to answer **Open Question 4** — *"is `α` allowed to vary by rock
 * type?"* — on a number rather than in the abstract, by printing what a
 * plausible pale-to-dark spread moves `T_surface` by, in °C, for the same
 * sunlit hour. § 1 below is that answer.
 *
 * The other sections are here because the same question gets asked of every
 * other constant in `rockThermal.ts` and the honest answer is always "run it and
 * look". Deliberately offline, deterministic and clock-free — no database, no
 * network. It is not a `check:*` script because it has no pass/fail: it is a
 * report, and its output *is* the result. Same standing as
 * `compare:scoring`.
 *
 * **Nothing here is calibrated.** Every figure is the model talking about
 * itself. It orders days; it does not measure them.
 */
import {
  ABSORPTANCE_SPREAD,
  ASPECT_QUALIFY_MARGIN_C,
  DRYING_RATE_MAX,
  MASS_TAU_HOURS,
  REFERENCE_EVAP_INDEX,
  SOLAR_ABSORPTANCE,
  condensationMarginC,
  dryingRateMultiplier,
  effectiveDryingHours,
  isCondensing,
  massTemperatureC,
  saturationVapourPressureKpa,
  surfaceCoefficient,
  surfaceTemperature,
} from '../lib/scoring/rockThermal.js'

const cToF = (c: number): number => (c * 9) / 5 + 32
const f1 = (n: number): string => n.toFixed(1)

function row(cells: (string | number)[], widths: number[]): string {
  return cells
    .map((cell, i) => {
      const s = String(cell)
      const w = widths[i] ?? 10
      return i === 0 ? s.padEnd(w) : s.padStart(w)
    })
    .join('  ')
}

function heading(text: string): void {
  console.log(`\n${text}`)
  console.log('-'.repeat(text.length))
}

/**
 * Dew point for a temperature and relative humidity, by inverting the same
 * Magnus form `saturationVapourPressureKpa` uses. Only the scenarios below need
 * it — the model itself never converts, because Open-Meteo supplies dew point
 * directly.
 */
function dewPointC(tempC: number, rhPct: number): number {
  const es = saturationVapourPressureKpa(tempC)
  if (es === null) throw new Error('unreachable: finite temperature')
  const gamma = Math.log((es * (rhPct / 100)) / 0.6108)
  return (237.3 * gamma) / (17.27 - gamma)
}

// ---------------------------------------------------------------------------

console.log('Rock thermal model — Layer 1 sensitivity report')
console.log(`α = ${SOLAR_ABSORPTANCE}   τ_mass = ${MASS_TAU_HOURS} h   `
  + `aspect margin = ${ASPECT_QUALIFY_MARGIN_C} °C   reference evap index = ${REFERENCE_EVAP_INDEX.toFixed(4)}`)
console.log('Air temperature is 25 °C and the wall is vertical under a clear sky unless a row says otherwise.')

// ---------------------------------------------------------------------------
heading('1. Open Question 4 — what a pale-to-dark α spread does to T_surface')

console.log(
  `Pale α = ${ABSORPTANCE_SPREAD.pale}, dark α = ${ABSORPTANCE_SPREAD.dark} `
    + '(albedo ~0.6 for light granite to ~0.1 for dark rock, Hall et al. via rock-drying-research §3).',
)
console.log('"Qual" is the per-hour aspect flag: can the unknown wall orientation change this answer?\n')

const irradiances = [0, 20, 60, 150, 300, 500, 700, 900, 1000]
const winds = [0, 10, 25, 50]
const oq4Widths = [12, 9, 8, 9, 9, 9, 9, 6]

console.log(row(['wind km/h', 'I W/m²', 'h_o', 'pale °C', 'α=0.65', 'dark °C', 'spread', 'Qual'], oq4Widths))

type Oq4Row = { qualified: boolean; spread: number }
const oq4: Oq4Row[] = []

for (const windKmh of winds) {
  for (const shortwaveWm2 of irradiances) {
    const at = (absorptance: number) =>
      surfaceTemperature({
        airTempC: 25,
        shortwaveWm2,
        windKmh,
        cloudPct: 0,
        cliffAngleDeg: 0,
        absorptance,
      })
    const pale = at(ABSORPTANCE_SPREAD.pale)
    const mid = at(SOLAR_ABSORPTANCE)
    const dark = at(ABSORPTANCE_SPREAD.dark)
    if (pale.t_surface_c === null || mid.t_surface_c === null || dark.t_surface_c === null) continue
    const spread = dark.t_surface_c - pale.t_surface_c
    oq4.push({ qualified: mid.qualified, spread })
    console.log(
      row(
        [
          shortwaveWm2 === irradiances[0] ? String(windKmh) : '',
          shortwaveWm2,
          f1(surfaceCoefficient(25, windKmh) ?? Number.NaN),
          f1(pale.t_surface_c),
          f1(mid.t_surface_c),
          f1(dark.t_surface_c),
          f1(spread),
          mid.qualified ? 'yes' : 'NO',
        ],
        oq4Widths,
      ),
    )
  }
  console.log('')
}

const qualifiedRows = oq4.filter((r) => r.qualified)
const unqualifiedRows = oq4.filter((r) => !r.qualified)
const worstQualified = qualifiedRows.reduce((m, r) => Math.max(m, r.spread), 0)
const worstUnqualified = unqualifiedRows.reduce((m, r) => Math.max(m, r.spread), 0)

console.log(
  `\nLargest α spread on an hour the model calls QUALIFIED:   ${f1(worstQualified)} °C`
    + `  (${qualifiedRows.length} rows)`,
)
console.log(
  `Largest α spread on an hour the model calls UNQUALIFIED: ${f1(worstUnqualified)} °C`
    + `  (${unqualifiedRows.length} rows)`,
)
console.log(
  '\nREAD THIS AS: rock tone only moves the hours whose reading is already flagged as\n'
    + 'unanswerable without an aspect nothing writes. On the hours a user can actually rely\n'
    + 'on today, a pale wall and a dark wall are the same wall. A per-rock-type α would be a\n'
    + 'fourth set of invented constants buying precision exactly where the model has already\n'
    + 'declined to be precise — and it is inert until Phase 4 regardless, because rock type is\n'
    + 'unset on every user-added location. One constant. Revisit when aspect exists.',
)

// ---------------------------------------------------------------------------
heading('2. A clear September day, vertical wall, light breeze')

// Irradiance shaped as a half-sine over a 13-hour day, peaking at 900 W/m².
const dayHours = Array.from({ length: 24 }, (_, h) => {
  const t = (h - 6) / 13
  return t >= 0 && t <= 1 ? 900 * Math.sin(Math.PI * t) : 0
})

console.log(row(['hour', 'I W/m²', 'T_air °C', 'T_surf °C', '°F', 'gain', 'Qual'], [6, 9, 9, 10, 7, 7, 6]))
for (let h = 0; h < 24; h++) {
  const airTempC = 18 + 9 * Math.sin((Math.PI * (h - 5)) / 14)
  const out = surfaceTemperature({
    airTempC,
    shortwaveWm2: dayHours[h]!,
    windKmh: 12,
    cloudPct: 10,
    cliffAngleDeg: 0,
  })
  console.log(
    row(
      [
        `${String(h).padStart(2, '0')}:00`,
        Math.round(dayHours[h]!),
        f1(airTempC),
        out.t_surface_c === null ? '—' : f1(out.t_surface_c),
        out.t_surface_c === null ? '—' : f1(cToF(out.t_surface_c)),
        out.solar_gain_c === null ? '—' : f1(out.solar_gain_c),
        out.qualified ? 'yes' : 'NO',
      ],
      [6, 9, 9, 10, 7, 7, 6],
    ),
  )
}
console.log(
  '\nThe dawn and evening rows are qualified and the middle of the day is not — which is the\n'
    + 'property § Unknown aspect was decided for: the windows people actually use survive.',
)

// ---------------------------------------------------------------------------
heading('3. T_mass and condensation — the same humidity, opposite answers')

// scoring-findings.md §3.1: 10 °C and 90% RH after a cold week vs after a warm one.
const nowAirC = 10
const nowDewC = dewPointC(nowAirC, 90)
for (const [label, previousC] of [
  ['after a week at 0 °C', 0],
  ['after a week at 25 °C', 25],
] as const) {
  // Six days of the previous regime, then 24 h of today's air temperature.
  const series = [...Array.from({ length: 144 }, () => previousC), ...Array.from({ length: 24 }, () => nowAirC)]
  const tMass = massTemperatureC(series)
  const margin = condensationMarginC(tMass, nowDewC)
  console.log(
    `  ${label.padEnd(22)} T_mass ${tMass === null ? '—' : f1(tMass).padStart(5)} °C   `
      + `dew point ${f1(nowDewC)} °C   margin ${margin === null ? '—' : f1(margin).padStart(5)} °C   `
      + `${isCondensing(margin) ? 'CONDENSING' : 'dry'}`,
  )
}
console.log(
  '\nIdentical air temperature, identical humidity, opposite answers — discriminated by a\n'
    + 'variable the v1 scorer does not have. That is the whole reason T_mass exists.',
)

// ---------------------------------------------------------------------------
heading('4. Drying rate against the reference hour')

const dryingCases: { label: string; surfaceTempC: number; rhPct: number; windKmh: number }[] = [
  { label: 'reference (15 °C, 60%, 10 km/h)', surfaceTempC: 15, rhPct: 60, windKmh: 10 },
  { label: 'cold damp still', surfaceTempC: 3, rhPct: 95, windKmh: 2 },
  { label: 'mild overcast', surfaceTempC: 12, rhPct: 85, windKmh: 8 },
  { label: 'spring afternoon', surfaceTempC: 22, rhPct: 50, windKmh: 15 },
  { label: 'desert midday', surfaceTempC: 45, rhPct: 15, windKmh: 20 },
  { label: 'muggy summer', surfaceTempC: 30, rhPct: 85, windKmh: 5 },
]

console.log(row(['conditions', 'dew °C', 'index', '× ref', 'sandstone 72h →'], [34, 9, 9, 9, 18]))
for (const c of dryingCases) {
  // RH here is relative to the surface temperature, which is what a wet wall sees.
  const dew = dewPointC(c.surfaceTempC, c.rhPct)
  const rate = dryingRateMultiplier({ surfaceTempC: c.surfaceTempC, dewPointC: dew, windKmh: c.windKmh })
  const hours = rate === null || rate === 0 ? null : 72 / rate
  console.log(
    row(
      [
        c.label,
        f1(dew),
        rate === null ? '—' : f1(rate * REFERENCE_EVAP_INDEX),
        rate === null ? '—' : rate.toFixed(2),
        hours === null ? 'never' : `${Math.round(hours)} h`,
      ],
      [34, 9, 9, 9, 18],
    ),
  )
}
console.log(
  `\nThe cap is ${DRYING_RATE_MAX}×, so the fastest a 72-hour sandstone window can close is 24 hours.`
    + '\nThe rock-type windows are folklore (scoring-findings §4); the cap is what stops physics\n'
    + 'multiplying a made-up number by six and calling the result precise.',
)

// ---------------------------------------------------------------------------
heading('5. An unmeasured hour is not a dry hour')

const measured = Array.from({ length: 48 }, () => 1.2)
const withHole = [...measured.slice(0, 20), ...Array.from({ length: 12 }, () => null), ...measured.slice(32)]
const full = effectiveDryingHours(measured)
const holed = effectiveDryingHours(withHole)
console.log(`  48 measured hours at 1.2×:      ${f1(full.effective_hours)} effective h, `
  + `${full.unmeasured_hours} unmeasured`)
console.log(`  the same window with a 12 h hole: ${f1(holed.effective_hours)} effective h, `
  + `${holed.unmeasured_hours} unmeasured`)
console.log(
  '\nThe hole costs 14.4 effective hours rather than being filled in at the reference rate.\n'
    + 'That reads the wall as wetter than it is, which is the direction issue #34 requires — and\n'
    + 'the unmeasured count is returned so Phase 2 can withhold entirely when the hole is large.',
)

console.log('')
