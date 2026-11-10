/**
 * **How wide should the condensation ramp be? Measured before chosen.**
 *
 * `npm run compare:condensation --workspace=apps/api` (needs `DATABASE_URL`)
 *
 * Issue #535. `condensationA` runs from 1 at a 2 °C margin over the dew point
 * to its 0.5 floor at 1 °C, so 1.8 °F of a modelled margin moves the score
 * from 100 to 50. The rock temperature behind the margin is modelled (#436).
 * The issue asks two things before any number is proposed, and this answers
 * both for each candidate ramp (all with the same 0.5 floor):
 *
 * 1. **The band census.** Over the owner's crags, how many climbing-hours
 *    land in each margin band, how many hours each candidate would rescore by
 *    10 points or more, and how many day scores (`dayRepresentative`) move by
 *    10 or more. Read from the newest stored `gfs_seamless` run per crag, rain
 *    as stored (the median when `rain_models` is set), so these are the hours
 *    production scored. A stored run carries 7 days back and 7 ahead, and
 *    `T_mass` needs 96 h of it, so about 10 days per crag are scored.
 * 2. **The field checks.** Every forecast check at the owner's crags between
 *    `CHECKS_FROM` and `CHECKS_TO` (the 10/31–11/1 Sandstone and Red Wing
 *    visits), replayed with each candidate at the hour of the check.
 *    The stored runs start too late for `T_mass` on those days, so this half
 *    fetches `gfs_seamless` and the rain models from Open-Meteo with
 *    `past_days`, exactly as `compare:trailing-days` does. If Open-Meteo
 *    refuses (its daily limit), this half says so and the census still runs.
 *
 * Rescoring is exact, not re-simulated: the score is
 * `100 × wet_rock × condensation × heat × humidity × cold` (`scoreA`), so a
 * candidate swaps only the condensation factor in the published penalties.
 * The current ramp must reproduce every published score, and the script
 * fails if it does not.
 *
 * **Measured 2026-11-10, on the #534 margin** (lagged solar gain only), five
 * owner crags, about 10 days around 11/3–11/16: 11 of 550 climbing-hours
 * (2%) had a margin under 2 °C, none under 0. No candidate moved a day score
 * by 10 points; 0→4 moved 20 hours. The four 10/31–11/1 checks replay at
 * margins of 3.4–6.1 °C, so every ramp up to 0→3 scores them identically.
 * The ramp did not cost those days; the pre-#534 margin did. **Rerun in a
 * humid season**: one November fortnight on one model is the whole sample.
 *
 * Read-only against the database. Its output is the result.
 */
import { CLIMB_HOURS_DEFAULT, type RockType } from '@weatherteam6/types'
import { pointKeyForPlace } from '../lib/runs/pointKey.js'
import { THERMAL_MODEL } from '../lib/runs/hourlyReadings.js'
import { CONDENSATION_FLOOR, dayRepresentative, evaluateCragA, inClimbHours } from '../lib/scoring/cragModel.js'
import { CONDENSATION_CLEAR_MARGIN_C, type HourlyConditions, type WeatherHour } from '../lib/scoring/hourlyConditions.js'
import { fetchDeterministicHourly, localTimeToUtc } from '../lib/weather/openMeteo.js'
import { RAIN_MODELS, rainMedian } from '../lib/weather/rainMedian.js'

const OWNER_ID = process.env['OWNER_USER_ID'] ?? '00000000-0000-0000-0000-000000000001'
const CHECKS_FROM = '2026-10-31T00:00:00Z'
const CHECKS_TO = '2026-11-02T12:00:00Z'
/** Days of history fetched for the field-check replay: back past the checks, plus `T_mass`'s 96 h. */
const REPLAY_PAST_DAYS = 20
const MOVE_POINTS = 10

/** Linear from the floor at `fromC` to 1 at `toC`. The current ramp is 1 → 2 °C. */
type Ramp = { name: string; fromC: number; toC: number }
const RAMPS: readonly Ramp[] = [
  { name: 'now 1→2', fromC: CONDENSATION_CLEAR_MARGIN_C / 2, toC: CONDENSATION_CLEAR_MARGIN_C },
  { name: '0→2', fromC: 0, toC: 2 },
  { name: '0→3', fromC: 0, toC: 3 },
  { name: '0→4', fromC: 0, toC: 4 },
]

function rampFactor(marginC: number, r: Ramp): number {
  if (marginC >= r.toC) return 1
  if (marginC <= r.fromC) return CONDENSATION_FLOOR
  return CONDENSATION_FLOOR + ((1 - CONDENSATION_FLOOR) * (marginC - r.fromC)) / (r.toC - r.fromC)
}

/** The hour's score with `r` in place of the condensation factor. Null where the hour has none. */
function rescore(h: HourlyConditions, r: Ramp): number | null {
  const p = h.diagnostics.penalties
  const m = h.condensation_margin_c
  if (p === null || m === null || h.score === null) return null
  return Math.round(100 * p.wet_rock * rampFactor(m, r) * p.heat * p.humidity * p.cold)
}

type Crag = { name: string; lat: number; lon: number; elevation_m: number | null; rockType: RockType }

const BANDS: readonly [string, (m: number) => boolean][] = [
  ['< 0', (m) => m < 0],
  ['0–1', (m) => m >= 0 && m < 1],
  ['1–2', (m) => m >= 1 && m < 2],
  ['2–3', (m) => m >= 2 && m < 3],
  ['3–4', (m) => m >= 3 && m < 4],
  ['≥ 4', (m) => m >= 4],
]

function localDate(validAt: string, offset: number): string {
  return new Date(Date.parse(validAt) + offset * 1000).toISOString().slice(0, 10)
}

function census(name: string, hours: HourlyConditions[], offset: number): number[] {
  const climb = hours.filter(
    (h) => h.score !== null && h.condensation_margin_c !== null && inClimbHours(h.valid_at, offset, CLIMB_HOURS_DEFAULT),
  )
  // The current ramp must reproduce the published score, or the rescoring is wrong.
  for (const h of climb) {
    const again = rescore(h, RAMPS[0]!)
    if (again !== h.score) throw new Error(`${name} ${h.valid_at}: rescored ${again}, published ${h.score}`)
  }
  const bands = BANDS.map(([, inBand]) => climb.filter((h) => inBand(h.condensation_margin_c!)).length)
  const cells = RAMPS.slice(1).map((r) => {
    const moved = climb.filter((h) => Math.abs((rescore(h, r) ?? 0) - h.score!) >= MOVE_POINTS).length
    const byDate = new Map<string, HourlyConditions[]>()
    for (const h of hours) byDate.set(localDate(h.valid_at, offset), [...(byDate.get(localDate(h.valid_at, offset)) ?? []), h])
    let days = 0
    let daysMoved = 0
    for (const dayHours of byDate.values()) {
      const before = dayRepresentative(dayHours, offset)
      const after = dayRepresentative(
        dayHours.map((h) => ({ ...h, score: h.score === null ? null : rescore(h, r) })),
        offset,
      )
      if (before?.score == null || after?.score == null) continue
      days++
      if (Math.abs(after.score - before.score) >= MOVE_POINTS) daysMoved++
    }
    return `${r.name}: ${String(moved).padStart(3)} h, ${daysMoved}/${days} d`
  })
  console.log(
    `  ${name.slice(0, 26).padEnd(26)} ${String(climb.length).padStart(4)}  ${bands.map((n) => String(n).padStart(4)).join(' ')}   ${cells.join('   ')}`,
  )
  return bands
}

async function storedSeries(
  db: typeof import('../db/index.js')['db'],
  sql: typeof import('drizzle-orm')['sql'],
  crag: Crag,
): Promise<{ hours: WeatherHour[]; offset: number } | null> {
  const key = pointKeyForPlace(crag)
  const runs = await db.execute(sql`
    select id, utc_offset_seconds, rain_models is not null as median from weather_runs
    where point_key = ${key} and model = ${THERMAL_MODEL} order by fetched_at desc limit 1`)
  const run = runs.rows[0] as { id: string; utc_offset_seconds: number; median: boolean } | undefined
  if (run === undefined) return null
  const rows = await db.execute(sql`
    select valid_at, temp_c, dewpoint_c, wind_kmh, cloud_pct, shortwave_wm2, precip_mm, rain_median_mm
    from weather_run_hours where run_id = ${run.id} order by valid_at`)
  type Row = Record<'temp_c' | 'dewpoint_c' | 'wind_kmh' | 'cloud_pct' | 'shortwave_wm2' | 'precip_mm' | 'rain_median_mm', number | null> & {
    valid_at: string | Date
  }
  const hours = (rows.rows as Row[]).map((h) => ({
    valid_at: new Date(h.valid_at).toISOString(),
    air_temp_c: h.temp_c,
    dewpoint_c: h.dewpoint_c,
    wind_kmh: h.wind_kmh,
    cloud_pct: h.cloud_pct,
    shortwave_wm2: h.shortwave_wm2,
    precip_mm: run.median ? h.rain_median_mm : h.precip_mm,
  }))
  return { hours, offset: run.utc_offset_seconds }
}

async function fetchedSeries(crag: Crag): Promise<WeatherHour[]> {
  const res = await fetchDeterministicHourly(
    { lat: crag.lat, lon: crag.lon, elevation_m: crag.elevation_m },
    RAIN_MODELS,
    1,
    REPLAY_PAST_DAYS,
  )
  const rain = rainMedian(res)
  const thermal = res.models.find((m) => m.model === THERMAL_MODEL)
  if (thermal === undefined || rain === null) throw new Error('no thermal run or rain median')
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

const fmt = (x: number | null, d = 1): string => (x === null ? '—' : x.toFixed(d))

async function main(): Promise<void> {
  const { db, pool } = await import('../db/index.js')
  const { sql } = await import('drizzle-orm')
  try {
    const locs = await db.execute(sql`
      select id, name, lat, lon, elevation_m, rock_type from locations
      where user_id = ${OWNER_ID} and is_climbing_location order by name`)
    type Loc = { id: string; name: string; lat: string; lon: string; elevation_m: string | number | null; rock_type: RockType | null }
    const crags = new Map<string, Crag>()
    for (const l of locs.rows as Loc[]) {
      crags.set(l.id, {
        name: l.name,
        lat: Number(l.lat),
        lon: Number(l.lon),
        elevation_m: l.elevation_m === null ? null : Number(l.elevation_m),
        rockType: l.rock_type ?? 'unknown',
      })
    }

    console.log('\n=== compare:condensation — #535 ===\n')
    console.log(`  1. Climbing-hours (${CLIMB_HOURS_DEFAULT.first}–${CLIMB_HOURS_DEFAULT.last} local) by Crag A margin over the dew point, °C,`)
    console.log(`     newest stored ${THERMAL_MODEL} run per crag. Per candidate: hours and day scores moved ≥ ${MOVE_POINTS} points.\n`)
    console.log(`  ${'crag'.padEnd(26)} ${'hrs'.padStart(4)}  ${BANDS.map(([b]) => b.padStart(4)).join(' ')}`)
    const totals = BANDS.map(() => 0)
    for (const crag of crags.values()) {
      const s = await storedSeries(db, sql, crag)
      if (s === null) {
        console.log(`  ${crag.name}: no stored ${THERMAL_MODEL} run`)
        continue
      }
      const evaluated = evaluateCragA(s.hours, { rockType: crag.rockType, lat: crag.lat, lon: crag.lon })
      census(crag.name, evaluated, s.offset).forEach((n, i) => (totals[i]! += n))
    }
    const all = totals.reduce((a, b) => a + b, 0)
    console.log(`\n  All crags: ${all} h — ${BANDS.map(([b], i) => `${b} ${totals[i]} (${all ? ((100 * totals[i]!) / all).toFixed(0) : 0}%)`).join(', ')}`)

    console.log(`\n  2. Forecast checks ${CHECKS_FROM.slice(0, 10)} – ${CHECKS_TO.slice(0, 10)}, replayed at the check's hour.\n`)
    const checks = await db.execute(sql`
      select location_id, location_name, observed_at, observed_conditions from feedback
      where kind = 'forecast' and user_id = ${OWNER_ID}
        and observed_at between ${CHECKS_FROM} and ${CHECKS_TO} order by observed_at`)
    type Check = { location_id: string | null; location_name: string; observed_at: string | Date; observed_conditions: string | null }
    const series = new Map<string, HourlyConditions[] | string>()
    for (const c of checks.rows as Check[]) {
      const crag = c.location_id === null ? undefined : crags.get(c.location_id)
      const at = new Date(c.observed_at)
      const head = `  ${at.toISOString().slice(0, 16)}Z ${c.location_name.slice(0, 22).padEnd(22)} observed ${String(c.observed_conditions).padEnd(5)}`
      if (crag === undefined || c.location_id === null) {
        console.log(`${head}  not an owner crag`)
        continue
      }
      if (!series.has(c.location_id)) {
        try {
          const hours = await fetchedSeries(crag)
          series.set(c.location_id, evaluateCragA(hours, { rockType: crag.rockType, lat: crag.lat, lon: crag.lon }))
        } catch (err) {
          series.set(c.location_id, err instanceof Error ? err.message : String(err))
        }
      }
      const s = series.get(c.location_id)!
      if (typeof s === 'string') {
        console.log(`${head}  fetch failed — ${s}`)
        continue
      }
      // The hour the check falls in: `valid_at` is the hour's start.
      const hourStart = Math.floor(at.getTime() / 3_600_000) * 3_600_000
      const h = s.find((x) => Date.parse(x.valid_at) === hourStart)
      if (h === undefined || h.score === null) {
        console.log(`${head}  no score at that hour`)
        continue
      }
      const scores = RAMPS.map((r) => `${r.name} ${String(rescore(h, r) ?? '—').padStart(3)}`).join('  ')
      console.log(`${head}  margin ${fmt(h.condensation_margin_c).padStart(5)} °C  rock ${h.rock?.level ?? '—'}  ${scores}`)
    }
    if (checks.rows.length === 0) console.log('  none')
  } finally {
    await pool.end()
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
