/**
 * Acceptance check for `HourlyReadings.walls` (#445): each lidar wall of a crag
 * with confirmed sun and shade, scored by Wall A on the real stored run.
 *
 * Usage, from `apps/api`:
 *   $env:DATABASE_URL = "<Neon pooled connection string>"
 *   npm run check:walls
 *
 * Why a script: the unit tests run Wall A on a hand-built day. This runs it on
 * what `collect-runs` stored for a saved Red Wing location, the way `/hourly`
 * builds it, and measures what the plan said to measure — the time Wall A adds
 * per request and the bytes it adds to the response.
 *
 * **Read-only**, like `check:hourly`: it reads the newest stored run of any age
 * and never fetches upstream.
 */

// Runtime imports are deferred into run(): `../db/index.js` throws at import time when
// DATABASE_URL is unset.

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
  const { eq } = await import('drizzle-orm')
  const { loadStoredDeterministic, loadStoredEnsemble } = await import('../lib/runs/latestRuns.js')
  const { buildHourlySeries } = await import('../lib/runs/hourlySeries.js')
  const { scoringLocationFor } = await import('../lib/runs/scoringLocation.js')
  const { pointKeyForPlace } = await import('../lib/runs/pointKey.js')
  const { readingNow, sunShadeAt, sunShadeOnDay, sunWallsFor } = await import('@weatherteam6/types')

  console.log('\n=== check:walls ===\n')

  const rows = await db
    .select({
      id: locations.id,
      name: locations.name,
      lat: locations.lat,
      lon: locations.lon,
      elevation_m: locations.elevation_m,
      is_climbing_location: locations.is_climbing_location,
      rock_type: locations.rock_type,
      cliff_angle: locations.cliff_angle,
      aspect: locations.aspect,
      known_crag: locations.known_crag,
    })
    .from(locations)
    .where(eq(locations.known_crag, 'red-wing'))
    .limit(1)
  const loc = rows[0]
  if (loc === undefined) {
    console.error('No saved location carries known_crag red-wing.')
    process.exitCode = 1
    return
  }
  info('location', `${loc.name} (${loc.id})`)

  const key = pointKeyForPlace({
    lat: parseFloat(loc.lat),
    lon: parseFloat(loc.lon),
    elevation_m: loc.elevation_m === null ? null : parseFloat(loc.elevation_m),
  })
  const [det, ens] = await Promise.all([loadStoredDeterministic(key, new Date(0)), loadStoredEnsemble(key, new Date(0))])
  if (det === null) {
    console.error('No stored deterministic run for this place.')
    process.exitCode = 1
    return
  }
  const ensemble = ens ?? { hours: [], utc_offset_seconds: 0, fetched_at: null, checked_at: null }
  const now = new Date()
  const build = (knownCrag: string | null) => {
    const scoring = scoringLocationFor({ ...loc, known_crag: knownCrag })
    const t0 = performance.now()
    const series = buildHourlySeries({
      locationId: loc.id,
      point: { lat: Number(loc.lat), lon: Number(loc.lon) },
      deterministic: det,
      ensemble,
      allModels: false,
      now,
      scoring,
    })
    return { series, ms: performance.now() - t0 }
  }

  // Warm up once so the first timing is not module compilation.
  build(null)
  const without = build(null)
  const withWalls = build(loc.known_crag)
  const walls = withWalls.series.readings.walls ?? []
  const expected = sunWallsFor('red-wing')!.walls.length

  check('the crag score is untouched by the walls', JSON.stringify(withWalls.series.readings.hours) === JSON.stringify(without.series.readings.hours))
  check('no walls without a known crag', (without.series.readings.walls ?? []).length === 0)
  check(`every lidar wall is scored (${expected})`, walls.length === expected, `got ${walls.length}`)
  const hourCount = withWalls.series.readings.hours.length
  check(
    'each wall has every hour the crag has, at the same instants',
    walls.every((w) => w.hours.length === hourCount && w.hours.every((h, i) => h.valid_at === withWalls.series.readings.hours[i]!.valid_at)),
  )
  check('each wall has every day', walls.every((w) => w.days.length === withWalls.series.readings.days.length))
  const scored = walls.flatMap((w) => w.hours).filter((h) => h.score !== null).length
  check('the walls carry scores, not only gaps', scored > 0, `${scored} scored hours`)
  check('no tree-shaded wall is ever in sun', walls.filter((w) => w.tree_shaded).every((w) => w.hours.every((h) => !h.in_sun)))

  info('time without walls', `${without.ms.toFixed(0)} ms`)
  info('time with walls', `${withWalls.ms.toFixed(0)} ms (+${(withWalls.ms - without.ms).toFixed(0)} ms)`)
  const bytes = (x: unknown) => Buffer.byteLength(JSON.stringify(x), 'utf8')
  info('response bytes', `${bytes(without.series)} → ${bytes(withWalls.series)} (+${bytes(walls)})`)

  const nowHour = readingNow(withWalls.series.readings.hours, now.getTime())
  if (nowHour !== null) {
    const p = sunShadeAt(walls, nowHour.valid_at)
    info(
      `now (${nowHour.valid_at}), crag ${nowHour.score ?? '—'}`,
      p === null
        ? 'no pair'
        : `sun ${p.sun.best ? `${p.sun.best.name} ${p.sun.best.score}` : `— (${p.sun.walls} walls)`} · shade ${p.shade.best ? `${p.shade.best.name} ${p.shade.best.score}` : `— (${p.shade.walls} walls)`} · alike ${p.alike}`,
    )
  }
  for (const d of withWalls.series.readings.days) {
    const p = sunShadeOnDay(walls, d.local_date)
    info(
      `${d.local_date} crag ${d.best?.score ?? '—'}`,
      p === null ? 'no pair' : `sun ${p.sun.best?.score ?? '—'} · shade ${p.shade.best?.score ?? '—'} · alike ${p.alike}`,
    )
  }

  console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'}  ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exitCode = 1
}

run().catch((err: unknown) => {
  console.error('check:walls threw:', err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
