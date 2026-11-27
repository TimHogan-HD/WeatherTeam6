/**
 * **Which rock temperature should condensation read? Measured against USCRN.**
 *
 * `npm run compare:condensation-margin --workspace=apps/api`
 *
 * Condensation needs a surface below the dew point of the air touching it.
 * Crag A compares the dew point with `T_mass + gain`: a 48 h trailing air
 * average (`MASS_TAU_HOURS`) plus the wall's lagged sun. `MASS_TAU_HOURS`
 * itself records the tension this tests: conduction puts the outer few
 * centimetres of rock on a time constant of hours, the climbers' rule
 * (`scoring-findings.md` §3.1) on days. On 2026-11-28 at Sandstone the
 * mass margin read −1.4 °C at 11 am while the modelled surface sat 6 °C over
 * the dew point, and the score halved.
 *
 * Nothing measures a cliff. NOAA's Climate Reference Network measures the
 * infrared temperature of the ground surface (`SUR_TEMP`), air temperature,
 * humidity and sunlight, hourly, at a station 6 miles from Sandstone among
 * others. This drives every candidate from the station's **own measured air
 * temperature and sunlight**, so the candidates differ only in how much of the
 * multi-day mass they let into the surface, and scores each against the
 * measured surface minus the measured dew point:
 *
 * - **production**: `T_mass + lagged gain − T_dew` (`condensationMarginA`).
 * - **surface**: the lagged sol-air surface (`T_surface`) − `T_dew`.
 * - **blend w**: `(1 − w) · T_surface + w · T_mass − T_dew`, the surface pulled
 *   toward the mass by conduction.
 *
 * Wind and cloud are not measured at these stations and are held at
 * `WIND_KMH` and `CLOUD_PCT` for every candidate alike.
 *
 * **Read it knowing what the truth is.** Flat ground cools to the sky far more
 * than a wall (dew on grass most summer nights), so measured condensation is
 * an upper bound on a wall's: a candidate that condenses *more* than the ground
 * is wrong, one that condenses less may be right. The humid stations sit on
 * grass, which transpires and reads cool (`compare:rock-temp`); the arid ones
 * on bare soil, the nearest thing to rock. Soil has less thermal mass than
 * rock, which leans the fit toward a smaller `w`. Hours are climbing hours
 * (8–18 local standard time), April to `END`: winter is left out because a
 * snow surface reads 0 °C under warm air.
 *
 * Network only, no database. Its output is the result.
 */
import { CONDENSATION_CLEAR_MARGIN_C } from '../lib/scoring/hourlyConditions.js'
import { laggedSurfaceC, massTemperatureC, MASS_TAU_HOURS, surfaceTemperature } from '../lib/scoring/rockThermal.js'
import { fetchWithRetry } from '../lib/weather/openMeteo.js'

const YEAR = 2026
const START = '2026-04-01'
const FLAT_GROUND = 90
const WIND_KMH = 10
const CLOUD_PCT = 50
const BLENDS = [0.2, 0.35, 0.5] as const
const MASS_WINDOW = 2 * MASS_TAU_HOURS

const GROUPS: Record<string, string[]> = {
  arid: [
    'NV_Mercury_3_SSW', 'UT_Torrey_7_E', 'WY_Lander_11_SSE', 'AZ_Tucson_11_W',
    'CO_Boulder_14_W', 'CA_Yosemite_Village_12_W',
  ],
  humid: [
    'MN_Sandstone_6_W', 'WI_Necedah_5_WNW', 'TN_Crossville_7_NW', 'NC_Asheville_13_S',
    'WV_Elkins_21_ENE', 'NY_Millbrook_3_W', 'KY_Versailles_3_NNW',
  ],
  'Sandstone only': ['MN_Sandstone_6_W'],
}

type Hour = {
  /** Local standard time, `YYYY-MM-DD`, and its hour ending 1–24. */
  lstDate: string
  lstHour: number
  airC: number | null
  sunWm2: number | null
  surfaceC: number | null
  rh: number | null
}

const reading = (field: string | undefined, flag?: string): number | null => {
  if (flag !== undefined && flag !== '0') return null
  const v = Number(field)
  return Number.isFinite(v) && v > -9990 ? v : null
}

/** Magnus over water (Alduchov & Eskridge 1996). Null in, null out. */
function dewPointC(airC: number | null, rh: number | null): number | null {
  if (airC === null || rh === null || rh <= 0 || rh > 100) return null
  const g = Math.log(rh / 100) + (17.62 * airC) / (243.12 + airC)
  return (243.12 * g) / (17.62 - g)
}

/** Hourly02 rows in file order (UTC hour ending, gap-free in practice). */
async function uscrn(station: string): Promise<Hour[]> {
  const res = await fetchWithRetry(
    `https://www.ncei.noaa.gov/pub/data/uscrn/products/hourly02/${YEAR}/CRNH0203-${YEAR}-${station}.txt`,
  )
  if (!res.ok) throw new Error(`USCRN ${station}: HTTP ${res.status}`)
  return (await res.text())
    .trim()
    .split('\n')
    .map((row) => {
      const f = row.trim().split(/\s+/)
      const d = f[3]!
      return {
        lstDate: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`,
        lstHour: Number(f[4]!.slice(0, 2)),
        airC: reading(f[9]),
        sunWm2: reading(f[13], f[14]),
        surfaceC: reading(f[20], f[21]),
        rh: reading(f[26], f[27]),
      }
    })
}

type Tally = {
  n: number
  sumErr: number
  absErr: number
  /** Measured surface below the dew point. */
  truth: number
  predicted: number
  hit: number
  /** Hours the candidate's margin is inside the ramp, where the score loses points. */
  penalised: number
  /** …and the measured margin was not. */
  penalisedWrongly: number
}
const newTally = (): Tally => ({ n: 0, sumErr: 0, absErr: 0, truth: 0, predicted: 0, hit: 0, penalised: 0, penalisedWrongly: 0 })

const SEASONS: Record<string, (month: number) => boolean> = {
  'Apr–Nov': () => true,
  'summer Jun–Aug': (m) => m >= 6 && m <= 8,
  'autumn Sep–Nov': (m) => m >= 9 && m <= 11,
}

function evaluate(hours: Hour[], tallies: Map<string, Tally>) {
  const airs: (number | null)[] = []
  let surfacePrev: number | null = null
  let gainPrev: number | null = null

  for (const h of hours) {
    airs.push(h.airC)
    const mass = massTemperatureC(airs.slice(-MASS_WINDOW))
    const instant = surfaceTemperature({
      airTempC: h.airC,
      shortwaveWm2: h.sunWm2 === null ? null : Math.max(0, h.sunWm2),
      windKmh: WIND_KMH,
      cloudPct: CLOUD_PCT,
      cliffAngleDeg: FLAT_GROUND,
    })
    const surface = laggedSurfaceC(surfacePrev, instant.t_surface_c)
    const gain = laggedSurfaceC(gainPrev, instant.solar_gain_c)
    surfacePrev = surface
    gainPrev = gain

    if (h.lstDate < START || h.lstHour < 9 || h.lstHour > 19) continue
    const dew = dewPointC(h.airC, h.rh)
    if (mass === null || surface === null || gain === null || dew === null || h.surfaceC === null) continue

    const measured = h.surfaceC - dew
    const candidates: Record<string, number> = {
      production: mass + gain,
      surface,
      ...Object.fromEntries(BLENDS.map((w) => [`blend ${w}`, (1 - w) * surface + w * mass])),
    }
    const month = Number(h.lstDate.slice(5, 7))
    for (const [season, inSeason] of Object.entries(SEASONS)) {
      if (!inSeason(month)) continue
      for (const [name, rockC] of Object.entries(candidates)) {
        const key = `${season}|${name}`
        const t = tallies.get(key) ?? newTally()
        const margin = rockC - dew
        t.n += 1
        t.sumErr += rockC - h.surfaceC
        t.absErr += Math.abs(rockC - h.surfaceC)
        if (measured < 0) t.truth += 1
        if (margin < 0) t.predicted += 1
        if (margin < 0 && measured < 0) t.hit += 1
        if (margin < CONDENSATION_CLEAR_MARGIN_C) {
          t.penalised += 1
          if (measured >= CONDENSATION_CLEAR_MARGIN_C) t.penalisedWrongly += 1
        }
        tallies.set(key, t)
      }
    }
  }
}

const pct = (a: number, b: number) => (b === 0 ? '   —' : `${((100 * a) / b).toFixed(0).padStart(3)}%`)

async function main() {
  console.log(`compare:condensation-margin — USCRN ${START} onward, climbing hours 8–18 LST.`)
  console.log('Surface error is the candidate rock temperature against the measured ground surface, °C (+ reads warm).')
  console.log('Condensing = margin under 0. Penalised = margin under the 2 °C ramp; "wrongly" = the measured margin was ≥ 2.')
  const cache = new Map<string, Hour[]>()
  for (const [group, stations] of Object.entries(GROUPS)) {
    const tallies = new Map<string, Tally>()
    for (const station of stations) {
      let hours = cache.get(station)
      if (!hours) {
        hours = await uscrn(station)
        cache.set(station, hours)
      }
      evaluate(hours, tallies)
    }
    console.log(`\n######## ${group} (${stations.length} station${stations.length === 1 ? '' : 's'})`)
    for (const season of Object.keys(SEASONS)) {
      console.log(`\n== ${season}`)
      console.log('  candidate        bias   MAE   measured cond.  predicted  caught   penalised  wrongly')
      for (const [key, t] of tallies) {
        const [s, name] = key.split('|') as [string, string]
        if (s !== season) continue
        console.log(
          `  ${name.padEnd(14)} ${(t.sumErr / t.n).toFixed(1).padStart(5)} ${(t.absErr / t.n).toFixed(1).padStart(5)}` +
            `   ${pct(t.truth, t.n)} of ${String(t.n).padStart(5)}    ${pct(t.predicted, t.n)}     ${pct(t.hit, t.truth)}` +
            `      ${pct(t.penalised, t.n)}     ${pct(t.penalisedWrongly, t.penalised)}`,
        )
      }
    }
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
