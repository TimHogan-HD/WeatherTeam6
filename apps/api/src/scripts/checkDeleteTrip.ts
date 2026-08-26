/**
 * Acceptance check for `DELETE /trips/:tripId`.
 *
 * Usage, from `apps/api`:
 *   $env:DATABASE_URL = "<Neon pooled connection string>"
 *   npm run check:delete-trip
 *
 * Why this exists as a script rather than a test: the bug it covers is a
 * foreign-key violation, and vitest mocks `fetch` and never opens a connection —
 * that class of failure is invisible to the suite. `trip_locations.trip_id`
 * references `trips` and no FK declares `onDelete`, so deleting the trip row
 * directly raised a constraint error that surfaced as a generic 500. Since
 * `POST /trips` requires at least one location, *every* trip hit it.
 *
 * Walks the flow end to end: save a location, create a trip pointing at it,
 * delete the trip, confirm both the trip and its `trip_locations` rows are gone
 * and that the location itself survives.
 *
 * Creates exactly two rows, named with the prefix below, and always tries to
 * remove them — including when a step fails partway through.
 *
 * `DEFAULT_USER_ID` is optional: without it the seeded user is read from the
 * `users` table.
 *
 * console rather than the logger is deliberate — this is an operator-facing CLI,
 * same as `checkAddLocationApi.ts`, and its output is the result.
 */

import type { ApiResponse, Location, Trip } from '@weatherteam6/types'

// Runtime imports are deferred into run(): `../db/index.js` throws at import
// time when DATABASE_URL is unset, which would pre-empt the explanation below
// with a stack trace. Types are erased at compile time, so they stay static.

const PORT = 3098
const BASE = `http://127.0.0.1:${PORT}/api/v1`

/** Local-only credential for the /api/v1 gate. Never leaves this process. */
const SECRET = 'local-acceptance-check'

const NAME_PREFIX = 'ZZ trip-delete check'

// Red Rock Canyon NCA, Nevada.
const LAT = 36.15192
const LON = -115.45413

/** Any well-formed uuid that will not exist. */
const ABSENT_ID = '00000000-0000-4000-8000-0000000000fe'

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

type Db = (typeof import('../db/index.js'))['db']

async function resolveSeededUser(db: Db): Promise<string | null> {
  const existing = process.env['DEFAULT_USER_ID']
  if (existing) return existing

  const { users } = await import('../db/schema.js')
  const rows = await db.select({ id: users.id }).from(users).limit(1)
  const id = rows[0]?.id
  if (!id) return null

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
  const { tripLocations } = await import('../db/schema.js')
  const { eq } = await import('drizzle-orm')

  if ((await resolveSeededUser(db)) === null) {
    console.error('\nNo users in the database, and no DEFAULT_USER_ID set. Nothing to save against.\n')
    await pool.end()
    process.exit(2)
  }

  const app = createApp()
  const server = app.listen(PORT)
  await new Promise<void>((resolve) => server.once('listening', resolve))

  let locationId: string | null = null
  let tripId: string | null = null

  try {
    console.log('\nSaving a location for the trip to point at')
    const created = await call<Location>('POST', '/locations', {
      name: `${NAME_PREFIX} ${new Date().toISOString()}`,
      lat: LAT,
      lon: LON,
      is_climbing_location: true,
      rock_type: 'sandstone',
    })
    locationId = created.payload.data?.id ?? null
    check('POST /locations returns 201', created.status === 201, `got ${created.status}`)
    if (locationId === null) throw new Error('nothing was saved — stopping')

    console.log('\nCreating a trip with that location attached')
    const trip = await call<Trip>('POST', '/trips', {
      name: `${NAME_PREFIX} trip`,
      startDate: '2026-09-01',
      endDate: '2026-09-03',
      cragIds: [locationId],
    })
    tripId = trip.payload.data?.id ?? null
    check(
      'POST /trips returns 201',
      trip.status === 201,
      `got ${trip.status} ${String(trip.payload.error)}`,
    )
    if (tripId === null) throw new Error('no trip was created — stopping')
    check(
      'the trip carries its location',
      (trip.payload.data?.locations?.length ?? 0) === 1,
      `got ${String(trip.payload.data?.locations?.length)}`,
    )

    console.log('\nDeleting the trip — this is what used to 500')
    const deleted = await call<null>('DELETE', `/trips/${tripId}`)
    check(
      'DELETE /trips/:tripId returns 200, not a foreign-key 500',
      deleted.status === 200,
      `got ${deleted.status} ${String(deleted.payload.error)}`,
    )
    if (deleted.status === 200) tripId = null

    const gone = await call<Trip>('GET', `/trips/${trip.payload.data?.id ?? ''}`)
    check('the trip is gone', gone.status === 404, `got ${gone.status}`)

    const orphans = await db
      .select({ id: tripLocations.id })
      .from(tripLocations)
      .where(eq(tripLocations.trip_id, trip.payload.data?.id ?? ABSENT_ID))
    check(
      'its trip_locations rows went with it',
      orphans.length === 0,
      `${orphans.length} row(s) left behind`,
    )

    const stillThere = await call<Location>('GET', `/locations/${locationId}`)
    check(
      'the location itself survived the trip delete',
      stillThere.status === 200,
      `got ${stillThere.status}`,
    )

    const again = await call<null>('DELETE', `/trips/${trip.payload.data?.id ?? ''}`)
    check('deleting it twice is a clean 404, not an error', again.status === 404, `got ${again.status}`)

    const absent = await call<null>('DELETE', `/trips/${ABSENT_ID}`)
    check('deleting an unknown id is a clean 404', absent.status === 404, `got ${absent.status}`)
  } catch (err) {
    failed++
    console.log(`\n  ERROR  ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    // Order matters: the trip references the location, so it goes first.
    if (tripId !== null) {
      const cleanup = await call<null>('DELETE', `/trips/${tripId}`).catch(() => null)
      console.log(
        cleanup?.status === 200
          ? '  cleaned up the test trip'
          : `  COULD NOT CLEAN UP the trip — remove "${NAME_PREFIX} trip" by hand`,
      )
    }
    if (locationId !== null) {
      const cleanup = await call<null>('DELETE', `/locations/${locationId}`).catch(() => null)
      console.log(
        cleanup?.status === 200
          ? '  cleaned up the test location'
          : `  COULD NOT CLEAN UP the location — remove "${NAME_PREFIX} ..." by hand`,
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
