/**
 * **How good is the modelled rock temperature? Measured against USCRN.**
 *
 * `npm run compare:rock-temp --workspace=apps/api`
 *
 * Nothing measures a cliff. NOAA's Climate Reference Network measures the two
 * things `T_surface` is built from and the thing it predicts: downward sunlight
 * (a pyranometer, `SOLARAD`) and the infrared temperature of the ground surface
 * (`SUR_TEMP`), hourly. This scores the real `evaluateHourlyConditions` series
 * path against them over the past `PAST_DAYS`, with every weather input from
 * Open-Meteo's archived short-lead forecasts, the same inputs a live reading
 * uses. It is the evidence behind `SURFACE_TAU_HOURS`.
 *
 * - **Surface temperature**, °C, per method: bias (+ reads hot), MAE, RMSE, on
 *   daytime hours (measured sun > 50 W/m²), split by what the pyranometer saw.
 * - **Sunlight**, W/m², per source, against the pyranometer.
 * - **Absorptance**, fitted on measured sun and air. Compare it to
 *   `SOLAR_ABSORPTANCE`.
 *
 * **The truth is ground, not rock, and the two groups are read differently.**
 * The arid stations sit on bare soil, the nearest thing the network has to
 * rock. The humid ones sit on grass, which transpires: it fits an absorptance
 * near 0.3 and reads every sunlit method hot. Tune against the arid group; the
 * humid group is a check on direction only. Every surface here is horizontal,
 * so nothing measures what the wall geometry does.
 *
 * Network only, no database. Its output is the result.
 */
import { evaluateHourlyConditions, type WeatherHour } from '../lib/scoring/hourlyConditions.js'
import {
  SOLAR_ABSORPTANCE,
  skyCoolingC,
  surfaceCoefficient,
  surfaceTemperature,
} from '../lib/scoring/rockThermal.js'
import { fetchWithRetry } from '../lib/weather/openMeteo.js'

const PAST_DAYS = 90
/** Horizontal, because every USCRN surface sensor looks at flat ground. */
const FLAT_GROUND = 90
const DAYLIGHT_WM2 = 50
const MEASURED_OVERCAST_WM2 = 250
const MEASURED_SUNNY_WM2 = 600
/** A forecast this much brighter than the pyranometer is the Red Wing miss of 2026-09-29. */
const TOO_BRIGHT_WM2 = 250
const MODELS = ['gfs_seamless', 'ecmwf_ifs025', 'icon_seamless'] as const

const GROUPS: Record<'arid' | 'humid', string[]> = {
  arid: [
    'NV_Mercury_3_SSW', 'UT_Torrey_7_E', 'WY_Lander_11_SSE', 'AZ_Tucson_11_W',
    'CO_Boulder_14_W', 'CA_Yosemite_Village_12_W',
  ],
  humid: [
    'MN_Sandstone_6_W', 'WI_Necedah_5_WNW', 'TN_Crossville_7_NW', 'NC_Asheville_13_S',
    'WV_Elkins_21_ENE', 'NY_Millbrook_3_W', 'KY_Versailles_3_NNW',
  ],
}

type Observation = { airC: number | null; sunWm2: number | null; surfaceC: number | null }

const reading = (field: string | undefined, flag?: string): number | null => {
  if (flag !== undefined && flag !== '0') return null
  const v = Number(field)
  return Number.isFinite(v) && v > -9990 ? v : null
}

/** Keyed by the UTC hour the observation ends, `YYYY-MM-DDTHH:00`, as Open-Meteo stamps. */
async function uscrn(station: string, years: number[]) {
  const byHour = new Map<string, Observation>()
  let lat = NaN
  let lon = NaN
  for (const year of years) {
    const res = await fetchWithRetry(
      `https://www.ncei.noaa.gov/pub/data/uscrn/products/hourly02/${year}/CRNH0203-${year}-${station}.txt`,
    )
    if (!res.ok) throw new Error(`USCRN ${station} ${year}: HTTP ${res.status}`)
    for (const line of (await res.text()).trim().split('\n')) {
      const f = line.trim().split(/\s+/)
      const d = f[1]!
      const hm = f[2]!
      lon = Number(f[6])
      lat = Number(f[7])
      byHour.set(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${hm.slice(0, 2)}:00`, {
        airC: reading(f[9]),
        sunWm2: reading(f[13], f[14]),
        surfaceC: reading(f[20], f[21]),
      })
    }
  }
  return { lat, lon, byHour }
}

type Hourly = Record<string, (number | null)[]> & { time: string[] }

async function forecasts(lat: number, lon: number, start: string, end: string): Promise<Hourly> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    start_date: start,
    end_date: end,
    hourly: 'temperature_2m,dew_point_2m,shortwave_radiation,wind_speed_10m,cloud_cover,precipitation',
    models: MODELS.join(','),
    timezone: 'GMT',
  })
  const res = await fetchWithRetry(`https://historical-forecast-api.open-meteo.com/v1/forecast?${params}`)
  if (!res.ok) throw new Error(`Open-Meteo ${lat},${lon}: HTTP ${res.status}`)
  return ((await res.json()) as { hourly: Hourly }).hourly
}

type Stat = { n: number; sum: number; abs: number; sq: number }
const newStat = (): Stat => ({ n: 0, sum: 0, abs: 0, sq: 0 })
function record(table: Map<string, Stat>, key: string, error: number) {
  const s = table.get(key) ?? newStat()
  s.n += 1
  s.sum += error
  s.abs += Math.abs(error)
  s.sq += error * error
  table.set(key, s)
}
const line = (name: string, s: Stat) =>
  `  ${name.padEnd(34)} bias ${(s.sum / s.n).toFixed(1).padStart(6)}  MAE ${(s.abs / s.n).toFixed(1).padStart(5)}  RMSE ${Math.sqrt(s.sq / s.n).toFixed(1).padStart(5)}  n=${s.n}`

const SUBSETS = ['daytime', 'daytime, measured overcast', 'daytime, measured sunny', 'night'] as const
type Subset = (typeof SUBSETS)[number]

const minOf = (xs: (number | null)[]) => (xs.some((x) => x === null) ? null : Math.min(...(xs as number[])))
const meanOf = (xs: (number | null)[]) =>
  xs.some((x) => x === null) ? null : (xs as number[]).reduce((a, b) => a + b, 0) / xs.length

/** Which shortwave feeds the series, per hour index. GFS is what production reads. */
const SUN_SOURCES: Record<string, (h: Hourly, i: number) => number | null> = {
  GFS: (h, i) => h.shortwave_radiation_gfs_seamless![i] ?? null,
  ECMWF: (h, i) => h.shortwave_radiation_ecmwf_ifs025![i] ?? null,
  ICON: (h, i) => h.shortwave_radiation_icon_seamless![i] ?? null,
  'mean of 3': (h, i) => meanOf(MODELS.map((m) => h[`shortwave_radiation_${m}`]![i] ?? null)),
  'min of 3': (h, i) => minOf(MODELS.map((m) => h[`shortwave_radiation_${m}`]![i] ?? null)),
}

async function evaluateGroup(stations: string[], start: string, end: string) {
  const temps = new Map<Subset, Map<string, Stat>>(SUBSETS.map((s) => [s, new Map()]))
  const sun = new Map<string, Stat>()
  const tooBright = new Map<string, number>()
  let daytimeHours = 0
  let fitXY = 0
  let fitXX = 0
  const years = [...new Set([Number(start.slice(0, 4)), Number(end.slice(0, 4))])]

  for (const station of stations) {
    const { lat, lon, byHour } = await uscrn(station, years)
    const h = await forecasts(lat, lon, start, end)
    const gfs = (v: string, i: number) => h[`${v}_gfs_seamless`]![i] ?? null

    const seriesFor = (source: (h: Hourly, i: number) => number | null): WeatherHour[] =>
      h.time.map((t, i) => ({
        valid_at: `${t}:00Z`,
        air_temp_c: gfs('temperature_2m', i),
        dewpoint_c: gfs('dew_point_2m', i),
        wind_kmh: gfs('wind_speed_10m', i),
        cloud_pct: gfs('cloud_cover', i),
        shortwave_wm2: source(h, i),
        precip_mm: gfs('precipitation', i),
      }))

    const lagged = Object.fromEntries(
      Object.entries(SUN_SOURCES).map(([name, source]) => [
        name,
        evaluateHourlyConditions(seriesFor(source), { rockType: 'granite', cliffAngleDeg: FLAT_GROUND }),
      ]),
    )
    const gfsSeries = seriesFor(SUN_SOURCES.GFS!)

    h.time.forEach((t, i) => {
      const obs = byHour.get(t)
      if (!obs || obs.surfaceC === null || obs.airC === null || obs.sunWm2 === null) return
      const sources = Object.fromEntries(Object.entries(SUN_SOURCES).map(([n, f]) => [n, f(h, i)]))
      if (Object.values(sources).some((v) => v === null)) return

      const g = gfsSeries[i]!
      const instant = (sunWm2: number | null, airC: number | null) =>
        surfaceTemperature({
          airTempC: airC,
          shortwaveWm2: sunWm2,
          windKmh: g.wind_kmh,
          cloudPct: g.cloud_pct,
          cliffAngleDeg: FLAT_GROUND,
        }).t_surface_c

      const methods: Record<string, number | null> = {
        'air temperature only': g.air_temp_c,
        'GFS, instantaneous (before lag)': instant(g.shortwave_wm2, g.air_temp_c),
        'measured sun + air, instantaneous': instant(obs.sunWm2, obs.airC),
      }
      for (const name of Object.keys(SUN_SOURCES)) {
        methods[`${name}, lagged${name === 'GFS' ? ' [production]' : ''}`] = lagged[name]![i]!.t_surface_c
      }

      const subsets: Subset[] = []
      if (obs.sunWm2 > DAYLIGHT_WM2) {
        subsets.push('daytime')
        if (obs.sunWm2 < MEASURED_OVERCAST_WM2) subsets.push('daytime, measured overcast')
        if (obs.sunWm2 >= MEASURED_SUNNY_WM2) subsets.push('daytime, measured sunny')
      } else {
        subsets.push('night')
      }
      for (const [name, value] of Object.entries(methods)) {
        if (value === null) continue
        for (const s of subsets) record(temps.get(s)!, name, value - obs.surfaceC)
      }

      if (obs.sunWm2 <= DAYLIGHT_WM2) return
      daytimeHours += 1
      for (const [name, value] of Object.entries(sources)) {
        record(sun, name, value! - obs.sunWm2)
        if (value! - obs.sunWm2 >= TOO_BRIGHT_WM2) tooBright.set(name, (tooBright.get(name) ?? 0) + 1)
      }
      const ho = surfaceCoefficient(obs.airC, g.wind_kmh)
      const sky = skyCoolingC(FLAT_GROUND, g.cloud_pct)
      if (ho !== null && sky !== null) {
        const x = obs.sunWm2 / ho
        fitXY += x * (obs.surfaceC - obs.airC + sky)
        fitXX += x * x
      }
    })
    console.error(`  read ${station}`)
  }
  return { temps, sun, tooBright, daytimeHours, absorptance: fitXY / fitXX }
}

async function main() {
  const endDate = new Date(Date.now() - 24 * 3_600_000)
  const startDate = new Date(endDate.getTime() - PAST_DAYS * 24 * 3_600_000)
  const start = startDate.toISOString().slice(0, 10)
  const end = endDate.toISOString().slice(0, 10)
  console.log(`compare:rock-temp — ${start} to ${end}. Errors in °C and W/m²; + reads high.`)

  for (const [group, stations] of Object.entries(GROUPS)) {
    console.log(`\n######## ${group} (${stations.length} stations)`)
    const r = await evaluateGroup(stations, start, end)
    for (const subset of SUBSETS) {
      console.log(`\n== Surface temperature, ${subset}`)
      const rows = [...r.temps.get(subset)!.entries()].sort((a, b) => a[1].abs / a[1].n - b[1].abs / b[1].n)
      for (const [name, s] of rows) console.log(line(name, s))
    }
    console.log('\n== Sunlight against the pyranometer, daytime')
    const rows = [...r.sun.entries()].sort((a, b) => a[1].abs / a[1].n - b[1].abs / b[1].n)
    for (const [name, s] of rows) {
      const pct = (100 * (r.tooBright.get(name) ?? 0)) / r.daytimeHours
      console.log(`${line(name, s)}  ≥${TOO_BRIGHT_WM2} too bright ${pct.toFixed(1)}%`)
    }
    console.log(`\n== Fitted absorptance ${r.absorptance.toFixed(2)} (model uses ${SOLAR_ABSORPTANCE})`)
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
