/**
 * Acceptance check: the forecast read from a stored ensemble run is the
 * forecast a live fetch returns, figure for figure.
 *
 * Usage, from `apps/api` (DATABASE_URL set in the shell, no `.env`):
 *   npm run check:forecast-stored
 *
 * Why it exists: `computeLiveForecast` used to fetch the ensemble on every
 * `/forecast` and `/conditions` request, about a second each. It now reads the
 * daily figures `collect-runs` stored from the same request (`getEnsembleDaily`).
 * The score and the daily figures are pure functions of those days, the offset
 * and the rain record, so **exact equality of the days after a trip through
 * Postgres `jsonb` is the whole claim** — a rounded double or a dropped field
 * would move a number on screen with nothing else noticing. Vitest never opens
 * a connection, so only this can see that trip.
 *
 * What it does: fetches one real ensemble run (Open-Meteo), stores it under a
 * point key no saved location can have, reads it back through
 * `getEnsembleDaily`, and runs `computeLiveForecast` on top. Every row under
 * that key is removed in `finally`.
 *
 * console rather than the logger: an operator CLI, and its output is the result.
 */

/** Taylors Falls, at an elevation no saved location has, so the point key is this script's alone. */
const POINT = { lat: 45.3955, lon: -92.6616, elevation_m: 7777 }

let passed = 0
let failed = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed++
    console.log(`  PASS  ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

async function run(): Promise<void> {
  if (!process.env['DATABASE_URL']) {
    console.error('\nMissing DATABASE_URL — the Neon pooled connection string, set in the shell.\n')
    process.exit(2)
  }

  const { isDeepStrictEqual } = await import('node:util')
  const { eq, count } = await import('drizzle-orm')
  const { db, pool } = await import('../db/index.js')
  const { weatherRuns } = await import('../db/schema.js')
  const { fetchEnsembleRun, localDateString } = await import('../lib/weather/openMeteo.js')
  const { storeEnsembleRun, deleteRunsForPoint } = await import('../lib/runs/storeRun.js')
  const { getEnsembleDaily } = await import('../lib/runs/latestRuns.js')
  const { pointKeyForPlace } = await import('../lib/runs/pointKey.js')
  const { computeLiveForecast } = await import('../lib/scoring/liveForecast.js')

  const pointKey = pointKeyForPlace(POINT)
  const runsAtPoint = async () =>
    (await db.select({ n: count() }).from(weatherRuns).where(eq(weatherRuns.point_key, pointKey)))[0]?.n ?? -1

  let cleanupFailed = false
  try {
    await deleteRunsForPoint(pointKey)

    let t = performance.now()
    const live = await fetchEnsembleRun(POINT)
    const liveMs = Math.round(performance.now() - t)
    await storeEnsembleRun(pointKey, live)
    check('a live ensemble run is fetched and stored', (await runsAtPoint()) === 1, `${liveMs} ms to fetch`)

    const now = new Date()
    t = performance.now()
    const stored = await getEnsembleDaily(POINT, now)
    const storedMs = Math.round(performance.now() - t)
    check('the forecast reads it from storage, not a second fetch', (await runsAtPoint()) === 1, `${storedMs} ms to read`)

    check(
      'every day and every figure is exactly what the live fetch returned',
      isDeepStrictEqual(stored.days, live.daily.days),
      `${stored.days.length} stored days vs ${live.daily.days.length} live`,
    )
    check('the same models are named', isDeepStrictEqual(stored.model_sources, live.daily.model_sources))
    check('the same offset, so the same "today"', stored.utc_offset_seconds === live.daily.utc_offset_seconds)

    const forecast = await computeLiveForecast(
      {
        id: '00000000-0000-0000-0000-00000000f0ca',
        lat: String(POINT.lat),
        lon: String(POINT.lon),
        elevation_m: String(POINT.elevation_m),
        rock_type: 'basalt_dense',
        cliff_angle: null,
        aspect: null,
        asos_station: null,
      },
      now,
    )
    check('the calculation on top did not fetch the ensemble either', (await runsAtPoint()) === 1)
    const today = localDateString(now, live.daily.utc_offset_seconds)
    check('its today is the location’s today', forecast.todayStr === today, `${forecast.todayStr} vs ${today}`)
    const byDate = new Map(live.daily.days.map((d) => [d.date, d]))
    const carried = forecast.snapshots.every((s) => {
      const d = byDate.get(s.forecast_date)
      return (
        d !== undefined &&
        s.temp_c_min === d.temp_c_min &&
        s.temp_c_max === d.temp_c_max &&
        s.precip_mm_p50 === d.precip_mm_p50 &&
        s.humidity_pct === d.humidity_pct &&
        s.wind_kmh_max === d.wind_kmh_max
      )
    })
    check('every daily figure on screen is the live fetch’s', carried && forecast.snapshots.length === live.daily.days.length)
    check(
      'and it still scores today',
      forecast.scores.some((s) => s.forecast_date === today) || forecast.scoreUnavailable === 'rainfall_unavailable',
      forecast.scoreUnavailable ?? '',
    )
  } finally {
    await deleteRunsForPoint(pointKey).catch(() => {
      cleanupFailed = true
    })
    if (!cleanupFailed && (await runsAtPoint().catch(() => -1)) !== 0) cleanupFailed = true
    await pool.end()
    if (cleanupFailed) console.error(`\n!! CLEANUP FAILED — delete weather_runs rows with point_key "${pointKey}" by hand`)
  }

  console.log(`\n${passed} passed, ${failed} failed.\n`)
  process.exit(failed === 0 ? 0 : 1)
}

run().catch((err: unknown) => {
  console.error(`\ncheck:forecast-stored stopped: ${err instanceof Error ? err.message : String(err)}`)
  process.exit(1)
})
