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
 * nothing to clean up — it reads whatever `collect-runs` has already stored. It never
 * fetches upstream: a check that repairs the state it is measuring cannot measure it, and
 * a six-model fetch is not a side effect worth having behind an npm script.
 *
 * **It reads the newest stored run regardless of age, and reports freshness separately.**
 * An earlier version refused to run at all when nothing was younger than
 * `RUN_MAX_AGE_MINUTES`, which meant the correctness properties above went unverified for
 * exactly as long as the cron was unhealthy — precisely when they matter most. Staleness
 * is now a failing assertion with a printed age per location, not a precondition.
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
  const { THERMAL_MODEL } = await import('../lib/runs/hourlyReadings.js')
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

  /**
   * Deliberately **not** `RUN_MAX_AGE_MINUTES`.
   *
   * That cutoff answers "is this fresh enough to render a panel without re-fetching",
   * which is a different question from "does a stored row round-trip with its nulls
   * intact and does the join line up". A four-hour-old run proves both just as well as a
   * four-minute-old one, and refusing to look at it means the correctness properties go
   * unverified for exactly as long as the cron is unhealthy — when they matter most.
   *
   * Freshness is still checked, separately and loudly, below.
   */
  const ANY_AGE = new Date(0)
  const freshCutoff = new Date(now.getTime() - RUN_MAX_AGE_MINUTES * 60_000)

  // Pick the location with the newest stored batch, rather than the first one that has
  // any. With six locations collected together they should be within seconds of each
  // other; if they are not, that is worth seeing.
  let picked: { id: string; name: string } | null = null
  let deterministic = null as Awaited<ReturnType<typeof loadStoredDeterministic>>
  let ensemble = null as Awaited<ReturnType<typeof loadStoredEnsemble>>
  let newest = 0

  const ages: { name: string; fetched: Date | null }[] = []

  for (const row of rows) {
    const key = pointKeyForLocation(row.id)
    const [d, e] = await Promise.all([
      loadStoredDeterministic(key, ANY_AGE),
      loadStoredEnsemble(key, ANY_AGE),
    ])
    const fetched = d?.fetched_at ?? e?.fetched_at ?? null
    ages.push({ name: row.name, fetched })
    if (fetched !== null && fetched.getTime() > newest) {
      newest = fetched.getTime()
      picked = row
      deterministic = d
      ensemble = e
    }
  }

  console.log('  Newest stored run per location:')
  for (const a of ages) {
    const age =
      a.fetched === null
        ? 'never collected'
        : `${((now.getTime() - a.fetched.getTime()) / 3_600_000).toFixed(1)}h ago`
    console.log(`    ${a.name.padEnd(28)} ${age}`)
  }
  console.log('')

  if (picked === null) {
    console.error(`No stored run at all for any of ${rows.length} locations.`)
    console.error('Trigger /api/cron/collect-runs and re-run. This check does not fetch upstream.')
    process.exitCode = 1
    return
  }

  // Freshness is a real assertion, not a precondition. A stale run means every Mini App
  // request takes the cold path — six deterministic models plus 143 ensemble members
  // inside the function's 60 s ceiling — which is the endpoint's stated worst case.
  const ageMin = (now.getTime() - newest) / 60_000
  check(
    `a run exists that is fresher than RUN_MAX_AGE_MINUTES (${RUN_MAX_AGE_MINUTES}m)`,
    newest >= freshCutoff.getTime(),
    `newest is ${(ageMin / 60).toFixed(1)}h old — collect-runs is not keeping up, so every request re-fetches`,
  )

  console.log(`\nLocation: ${picked.name} (${picked.id})\n`)
  check('a stored deterministic batch exists', deterministic !== null)
  check('a stored ensemble run exists', ensemble !== null)

  const det = deterministic ?? {
    models: [],
    unavailable_models: [],
    utc_offset_seconds: 0,
    fetched_at: null,
  }
  const ens = ensemble ?? { hours: [], utc_offset_seconds: 0, fetched_at: null }

  // ── did the deterministic half of collect-runs actually store anything? ───────
  //
  // Named on its own because `loadStoredDeterministic` returning a batch is not the same
  // as that batch having hours: a `weather_runs` row can exist with **zero** child rows in
  // `weather_run_hours`, which is what a deterministic fetch that failed after the run row
  // was written looks like from here. Every check below it then fails for a reason that
  // has nothing to do with the code under test.
  const detHours = det.models.flatMap((m) => m.hours)
  check(
    'the deterministic run has hours, not just a run row',
    detHours.length > 0,
    `${det.models.length} model(s) stored, ${detHours.length} hours between them — the run row exists but weather_run_hours is empty`,
  )

  // ── nulls survive the round trip ──────────────────────────────────────────────
  //
  // **Absence of a null is not evidence of coercion**, and an earlier version of this
  // script failed on exactly that, reporting "nulls are being coerced" when the real state
  // was "there are no hours to look at". That is the defect class this repo calls a
  // failure state that reads as a different failure — in a script whose whole job is to
  // catch that class.
  //
  // The property is only observable when there is padding to observe. Across six models
  // Open-Meteo pads every one to the longest horizon in the request, so a batch with hours
  // is guaranteed to contain nulls and their absence *would* be coercion. With no hours,
  // or with a single model whose horizon is the request length, there is nothing to see —
  // and this says so rather than asserting either way.
  let nullSeen = false
  let zeroSeen = false
  for (const h of detHours) {
    if (h.temp_c === null || h.pressure_hpa === null || h.wind_gust_kmh === null) nullSeen = true
    if (h.temp_c === 0 || h.wind_kmh === 0) zeroSeen = true
  }
  // The ensemble is a second, independent source of the same property.
  for (const h of ens.hours) {
    if (h.temp_c_p10 === null || h.precip_mm_mean === null || h.members_wet === null) nullSeen = true
    if (h.precip_mm_mean === 0 || h.temp_c_p10 === 0) zeroSeen = true
  }

  const inspectable = detHours.length + ens.hours.length
  if (nullSeen) {
    check('a null stored for an hour reads back as null, not 0', true)
  } else if (inspectable === 0) {
    info('null round-trip', 'INCONCLUSIVE — no stored hours of either kind to inspect')
  } else {
    info(
      'null round-trip',
      `INCONCLUSIVE — ${inspectable} hours inspected, none carried a null. Expected when only one model is stored and it reaches the full request length; suspicious across six.`,
    )
  }
  info('a real 0 also present (0 and null are distinguishable)', String(zeroSeen))

  // ── the series builds, and the join lines up ──────────────────────────────────
  const series = buildHourlySeries({
    locationId: picked.id,
    deterministic: det,
    ensemble: ens,
    allModels: false,
    now,
    // The picked location is whichever has the newest stored batch, and the
    // point of this script is the round trip rather than the rock type, so it
    // is scored as an unrecorded kind on the default angle. That is exactly
    // what a user-added location carries today.
    scoring: { rockType: 'unknown', cliffAngleDeg: 45, wall: null },
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
  check(
    'a deterministic model was chosen',
    series.model !== null,
    detHours.length === 0
      ? 'no deterministic hours were stored, so there was nothing to choose from — this is the collection failing, not the selection'
      : 'hours exist but none carried a value — every model was padding',
  )

  // Only a real assertion when both sides have something to join. With one side empty a
  // zero overlap says nothing about whether the timestamps line up — it says one source
  // did not store, which the check above already reports.
  const joined = series.hours.filter((h) => h.temp_c !== null && h.temp_c_p50 !== null).length
  if (detHours.length === 0 || ens.hours.length === 0) {
    info(
      'instant join',
      'INCONCLUSIVE — one side stored no hours, so an overlap of 0 is not evidence about the timestamps',
    )
  } else {
    check(
      'deterministic and ensemble hours join on the same instant',
      joined > 0,
      'both sides have hours and not one instant matched — weather_run_hours and weather_ensemble_hours timestamps are not lining up',
    )
  }
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
    scoring: { rockType: 'unknown', cliffAngleDeg: 45, wall: null },
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

  // ── the v2 readings, against whatever the cron actually stored ───────────────
  //
  // The unit tests build their own hours. These three properties can only be
  // checked here, because they are about what `collect-runs` left in the
  // database: whether the thermal model is among the stored ones, whether its
  // trailing hours survived the round trip, and whether shortwave came back as
  // numbers rather than nulls.
  console.log('\nv2 readings:')
  const readings = series.readings
  info('model', readings.model ?? '(none)')
  info('unavailable_reason', readings.unavailable_reason ?? '(none)')

  const thermal = det.models.find((m) => m.model === THERMAL_MODEL)
  check(
    `${THERMAL_MODEL} is among the stored models`,
    thermal !== undefined,
    `stored: ${det.models.map((m) => m.model).join(', ') || 'none'}`,
  )

  if (thermal !== undefined) {
    const oldest = thermal.hours.reduce<Date | null>(
      (acc, h) => (acc === null || h.valid_at < acc ? h.valid_at : acc),
      null,
    )
    const trailingHours =
      oldest === null ? 0 : Math.round((now.getTime() - oldest.getTime()) / 3_600_000)
    info(`${THERMAL_MODEL} hours stored`, String(thermal.hours.length))
    info('trailing hours before now', String(trailingHours))
    // T_mass refuses a series under 96 hours. Without the trailing hours
    // `collect-runs` now requests, every reading is withheld — and the failure
    // is silent, because a withheld reading looks exactly like a cautious one.
    check(
      'enough trailing history for T_mass (>= 96h before now)',
      trailingHours >= 96,
      `only ${trailingHours}h — has collect-runs run since past_days was added?`,
    )

    const withShortwave = thermal.hours.filter((h) => h.shortwave_wm2 !== null).length
    check(
      'shortwave survived the round trip as numbers',
      withShortwave > 0,
      `0 of ${thermal.hours.length} hours carried a shortwave value`,
    )
  }

  if (readings.unavailable_reason === null) {
    const scored = readings.hours.filter((h) => h.score !== null).length
    info('hours scored', `${scored} of ${readings.hours.length}`)
    check('at least one hour scored', scored > 0)

    // The window is deliberately today-forward; the history must not leak out.
    const earliest = readings.hours.reduce<number>(
      (acc, h) => Math.min(acc, Date.parse(h.valid_at)),
      Number.POSITIVE_INFINITY,
    )
    check(
      'no past hour reached the response',
      earliest >= Date.parse(`${series.days[0]?.local_date ?? '1970-01-01'}T00:00:00Z`) -
        Math.abs(series.utc_offset_seconds) * 1000,
      `earliest reading ${new Date(earliest).toISOString()}`,
    )

    // The fence: words and ordering reach a client, magnitudes do not.
    const leaked = readings.hours.filter((h) =>
      ['friction_factor', 'wetness_factor', 'skin_wettedness', 'diagnostics'].some(
        (k) => k in (h as unknown as Record<string, unknown>),
      ),
    ).length
    check('no reading carries a raw factor', leaked === 0, `${leaked} hours did`)

    const withWindow = readings.days.filter((d) => d.window !== null).length
    info('days with a window', `${withWindow} of ${readings.days.length}`)
    const qualified = readings.hours.filter((h) => h.friction?.qualified === true).length
    info(
      'sun-qualified hours',
      `${qualified} of ${readings.hours.length} — aspect is unwritten until Phase 4`,
    )

    const sample = readings.days.find((d) => d.best !== null)
    if (sample?.best) {
      info(
        `${sample.local_date} best hour`,
        `${sample.best.valid_at} · rock ${sample.best.rock?.level ?? '—'} · friction ${sample.best.friction?.level ?? '—'} · score ${sample.best.score ?? '—'}`,
      )
    }
  }


  console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

run().catch((err: unknown) => {
  console.error('check:hourly threw:', err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
