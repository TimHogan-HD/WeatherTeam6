/**
 * **The v2 model run against a real location's real weather.**
 *
 * `npm run compare:hourly-v2 --workspace=apps/api`
 *
 * `compare:scoring` is offline and its history is synthetic — a repeating
 * diurnal day, which is the only thing a single-hour scenario can be given.
 * This is the other half: one saved climbing location, one live Open-Meteo
 * request, and every hour of it through `evaluateHourlyConditions`.
 *
 * It exists because of this repo's verification standard. Typecheck and lint
 * prove the model compiles; a synthetic harness proves it is self-consistent.
 * Neither says the drying clock survives a real week, that `T_mass` gets enough
 * history to answer, or that shortwave running out mid-series withholds a
 * reading instead of inventing one. **Those only show up against the real
 * feed.**
 *
 * ## What it asks for, and why it is one model
 *
 * `gfs_seamless` alone, per issue #155 and Phase 1's decision: `gem_seamless`
 * reports shortwave ~3× too high past day 4, so irradiance is never pooled. GFS
 * has the longest measured shortwave horizon of the four and agrees with ECMWF
 * and ICON.
 *
 * `past_days` is what makes `T_mass` answerable at all. The model needs ~4 days
 * of trailing air temperature, `weather_run_hours` retains 2, and re-fetching
 * the archive is a second API — so the trailing hours come back in the same
 * request. **The past hours Open-Meteo returns for a forecast model are the
 * model's own analysis, not station observations**; they are the best trailing
 * temperature available here and they are not measurements.
 *
 * **Read-only, and it changes nothing.** No database write, no run stored, no
 * score moved. It is a report and its output is the result.
 */

// Runtime imports are deferred into run(): `../db/index.js` throws at import
// time when DATABASE_URL is unset, which pre-empts the friendlier message below
// with a stack trace.

/** Trailing days requested. 5 clears `massTemperatureC`'s 96-hour minimum with room over. */
const PAST_DAYS = 5

/** The one model that feeds irradiance. Not pooled — issue #155. */
const MODEL = 'gfs_seamless'

const cToF = (c: number): string => (((c * 9) / 5 + 32).toFixed(0) + '°F').padStart(6)
const num = (v: number | null, dp = 1): string => (v === null ? '—' : v.toFixed(dp))
const pad = (v: string, n: number): string => (v.length >= n ? v.slice(0, n) : v + ' '.repeat(n - v.length))
const padL = (v: string, n: number): string => (v.length >= n ? v : ' '.repeat(n - v.length) + v)

async function run(): Promise<void> {
  if (!process.env['DATABASE_URL']) {
    console.error('DATABASE_URL is not set. Set it in your shell, not in a .env file:')
    console.error('  $env:DATABASE_URL = "<Neon pooled connection string>"')
    process.exitCode = 1
    return
  }

  const { db } = await import('../db/index.js')
  const { locations } = await import('../db/schema.js')
  const { eq } = await import('drizzle-orm')
  const { fetchDeterministicHourly, localTimeToUtc } = await import('../lib/weather/openMeteo.js')
  const { evaluateHourlyConditions, bestWindow, DEFAULT_WEIGHTS } = await import(
    '../lib/scoring/hourlyConditions.js'
  )

  console.log('\n=== compare:hourly-v2 — the v2 model on real weather ===\n')

  const rows = await db
    .select({
      id: locations.id,
      name: locations.name,
      lat: locations.lat,
      lon: locations.lon,
      elevation_m: locations.elevation_m,
      rock_type: locations.rock_type,
      cliff_angle: locations.cliff_angle,
    })
    .from(locations)
    .where(eq(locations.is_climbing_location, true))
    .limit(3)

  if (rows.length === 0) {
    console.error('No climbing locations in the database. Run `npm run db:seed` first.')
    process.exitCode = 1
    return
  }

  for (const row of rows) {
    const lat = Number(row.lat)
    const lon = Number(row.lon)
    const rockType = row.rock_type ?? 'unknown'
    /**
     * **`cliff_angle` is null on every user-added location and 45 is what the
     * rest of the app already substitutes** — see the known gotcha in
     * `climbing-terminology-research.md`. Printed rather than hidden, because a
     * default that looks like a measurement is the defect class this repo ships
     * most often.
     */
    const cliffAngle = row.cliff_angle === null ? 45 : Number(row.cliff_angle)

    console.log('-'.repeat(100))
    console.log(`  ${row.name}`)
    console.log(
      `  ${lat.toFixed(4)}, ${lon.toFixed(4)} · rock ${rockType}${row.rock_type === null ? ' (UNSET — defaulted)' : ''}` +
        ` · cliff angle ${cliffAngle}${row.cliff_angle === null ? ' (UNSET — defaulted)' : ''}`,
    )
    console.log('-'.repeat(100))

    const result = await fetchDeterministicHourly(
      { lat, lon, elevation_m: row.elevation_m === null ? null : Number(row.elevation_m) },
      [MODEL],
      7,
      PAST_DAYS,
    )

    const model = result.models[0]
    if (!model || model.hours.length === 0) {
      console.log(`  ${MODEL} returned nothing at this point. unavailable: ${result.unavailable_models.join(', ') || '—'}`)
      console.log('')
      continue
    }

    const hours = model.hours.map((h) => {
      const utc = localTimeToUtc(h.valid_at_local, result.utc_offset_seconds)
      return {
        valid_at: utc === null ? h.valid_at_local : utc.toISOString(),
        local: h.valid_at_local,
        air_temp_c: h.temp_c,
        dewpoint_c: h.dewpoint_c,
        wind_kmh: h.wind_kmh,
        cloud_pct: h.cloud_pct,
        shortwave_wm2: h.shortwave_wm2,
        precip_mm: h.precip_mm,
      }
    })

    const evaluated = evaluateHourlyConditions(hours, {
      rockType,
      cliffAngleDeg: cliffAngle,
      weights: DEFAULT_WEIGHTS,
    })

    // ── Coverage, which is the thing only a live run can show ──────────────
    const withShortwave = hours.filter((h) => h.shortwave_wm2 !== null).length
    const withTemp = hours.filter((h) => h.air_temp_c !== null).length
    const withDew = hours.filter((h) => h.dewpoint_c !== null).length
    const scored = evaluated.filter((h) => h.score !== null).length
    const withMass = evaluated.filter((h) => h.diagnostics.t_mass_c !== null).length
    const qualified = evaluated.filter((h) => h.friction?.qualified === true).length
    const withFriction = evaluated.filter((h) => h.friction !== null).length

    console.log('')
    console.log(`  hours returned      ${hours.length}   (${PAST_DAYS} past days + 7 forecast)`)
    console.log(`  air temperature     ${withTemp}`)
    console.log(`  dew point           ${withDew}`)
    console.log(`  shortwave           ${withShortwave}${withShortwave < withTemp ? `   <-- runs out ${withTemp - withShortwave}h before temperature` : ''}`)
    console.log(`  T_mass answerable   ${withMass}`)
    console.log(`  friction readable   ${withFriction}`)
    console.log(`  scored              ${scored}`)
    console.log(
      `  sun-qualified       ${qualified} of ${withFriction} readable` +
        `   (aspect is unwritten on every location until Phase 4)`,
    )
    console.log('')

    // ── Per local day: the window, and the day's range ─────────────────────
    //
    // Windows are printed in the location's own wall clock, not UTC. "Good from
    // 7am to 11am" is the answer a climber wants and 12:00Z is not it — and at
    // this location UTC is five hours ahead, so a UTC window straddling
    // midnight reads backwards ("05:00Z-04:00Z") for a run that never left the
    // same local day.
    const localOf = new Map(hours.map((h) => [h.valid_at, h.local.slice(11, 16)]))

    const byDay = new Map<string, number[]>()
    hours.forEach((h, i) => {
      const day = h.local.slice(0, 10)
      const list = byDay.get(day) ?? []
      list.push(i)
      byDay.set(day, list)
    })

    console.log(
      `  ${pad('Local day', 12)}${padL('hi', 7)}${padL('lo', 7)}${padL('rain', 7)}${padL('best', 6)}${padL('worst', 6)}  ${pad('rock', 8)}${pad('friction', 10)}${pad('window (min score 60)', 26)}`,
    )
    console.log('  ' + '-'.repeat(96))

    for (const [day, indices] of byDay) {
      const dayHours = indices.map((i) => evaluated[i]!)
      const temps = indices.map((i) => hours[i]!.air_temp_c).filter((t): t is number => t !== null)
      const rain = indices
        .map((i) => hours[i]!.precip_mm)
        .filter((p): p is number => p !== null)
        .reduce((a, b) => a + b, 0)
      const scores = dayHours.map((h) => h.score).filter((s): s is number => s !== null)
      const window = bestWindow(dayHours, { score: 60 })

      // The day's readings are the ones at its best hour, so the row says what
      // the window says rather than averaging two readings that never co-occur.
      const bestHour = dayHours
        .filter((h) => h.score !== null)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]

      console.log(
        `  ${pad(day, 12)}${padL(temps.length ? cToF(Math.max(...temps)) : '—', 7)}` +
          `${padL(temps.length ? cToF(Math.min(...temps)) : '—', 7)}` +
          `${padL(rain.toFixed(1) + 'mm', 7)}` +
          `${padL(scores.length ? String(Math.max(...scores)) : '—', 6)}` +
          `${padL(scores.length ? String(Math.min(...scores)) : '—', 6)}  ` +
          `${pad(bestHour?.rock?.level ?? '—', 8)}` +
          `${pad(bestHour?.friction?.level ?? '—', 10)}` +
          `${pad(
            window === null
              ? 'none'
              : `${localOf.get(window.from) ?? '??'}-${localOf.get(window.to) ?? '??'} (${window.hours}h)${window.qualified ? '' : ' *'}`,
            26,
          )}`,
      )
    }
    console.log('')
    console.log('     * = the window contains an hour whose reading depends on an aspect nobody has recorded.')
    console.log('')

    // ── One day, hour by hour, so the shape is visible rather than summarised ──
    const todayIndices = [...byDay.values()][PAST_DAYS] ?? []
    if (todayIndices.length > 0) {
      const day = hours[todayIndices[0]!]!.local.slice(0, 10)
      console.log(`  ${day}, hour by hour:`)
      console.log('')
      console.log(
        `    ${pad('local', 7)}${padL('air', 6)}${padL('T_surf', 8)}${padL('dew', 6)}${padL('SW', 6)}` +
          `${padL('margin', 8)}${padL('w', 6)}${padL('dryhrs', 8)}${padL('score', 7)}  ${pad('rock', 8)}${pad('friction', 10)}`,
      )
      for (const i of todayIndices) {
        const h = hours[i]!
        const e = evaluated[i]!
        console.log(
          `    ${pad(h.local.slice(11), 7)}${padL(num(h.air_temp_c), 6)}${padL(num(e.t_surface_c), 8)}` +
            `${padL(num(h.dewpoint_c), 6)}${padL(h.shortwave_wm2 === null ? '—' : h.shortwave_wm2.toFixed(0), 6)}` +
            `${padL(num(e.condensation_margin_c), 8)}${padL(num(e.diagnostics.skin_wettedness, 2), 6)}` +
            `${padL(num(e.diagnostics.effective_dry_hours, 0), 8)}${padL(e.score === null ? '—' : String(e.score), 7)}  ` +
            `${pad(e.rock === null ? '—' : e.rock.level + (e.rock.qualified ? '' : '*'), 8)}` +
            `${pad(
              e.friction === null
                ? '—'
                : e.friction.level + (e.friction.condensing ? ' cond' : '') + (e.friction.qualified ? '' : '*'),
              10,
            )}`,
        )
      }
      console.log('')
    }
  }

  console.log('-'.repeat(100))
  console.log('')
  console.log('  NOTHING ABOVE IS APPLIED. Production still returns conditionsScore, and this')
  console.log('  script wrote nothing. `compare:scoring` is where the two models sit side by')
  console.log('  side; this is where the model meets weather it did not invent.')
  console.log('')
}

run().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
