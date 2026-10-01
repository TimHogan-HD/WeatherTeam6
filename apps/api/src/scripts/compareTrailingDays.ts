/**
 * **How many days of history does the drying clock need? Replayed, not assumed.**
 *
 * `npm run compare:trailing-days --workspace=apps/api`
 *
 * Issue #176. Crag A's clock treats the first hour of its series as fully
 * soaked, because it cannot see the rain before it (`drynessTrack`). The series
 * starts `TRAILING_DAYS` before now (`lib/runs/deterministicFetch.ts`), so a
 * slow rock type in a dry spell can read `Wet` only because the clock began
 * too recently.
 *
 * For each slow-rock known crag it fetches `PAST_DAYS` of the thermal model and
 * the rain median, exactly as `collect-runs` does, and replays a "now" every
 * `STEP_HOURS`. At each one it compares the rock level from a series starting
 * N days back against the level from the whole series (at least
 * `REFERENCE_DAYS` behind it). A disagreement is a reading the history length
 * alone got wrong. Each crag is read at its own rock type and at `unknown`,
 * the slowest row.
 *
 * Measured 2026-10-01 (Jul-Sep, 9 places, the four slowest rows): 5 days
 * disagreed 3.3% of the time on 120 h sandstone, every one reading wetter;
 * 7, 10 and 14 days disagreed never. **Rerun in winter** — cold rock dries
 * slower, and that sample had none.
 *
 * Network only — no database. Its output is the result.
 */
import { KNOWN_CRAGS, type RockType } from '@weatherteam6/types'
import { TRAILING_DAYS } from '../lib/runs/deterministicFetch.js'
import { THERMAL_MODEL } from '../lib/runs/hourlyReadings.js'
import { evaluateCragA } from '../lib/scoring/cragModel.js'
import { MAX_HOURS } from '../lib/scoring/dryingModel.js'
import type { RockLevel, WeatherHour } from '../lib/scoring/hourlyConditions.js'
import { fetchDeterministicHourly, localTimeToUtc } from '../lib/weather/openMeteo.js'
import { RAIN_MODELS, rainMedian } from '../lib/weather/rainMedian.js'

/** Open-Meteo's `past_days` ceiling. */
const PAST_DAYS = 92
const REFERENCE_DAYS = 30
const STEP_HOURS = 6
/** Only rock types whose window is at least this long; faster ones clear any of the candidates. */
const SLOW_HOURS = 72
const CANDIDATE_DAYS = [5, 7, 10, 14]

const ORDER: Record<RockLevel, number> = { wet: 0, drying: 1, dry: 2 }

type Tally = { n: number; diff: number; wetter: number }

async function seriesFor(lat: number, lon: number): Promise<WeatherHour[] | null> {
  const res = await fetchDeterministicHourly({ lat, lon, elevation_m: null }, RAIN_MODELS, 2, PAST_DAYS)
  const rain = rainMedian(res)
  const thermal = res.models.find((m) => m.model === THERMAL_MODEL)
  if (thermal === undefined || rain === null) return null
  const out: WeatherHour[] = []
  for (const h of thermal.hours) {
    const at = localTimeToUtc(h.valid_at_local, res.utc_offset_seconds)
    if (at === null) continue
    out.push({
      valid_at: at.toISOString(),
      air_temp_c: h.temp_c,
      dewpoint_c: h.dewpoint_c,
      wind_kmh: h.wind_kmh,
      cloud_pct: h.cloud_pct,
      shortwave_wm2: h.shortwave_wm2,
      precip_mm: rain.byLocal.get(h.valid_at_local) ?? null,
    })
  }
  return out
}

function replay(hours: WeatherHour[], rockType: RockType, lat: number, lon: number, days: number): Tally {
  const opts = { rockType, lat, lon }
  const reference = evaluateCragA(hours, opts)
  const tally: Tally = { n: 0, diff: 0, wetter: 0 }
  for (let t = REFERENCE_DAYS * 24; t < hours.length - 48; t += STEP_HOURS) {
    const short = evaluateCragA(hours.slice(t - days * 24, t + 1), opts)
    const a = short[short.length - 1]?.rock?.level
    const b = reference[t]?.rock?.level
    if (a === undefined || b === undefined) continue
    tally.n++
    if (a !== b) {
      tally.diff++
      if (ORDER[a] < ORDER[b]) tally.wetter++
    }
  }
  return tally
}

const pct = (t: Tally): string => (t.n === 0 ? '—' : `${((100 * t.diff) / t.n).toFixed(1)}%`)

async function main(): Promise<void> {
  const crags = KNOWN_CRAGS.filter((c) => MAX_HOURS[c.rock_type] >= SLOW_HOURS)
  const totals = new Map<number, Tally>(CANDIDATE_DAYS.map((d) => [d, { n: 0, diff: 0, wetter: 0 }]))

  console.log(`\n=== compare:trailing-days === (production stores ${TRAILING_DAYS} days)\n`)
  console.log(`  Share of replayed "now"s whose rock level differs from a ${REFERENCE_DAYS}+ day series.\n`)
  for (const crag of crags) {
    const lat = (crag.bbox.south + crag.bbox.north) / 2
    const lon = (crag.bbox.west + crag.bbox.east) / 2
    let hours: WeatherHour[] | null
    try {
      hours = await seriesFor(lat, lon)
    } catch (err) {
      console.log(`  ${crag.name}: fetch failed — ${err instanceof Error ? err.message : String(err)}`)
      continue
    }
    if (hours === null) {
      console.log(`  ${crag.name}: no thermal run or rain median`)
      continue
    }
    for (const rockType of [crag.rock_type, 'unknown'] as const) {
      const cells = CANDIDATE_DAYS.map((days) => {
        const t = replay(hours, rockType, lat, lon, days)
        const total = totals.get(days)!
        total.n += t.n
        total.diff += t.diff
        total.wetter += t.wetter
        return `${days}d ${pct(t).padStart(6)}`
      })
      console.log(`  ${crag.name.slice(0, 30).padEnd(30)} ${rockType.padEnd(18)} ${cells.join('  ')}`)
    }
  }

  console.log('\n  All crags:')
  for (const [days, t] of totals) {
    console.log(`    ${String(days).padStart(2)} days  ${t.diff}/${t.n} = ${pct(t)}  (${t.wetter} read wetter)`)
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
