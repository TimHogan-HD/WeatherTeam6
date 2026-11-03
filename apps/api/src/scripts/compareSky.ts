/**
 * **Is the Sun card right? Measured against USCRN's pyranometers.**
 *
 * `npm run compare:sky --workspace=apps/api`
 *
 * The Sun card (`packages/types/src/sky.ts`, `lib/runs/skySeries.ts`) reads
 * three things from `THERMAL_MODEL`: minutes of bright sun per hour
 * (`sunshine_duration`), how strong the sun is (`shortwave_radiation`, said as
 * strong ≥ 700 W/m², weak < 300), and whether the models agree on the day's
 * sun. This scores each against NOAA's Climate Reference Network, whose
 * pyranometer (`SOLARAD`) measures sunlight on flat ground every hour.
 *
 * - **Strength words.** The forecast's word against the word the measured
 *   sunlight earns, on daylight hours: a confusion table, and the share of
 *   measured hours in each band (do 700 and 300 split real days usefully?).
 * - **Sunshine.** USCRN has no sunshine recorder, so an hour counts as sunny
 *   on the ground when the measured sunlight is at least `SUNNY_CLEARNESS` of a
 *   cloudless sky's (Haurwitz) — a proxy, said as one. Per hour: forecast ≥ 30
 *   minutes against that. Per day: forecast sun hours against measured sunny
 *   hours, bias and MAE, per model.
 * - **"Forecasts differ".** GFS's day-total error on days the three models
 *   agree within `SUN_DIFFER_MIN`, against days they do not. The flag earns its
 *   place only if the second is clearly worse.
 *
 * **The forecasts are short-lead** (Open-Meteo's historical-forecast archive
 * stitches each model's first day), so this checks the readings, not how they
 * age; past day 3 an hour's sun is rougher than any figure here. Every sensor
 * looks at flat ground, as the card says it does.
 *
 * Network only, no database. One Open-Meteo call per station. Its output is
 * the result.
 */
import { solarPosition, SUN_DIFFER_MIN, SUN_STRONG_MIN_WM2, SUN_WEAK_BELOW_WM2, sunStrength, type SunStrength } from '@weatherteam6/types'
import { fetchWithRetry } from '../lib/weather/openMeteo.js'

const PAST_DAYS = 60
const MODELS = ['gfs_seamless', 'ecmwf_ifs025', 'icon_seamless'] as const
const STATIONS = [
  'MN_Sandstone_6_W', 'WI_Necedah_5_WNW', 'TN_Crossville_7_NW',
  'UT_Torrey_7_E', 'CO_Boulder_14_W', 'WY_Lander_11_SSE',
]
/** Measured sunlight at or above this share of a cloudless sky's is a sunny hour on the ground. */
const SUNNY_CLEARNESS = 0.6
/** Below this sun height the clearness ratio is noise; such hours are left out of the hour-level tables. */
const MIN_ELEVATION_DEG = 10

const reading = (field: string | undefined, flag?: string): number | null => {
  if (flag !== undefined && flag !== '0') return null
  const v = Number(field)
  return Number.isFinite(v) && v > -9990 ? v : null
}

/** Measured W/m², keyed by the UTC hour the observation ends, `YYYY-MM-DDTHH:00`. */
async function uscrn(station: string, years: number[]) {
  const byHour = new Map<string, number | null>()
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
      byHour.set(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T${hm.slice(0, 2)}:00`, reading(f[13], f[14]))
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
    hourly: 'shortwave_radiation,sunshine_duration',
    models: MODELS.join(','),
    timezone: 'GMT',
  })
  const res = await fetchWithRetry(`https://historical-forecast-api.open-meteo.com/v1/forecast?${params}`)
  if (!res.ok) throw new Error(`Open-Meteo ${lat},${lon}: HTTP ${res.status}`)
  return ((await res.json()) as { hourly: Hourly }).hourly
}

/** Haurwitz's cloudless sunlight, averaged over the hour ending at `endMs`. */
function clearSkyHourMean(endMs: number, lat: number, lon: number): number {
  let sum = 0
  for (const back of [52.5, 37.5, 22.5, 7.5]) {
    const sun = solarPosition(new Date(endMs - back * 60_000), lat, lon)
    const e = sun?.elevationDeg ?? -1
    if (e > 0) {
      const cz = Math.sin((e * Math.PI) / 180)
      sum += 1098 * cz * Math.exp(-0.057 / cz)
    }
  }
  return sum / 4
}

const WORDS: (SunStrength | 'none')[] = ['strong', 'moderate', 'weak', 'none']
const word = (w: number): SunStrength | 'none' => sunStrength(w) ?? 'none'

type Err = { n: number; sum: number; abs: number }
const add = (e: Err, x: number) => {
  e.n++
  e.sum += x
  e.abs += Math.abs(x)
}
const newErr = (): Err => ({ n: 0, sum: 0, abs: 0 })
const fmt = (e: Err) =>
  e.n === 0 ? 'n=0' : `bias ${(e.sum / e.n).toFixed(2).padStart(6)}  MAE ${(e.abs / e.n).toFixed(2).padStart(5)}  n=${e.n}`

async function main() {
  const endDate = new Date(Date.now() - 2 * 24 * 3_600_000)
  const startDate = new Date(endDate.getTime() - PAST_DAYS * 24 * 3_600_000)
  const start = startDate.toISOString().slice(0, 10)
  const end = endDate.toISOString().slice(0, 10)
  const years = [...new Set([startDate.getUTCFullYear(), endDate.getUTCFullYear()])]
  console.log(`compare:sky — ${start} to ${end}, ${STATIONS.length} USCRN stations, short-lead forecasts.`)

  // confusion[forecast][measured]
  const confusion = new Map<string, number>()
  const measuredBands = new Map<string, number>()
  let daylightHours = 0
  const hourAgree = { both: 0, fcOnly: 0, obsOnly: 0, neither: 0 }
  const dayErr = new Map<string, Err>(MODELS.map((m) => [m, newErr()]))
  /** GFS day error by the three models' spread, in whole hours (capped at 5). */
  const bySpread = new Map<number, Err>()
  const swErr = newErr()

  for (const station of STATIONS) {
    const { lat, lon, byHour } = await uscrn(station, years)
    const fc = await forecasts(lat, lon, start, end)
    // A "day" here is the UTC date of the hour's end shifted by the station's solar offset,
    // so a day's daylight never straddles two buckets.
    const solarOffsetMs = (lon / 15) * 3_600_000
    const days = new Map<string, { obs: number; fc: Record<string, number>; whole: boolean }>()

    for (let i = 0; i < fc.time.length; i++) {
      const stamp = fc.time[i]!
      const endMs = Date.parse(`${stamp}Z`)
      const clear = clearSkyHourMean(endMs, lat, lon)
      if (!(clear > 0)) continue
      const measured = byHour.get(stamp) ?? null
      const dayKey = new Date(endMs - 1_800_000 + solarOffsetMs).toISOString().slice(0, 10)
      const day = days.get(dayKey) ?? { obs: 0, fc: Object.fromEntries(MODELS.map((m) => [m, 0])), whole: true }
      days.set(dayKey, day)

      const sunS = MODELS.map((m) => fc[`sunshine_duration_${m}`]?.[i] ?? null)
      if (measured === null || sunS.some((s) => s === null)) {
        day.whole = false
        continue
      }
      const obsSunny = measured >= SUNNY_CLEARNESS * clear
      if (obsSunny) day.obs += 1
      MODELS.forEach((m, k) => (day.fc[m]! += sunS[k]! / 3600))

      const mid = solarPosition(new Date(endMs - 1_800_000), lat, lon)
      if (mid === null || mid.elevationDeg < MIN_ELEVATION_DEG) continue
      daylightHours++
      const gfsSw = fc.shortwave_radiation_gfs_seamless?.[i] ?? null
      const mw = word(measured)
      measuredBands.set(mw, (measuredBands.get(mw) ?? 0) + 1)
      if (gfsSw !== null) {
        const key = `${word(gfsSw)}>${mw}`
        confusion.set(key, (confusion.get(key) ?? 0) + 1)
        add(swErr, gfsSw - measured)
      }
      const fcSunny = sunS[0]! >= 1800
      if (fcSunny && obsSunny) hourAgree.both++
      else if (fcSunny) hourAgree.fcOnly++
      else if (obsSunny) hourAgree.obsOnly++
      else hourAgree.neither++
    }

    for (const d of days.values()) {
      if (!d.whole) continue
      for (const m of MODELS) add(dayErr.get(m)!, d.fc[m]! - d.obs)
      const totals = MODELS.map((m) => d.fc[m]! * 60)
      const spreadH = Math.min(5, Math.floor((Math.max(...totals) - Math.min(...totals)) / 60))
      const e = bySpread.get(spreadH) ?? newErr()
      add(e, d.fc.gfs_seamless! - d.obs)
      bySpread.set(spreadH, e)
    }
    console.log(`  ${station}: ${days.size} days`)
  }

  console.log(`\n== Strength words, GFS against the pyranometer (sun ≥ ${MIN_ELEVATION_DEG}°, ${daylightHours} hours)`)
  console.log(`   cut-offs: strong ≥ ${SUN_STRONG_MIN_WM2}, weak < ${SUN_WEAK_BELOW_WM2} W/m²`)
  console.log(`   ${'forecast \\ measured'.padEnd(20)}${WORDS.map((w) => w.padStart(10)).join('')}`)
  for (const f of WORDS) {
    console.log(`   ${f.padEnd(20)}${WORDS.map((m) => String(confusion.get(`${f}>${m}`) ?? 0).padStart(10)).join('')}`)
  }
  const hit = WORDS.reduce((a, w) => a + (confusion.get(`${w}>${w}`) ?? 0), 0)
  const all = [...confusion.values()].reduce((a, b) => a + b, 0)
  console.log(`   same word: ${((100 * hit) / all).toFixed(1)}%`)
  console.log(`   measured hours per band: ${WORDS.map((w) => `${w} ${((100 * (measuredBands.get(w) ?? 0)) / daylightHours).toFixed(0)}%`).join(', ')}`)
  console.log(`   GFS sunlight − measured, W/m²: ${fmt(swErr)}`)

  const n = hourAgree.both + hourAgree.fcOnly + hourAgree.obsOnly + hourAgree.neither
  console.log(`\n== Sunny hours: GFS ≥ 30 min against measured ≥ ${SUNNY_CLEARNESS} of a clear sky (${n} hours)`)
  console.log(`   both sunny ${hourAgree.both}, GFS only ${hourAgree.fcOnly}, ground only ${hourAgree.obsOnly}, neither ${hourAgree.neither}`)
  console.log(`   agree: ${((100 * (hourAgree.both + hourAgree.neither)) / n).toFixed(1)}%`)

  console.log('\n== Day sun hours, forecast − measured sunny hours')
  for (const m of MODELS) console.log(`   ${m.padEnd(16)} ${fmt(dayErr.get(m)!)}`)
  console.log(`\n== GFS day error by the models' spread (the line says "forecasts differ" from ${SUN_DIFFER_MIN / 60} h)`)
  for (const k of [...bySpread.keys()].sort((a, b) => a - b)) {
    console.log(`   spread ${k === 5 ? '5+' : k} h      ${fmt(bySpread.get(k)!)}`)
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
