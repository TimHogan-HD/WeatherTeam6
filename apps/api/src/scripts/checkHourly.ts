/**
 * Acceptance check for `GET /api/v1/hourly/:locationId` — the parts the test suite
 * cannot reach.
 *
 * Usage, from `apps/api`:
 *   $env:DATABASE_URL = "<Neon pooled connection string>"
 *   npm run check:hourly
 *
 * Why a script rather than a test: vitest mocks `fetch` and never opens a connection, so
 * `buildHourlySeries` is unit-tested against hand-built fixtures and **nothing verifies
 * that a real stored run survives the round trip**. Two properties in particular are
 * invisible to it:
 *
 *  - **A null stored for an hour reads back as null, not 0.** These are `double precision`
 *    columns going through postgres-js; a doubles-to-string round trip that coerced them
 *    would put a temperature of 0 °C and a wind of 0 km/h on screen, which no reader can
 *    tell from a measurement. This is the single most common defect class in this repo.
 *  - **The instant join actually lines up.** `weather_run_hours.valid_at` and
 *    `weather_ensemble_hours.valid_at` are both `timestamptz`; if they came back at
 *    different precisions the join would silently produce two half-populated rows per hour
 *    instead of one full one, and the charts would look sparse rather than broken.
 *
 * It also measures what the plan said to measure rather than estimate: the payload at both
 * `models` settings, and each model's real horizon at this point.
 *
 * **Read-only.** Unlike the other `check:*` scripts this creates nothing, so there is
 * nothing to clean up — it reads whatever `collect-runs` has already stored. If no fresh
 * run exists it says so and exits non-zero rather than triggering a six-model upstream
 * fetch as a side effect of a check.
 *
 * console rather than the logger is deliberate — this is an operator CLI and its output
 * is the result.
 */

// Runtime imports are deferred into run(): `../db/index.js` throws at import time when
// DATABASE_URL is unset, which would pre-empt the explanation below with a stack trace.

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

function info(label: string, value: string): void {
  console.log(`  ....  ${label}: ${value}`)
}

async function run(): Promise<void> {
  if (!process.env['DATABASE_URL']) {
    console.error('DATABASE_URL is not set. Set it in your shell, not in a .env file:')
    console.error('  $env:DATABASE_URL = "<Neon pooled connection string>"')
    process.exitCode = 1
    return
  }

  const { db } = await import('../db/index.js')
  const { locations } = await import('../db/schema.js')
  const { loadStoredDeterministic, loadStoredEnsemble, RUN_MAX_AGE_MINUTES } = await import(
    '../lib/runs/latestRuns.js'
  )
  const { buildHourlySeries, hourHasModelData } = await import('../lib/runs/hourlySeries.js')
  const { pointKeyForLocation } = await import('../lib/runs/pointKey.js')

  console.log('\n=== check:hourly ===\n')

  // Any climbing location with a stored run will do — this reads what the cron collected.
  const rows = await db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .limit(25)

  if (rows.length === 0) {
    console.error('No locations in the database. Run `npm run db:seed` first.')
    process.exitCode = 1
    return
  }

  const now = new Date()
  const cutoff = new Date(now.getTime() - RUN_MAX_AGE_MINUTES * 60_000)

  // Find the first location that actually has a stored batch. A location added since the
  // last collect-runs has none, and that is not a failure of this endpoint.
  let picked: { id: string; name: string } | null = null
  let deterministic = null as Awaited<ReturnType<typeof loadStoredDeterministic>>
  let ensemble = null as Awaited<ReturnType<typeof loadStoredEnsemble>>

  for (const row of rows) {
    const key = pointKeyForLocation(row.id)
    const [d, e] = await Promise.all([
      loadStoredDeterministic(key, cutoff),
      loadStoredEnsemble(key, cutoff),
    ])
    if (d !== null || e !== null) {
      picked = row
      deterministic = d
      ensemble = e
      break
    }
  }

  if (picked === null) {
    console.error(
      `No stored run younger than ${RUN_MAX_AGE_MINUTES} minutes for any of ${rows.length} locations.`,
    )
    console.error('Trigger /api/cron/collect-runs and re-run. This check does not fetch upstream.')
    process.exitCode = 1
    return
  }

  console.log(`Location: ${picked.name} (${picked.id})\n`)
  check('a stored deterministic batch exists', deterministic !== null)
  check('a stored ensemble run exists', ensemble !== null)

  const det = deterministic ?? {
    models: [],
    unavailable_models: [],
    utc_offset_seconds: 0,
    fetched_at: null,
  }
  const ens = ensemble ?? { hours: [], utc_offset_seconds: 0, fetched_at: null }

  // ── nulls survive the round trip ──────────────────────────────────────────────
  let nullSeen = false
  let zeroSeen = false
  for (const m of det.models) {
    for (const h of m.hours) {
      if (h.temp_c === null || h.pressure_hpa === null || h.wind_gust_kmh === null) nullSeen = true
      if (h.temp_c === 0 || h.wind_kmh === 0) zeroSeen = true
      if (nullSeen && zeroSeen) break
    }
  }
  check(
    'a null stored for an hour reads back as null, not 0',
    nullSeen,
    'no null found in any stored hour — either every column is populated (unlikely across six models) or nulls are being coerced',
  )
  info('a real 0 also present (0 and null are distinguishable)', String(zeroSeen))

  // ── the series builds, and the join lines up ──────────────────────────────────
  const series = buildHourlySeries({
    locationId: picked.id,
    deterministic: det,
    ensemble: ens,
    allModels: false,
    now,
  })

  check('the series has hours', series.hours.length > 0, `got ${series.hours.length}`)
  check('days covers the seven-day window', series.days.length === 7, `got ${series.days.length}`)
  check(
    'every hour lands on a date in days[]',
    series.hours.every((h) => series.days.some((d) => d.local_date === h.local_date)),
  )
  check(
    'hours are ordered ascending',
    series.hours.every((h, i) => i === 0 || h.valid_at >= (series.hours[i - 1]?.valid_at ?? '')),
  )
  check('a deterministic model was chosen', series.model !== null, 'no model had coverage')

  const joined = series.hours.filter((h) => h.temp_c !== null && h.temp_c_p50 !== null).length
  check(
    'deterministic and ensemble hours join on the same instant',
    joined > 0,
    'no hour carried both a model temperature and an ensemble median — the two timestamps are not lining up',
  )
  info('hours carrying both sources', `${joined} of ${series.hours.length}`)

  // `members_wet` is nullable and null means unknown. A 0% that was computed and a null
  // that was not must not have collapsed into each other.
  const chance = series.hours.map((h) => h.precip_chance_pct)
  info('precip_chance_pct nulls (unknown)', String(chance.filter((c) => c === null).length))
  info('precip_chance_pct zeros (computed)', String(chance.filter((c) => c === 0).length))

  // ── measured, not estimated ───────────────────────────────────────────────────
  console.log('\n  Model horizons at this point (hours carrying a value, of hours returned):')
  for (const m of det.models) {
    const withData = m.hours.filter(hourHasModelData).length
    console.log(`    ${m.model.padEnd(20)} ${String(withData).padStart(4)} of ${m.hours.length}`)
  }
  if (det.unavailable_models.length > 0) {
    console.log(`    unavailable: ${det.unavailable_models.join(', ')}`)
  }

  const allSeries = buildHourlySeries({
    locationId: picked.id,
    deterministic: det,
    ensemble: ens,
    allModels: true,
    now,
  })
  const oneByte = Buffer.byteLength(JSON.stringify(series), 'utf8')
  const allByte = Buffer.byteLength(JSON.stringify(allSeries), 'utf8')
  console.log('\n  Payload:')
  console.log(`    default        ${(oneByte / 1024).toFixed(1)} KB`)
  console.log(`    ?models=all    ${(allByte / 1024).toFixed(1)} KB`)

  check(
    '?models=all includes every model that answered',
    (allSeries.models?.length ?? 0) === det.models.length,
    `got ${allSeries.models?.length ?? 0}, expected ${det.models.length}`,
  )
  check('the default response omits models[]', series.models === undefined)

  console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

run().catch((err: unknown) => {
  console.error('check:hourly threw:', err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
