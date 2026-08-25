/**
 * Acceptance check for the add-location API (Task 5a, `miniapp-design-v1.md` §12.3).
 *
 * Usage, from `apps/api`:
 *   $env:DATABASE_URL = "<Neon pooled connection string>"
 *   npm run check:add-location
 *
 * Why this exists as a script rather than a test: `POST /locations` and
 * `DELETE /locations/:id` cannot be covered by the vitest suite, which mocks
 * `fetch` and never opens a database connection. The cases that actually break
 * — a foreign-key violation on delete, an `elevation_m` that silently fails to
 * persist — only appear against a real Postgres. Run it after any change to the
 * add flow.
 *
 * It boots the API in-process on a spare port and walks the whole flow: save a
 * location, read it back, prove preview and the saved location agree on
 * temperature, attach an alert row, delete it, confirm it is gone.
 *
 * Creates exactly one row, named with the prefix below, and always tries to
 * remove it — including when a step fails partway through.
 *
 * `DEFAULT_USER_ID` is optional: without it the seeded user is read from the
 * `users` table. Vercel marks its copy of these variables sensitive and will not
 * reveal them, so Neon's dashboard is the source for `DATABASE_URL`.
 *
 * console rather than the logger is deliberate — this is an operator-facing CLI,
 * same as `importCrags.ts`, and its output is the result.
 */

import type { ForecastSnapshot, Location, ApiResponse } from '@weatherteam6/types'

// Runtime imports are deferred into run(): `../db/index.js` throws at import
// time when DATABASE_URL is unset, which would pre-empt the explanation below
// with a stack trace. Types are erased at compile time, so they stay static.

const PORT = 3099
const BASE = `http://127.0.0.1:${PORT}/api/v1`

/** Local-only credential for the /api/v1 gate. Never leaves this process. */
const SECRET = 'local-acceptance-check'

const NAME_PREFIX = 'ZZ Task5a check'

// Red Rock Canyon NCA, Nevada — the geocoder's own coordinates and elevation.
const LAT = 36.15192
const LON = -115.45413
const ELEVATION_M = 1200
const TIMEZONE = 'America/Los_Angeles'

/** Any well-formed uuid that will not exist. */
const ABSENT_ID = '00000000-0000-4000-8000-0000000000ff'

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

async function call<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; payload: ApiResponse<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${SECRET}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  // The API guarantees this envelope on every route, error paths included.
  const payload = (await res.json().catch(() => ({
    data: null,
    error: 'response was not JSON',
    status: res.status,
  }))) as ApiResponse<T>
  return { status: res.status, payload }
}

/** Today's high from a windowed forecast response, or null if it is empty. */
function firstHigh(days: ForecastSnapshot[] | null): number | null {
  const first = days?.[0]
  return typeof first?.temp_c_max === 'number' ? first.temp_c_max : null
}

type Db = (typeof import('../db/index.js'))['db']

async function resolveSeededUser(db: Db): Promise<string | null> {
  const existing = process.env['DEFAULT_USER_ID']
  if (existing) return existing

  const { users } = await import('../db/schema.js')
  const rows = await db.select({ id: users.id }).from(users).limit(1)
  const id = rows[0]?.id
  if (!id) return null

  // resolveUser reads this per request, so setting it here is enough. The saved
  // location carries a user_id foreign key, so it has to be a real user.
  process.env['DEFAULT_USER_ID'] = id
  console.log(`\nUsing the seeded user ${id} (DEFAULT_USER_ID was not set)`)
  return id
}

async function run(): Promise<void> {
  if (!process.env['DATABASE_URL']) {
    console.error(
      '\nMissing DATABASE_URL — the Neon pooled connection string.' +
        '\nNeon dashboard > project > Connect. Vercel will not reveal its copy.\n',
    )
    process.exit(2)
  }

  process.env['API_SHARED_SECRET'] = SECRET
  process.env['LOG_LEVEL'] ??= 'warn'

  const { createApp } = await import('../index.js')
  const { db, pool } = await import('../db/index.js')
  const { weatherAlerts } = await import('../db/schema.js')

  if ((await resolveSeededUser(db)) === null) {
    console.error('\nNo users in the database, and no DEFAULT_USER_ID set. Nothing to save against.\n')
    await pool.end()
    process.exit(2)
  }

  const app = createApp()
  const server = app.listen(PORT)
  await new Promise<void>((resolve) => server.once('listening', resolve))

  let savedId: string | null = null
  let needsCleanup = false

  try {
    console.log('\nSaving a location')
    const created = await call<Location>('POST', '/locations', {
      name: `${NAME_PREFIX} ${new Date().toISOString()}`,
      lat: LAT,
      lon: LON,
      elevation_m: ELEVATION_M,
      timezone: TIMEZONE,
      is_climbing_location: true,
      rock_type: 'sandstone',
    })
    check(
      'POST /locations returns 201',
      created.status === 201,
      `got ${created.status} ${String(created.payload.error)}`,
    )

    const saved = created.payload.data
    savedId = saved?.id ?? null
    check('response carries a new id', savedId !== null)
    if (savedId === null || saved === null) throw new Error('nothing was saved — stopping')
    needsCleanup = true

    check(
      'is_climbing_location was honoured, not forced to false',
      saved.is_climbing_location === true,
      `got ${String(saved.is_climbing_location)}`,
    )
    check('rock_type was stored', saved.rock_type === 'sandstone', `got ${String(saved.rock_type)}`)
    check(
      'elevation_m was persisted',
      saved.elevation_m === ELEVATION_M,
      `got ${String(saved.elevation_m)}`,
    )
    check('timezone was persisted', saved.timezone === TIMEZONE, `got ${String(saved.timezone)}`)

    console.log('\nReading it back')
    const fetched = await call<Location>('GET', `/locations/${savedId}`)
    check('GET /locations/:id returns 200', fetched.status === 200, `got ${fetched.status}`)
    check(
      'elevation_m survived the round trip',
      fetched.payload.data?.elevation_m === ELEVATION_M,
      `got ${String(fetched.payload.data?.elevation_m)}`,
    )

    console.log('\nPreview and saved location must report the same temperature')
    console.log('  (the §12.3 change-5 guarantee — makes external calls, ~15s)')
    const preview = await call<ForecastSnapshot[]>(
      'GET',
      `/preview?lat=${LAT}&lon=${LON}&elevation=${ELEVATION_M}`,
    )
    const forecast = await call<ForecastSnapshot[]>('GET', `/forecast/${savedId}`)
    check('GET /preview returns 200', preview.status === 200, `got ${preview.status}`)
    check('GET /forecast/:id returns 200', forecast.status === 200, `got ${forecast.status}`)

    const previewHigh = firstHigh(preview.payload.data)
    const savedHigh = firstHigh(forecast.payload.data)
    check(
      'same temperature before and after saving',
      previewHigh !== null && savedHigh !== null && Math.abs(previewHigh - savedHigh) < 0.05,
      `preview ${String(previewHigh)}°C vs saved ${String(savedHigh)}°C`,
    )

    console.log('\nRejecting bad input')
    const badRock = await call<Location>('POST', '/locations', {
      name: `${NAME_PREFIX} bad rock`,
      lat: LAT,
      lon: LON,
      rock_type: 'marble',
    })
    check('unknown rock_type is refused', badRock.status === 400, `got ${badRock.status}`)
    const badLat = await call<Location>('POST', '/locations', {
      name: `${NAME_PREFIX} bad lat`,
      lat: 999,
      lon: LON,
    })
    check('out-of-range lat is refused', badLat.status === 400, `got ${badLat.status}`)

    console.log('\nDeleting — with an alert row attached, which is what would break it')
    await db.insert(weatherAlerts).values({
      location_id: savedId,
      nws_alert_id: `task5a-check-${Date.now()}`,
      event: 'Test Alert',
      severity: 'Minor',
      certainty: 'Observed',
      headline: 'Task 5a acceptance check',
    })
    console.log('  attached 1 weather_alerts row')

    const deleted = await call<null>('DELETE', `/locations/${savedId}`)
    check(
      'DELETE /locations/:id returns 200',
      deleted.status === 200,
      `got ${deleted.status} ${String(deleted.payload.error)}`,
    )
    if (deleted.status === 200) needsCleanup = false

    const gone = await call<Location>('GET', `/locations/${savedId}`)
    check('the location is gone', gone.status === 404, `got ${gone.status}`)

    const again = await call<null>('DELETE', `/locations/${savedId}`)
    check('deleting it twice is a clean 404, not an error', again.status === 404, `got ${again.status}`)

    const absent = await call<null>('DELETE', `/locations/${ABSENT_ID}`)
    check('deleting an unknown id is a clean 404', absent.status === 404, `got ${absent.status}`)
  } catch (err) {
    failed++
    console.log(`\n  ERROR  ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    if (needsCleanup && savedId !== null) {
      // A step failed before the delete ran. Don't leave the row behind.
      const cleanup = await call<null>('DELETE', `/locations/${savedId}`).catch(() => null)
      console.log(
        cleanup?.status === 200
          ? '\n  cleaned up the test location'
          : `\n  COULD NOT CLEAN UP — remove the location named "${NAME_PREFIX} ..." by hand`,
      )
    }
    server.close()
    await pool.end()
  }

  console.log(`\n${failed === 0 ? 'ALL PASSED' : 'FAILURES'} — ${passed} passed, ${failed} failed\n`)
  process.exit(failed === 0 ? 0 : 1)
}

run().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
