/**
 * Acceptance check for `PATCH /trips/:tripId`.
 *
 * Usage, from `apps/api`:
 *   $env:DATABASE_URL = "<Neon pooled connection string>"
 *   npm run check:edit-trip
 *
 * Why a script: the edit is one transaction across `trips`, `trip_locations`
 * and `trip_rain_records`, and what it must keep or clear only shows against
 * Postgres. The rules: a rename keeps the trend; a change of dates clears it
 * (its totals covered other days); removing a crag clears only that crag's
 * trend; new climbing hours keep it, and null sends the trip back to Profile
 * hours; another account can neither edit the trip nor add its own crag to it.
 *
 * Rows are named with the prefix below and removed in `finally`, including
 * when a step fails partway.
 *
 * console rather than the logger is deliberate — an operator-facing CLI, same as
 * `checkDeleteTrip.ts`.
 */

import type { ApiResponse, Location, Trip } from '@weatherteam6/types'

const PORT = 3097
const BASE = `http://127.0.0.1:${PORT}/api/v1`

/** Local-only credentials for the /api/v1 gate. Never leave this process. */
const SECRET = 'local-acceptance-check'
const TOKEN_SECRET = 'local-acceptance-token-secret'

const NAME_PREFIX = 'ZZ trip-edit check'
const STAMP = Date.now()

// Red Wing and Taylors Falls, Minnesota.
const POINTS = [
  { lat: 44.5625, lon: -92.5338 },
  { lat: 45.4019, lon: -92.6527 },
]

/** A well-formed account id that owns nothing. */
const STRANGER_ID = '00000000-0000-4000-8000-0000000000fc'

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
  auth = `Bearer ${SECRET}`,
): Promise<{ status: number; payload: ApiResponse<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: auth, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const payload = (await res.json().catch(() => ({
    data: null,
    error: 'response was not JSON',
    status: res.status,
  }))) as ApiResponse<T>
  return { status: res.status, payload }
}

async function run(): Promise<void> {
  if (!process.env['DATABASE_URL']) {
    console.error('\nMissing DATABASE_URL — the Neon pooled connection string.\n')
    process.exit(2)
  }
  process.env['API_SHARED_SECRET'] = SECRET
  process.env['AUTH_TOKEN_SECRET'] = TOKEN_SECRET
  process.env['LOG_LEVEL'] ??= 'warn'

  const { createApp } = await import('../index.js')
  const { db, pool } = await import('../db/index.js')
  const { users, locations, trips, tripRainRecords } = await import('../db/schema.js')
  const { deleteLocationCascade } = await import('../lib/locations/deleteLocation.js')
  const { signToken, expiryFrom } = await import('../lib/auth/token.js')
  const { and, eq } = await import('drizzle-orm')

  if (!process.env['DEFAULT_USER_ID']) {
    const first = (await db.select({ id: users.id }).from(users).limit(1))[0]
    if (!first) {
      console.error('\nNo users in the database, and no DEFAULT_USER_ID set.\n')
      await pool.end()
      process.exit(2)
    }
    process.env['DEFAULT_USER_ID'] = first.id
  }

  const server = createApp().listen(PORT)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const stranger = `Session ${signToken({ sub: STRANGER_ID, exp: expiryFrom() }, TOKEN_SECRET)}`

  const cragIds: string[] = []
  let tripId: string | null = null
  let secondTripId: string | null = null
  let otherUserId: string | null = null
  let otherCragId: string | null = null

  const recordPoint = async (locationId: string) =>
    db.insert(tripRainRecords).values({
      trip_id: tripId ?? '',
      location_id: locationId,
      recorded_at: new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000),
      mean_mm: 2,
      p10_mm: 0,
      p90_mm: 5,
      member_count: 100,
      days_covered: 3,
      trip_days: 3,
      high_c_max: 15,
    })
  const pointsFor = async (locationId?: string) =>
    (
      await db
        .select({ id: tripRainRecords.id })
        .from(tripRainRecords)
        .where(
          locationId === undefined
            ? eq(tripRainRecords.trip_id, tripId ?? '')
            : and(eq(tripRainRecords.trip_id, tripId ?? ''), eq(tripRainRecords.location_id, locationId)),
        )
    ).length

  try {
    console.log('\nSaving two crags and a trip to both')
    for (const [i, p] of POINTS.entries()) {
      const saved = await call<Location>('POST', '/locations', {
        name: `${NAME_PREFIX} ${i} ${STAMP}`,
        ...p,
        is_climbing_location: true,
        rock_type: 'unknown',
      })
      if (!saved.payload.data) throw new Error(`could not save crag ${i}: ${saved.status}`)
      cragIds.push(saved.payload.data.id)
    }
    const [a, b] = cragIds as [string, string]
    const created = await call<Trip>('POST', '/trips', {
      name: `${NAME_PREFIX} trip`,
      startDate: '2026-10-08',
      endDate: '2026-10-10',
      cragIds: [a, b],
    })
    tripId = created.payload.data?.id ?? null
    if (tripId === null) throw new Error(`no trip was created: ${created.status}`)
    await recordPoint(a)
    await recordPoint(b)

    console.log('\nRenaming')
    const renamed = await call<Trip>('PATCH', `/trips/${tripId}`, { name: `${NAME_PREFIX} renamed` })
    check('PATCH with a name returns 200', renamed.status === 200, `got ${renamed.status} ${String(renamed.payload.error)}`)
    check('the trip has the new name', renamed.payload.data?.name === `${NAME_PREFIX} renamed`)
    check('and its dates and crags unchanged', renamed.payload.data?.startDate === '2026-10-08' && renamed.payload.data.locations?.length === 2)
    check('a rename keeps the trend', (await pointsFor()) === 2, `${await pointsFor()} left`)

    console.log('\nRemoving one crag')
    const dropped = await call<Trip>('PATCH', `/trips/${tripId}`, { cragIds: [a] })
    check('PATCH with crags returns 200', dropped.status === 200, `got ${dropped.status}`)
    check('the trip holds only the kept crag', dropped.payload.data?.locations?.map((l) => l.locationId).join() === a)
    check("the removed crag's trend is gone", (await pointsFor(b)) === 0)
    check("the kept crag's trend stays", (await pointsFor(a)) === 1)

    console.log('\nAdding it back')
    const added = await call<Trip>('PATCH', `/trips/${tripId}`, { cragIds: [a, b] })
    check('adding a crag returns both', added.status === 200 && added.payload.data?.locations?.length === 2)

    console.log('\nMoving the dates')
    const moved = await call<Trip>('PATCH', `/trips/${tripId}`, { endDate: '2026-10-11' })
    check('PATCH with a date returns 200', moved.status === 200 && moved.payload.data?.endDate === '2026-10-11')
    check('a change of dates clears the trend', (await pointsFor()) === 0, `${await pointsFor()} left`)

    console.log('\nClimbing hours')
    check('a new trip follows Profile hours', created.payload.data?.climbHours === null, JSON.stringify(created.payload.data?.climbHours))
    await recordPoint(a)
    const ownHours = await call<Trip>('PATCH', `/trips/${tripId}`, { climbHours: { first: 12, last: 20 } })
    check('PATCH with hours returns 200', ownHours.status === 200, `got ${ownHours.status} ${String(ownHours.payload.error)}`)
    const readBack = await call<Trip>('GET', `/trips/${tripId}`)
    check(
      'the trip reads back its own hours',
      readBack.payload.data?.climbHours?.first === 12 && readBack.payload.data.climbHours.last === 20,
      JSON.stringify(readBack.payload.data?.climbHours),
    )
    check('new hours keep the trend', (await pointsFor()) === 1, `${await pointsFor()} left`)
    const oneEnd = await call<null>('PATCH', `/trips/${tripId}`, { climbHours: { first: 12 } })
    check('hours with one end are 400', oneEnd.status === 400, `got ${oneEnd.status}`)
    const short = await call<null>('PATCH', `/trips/${tripId}`, { climbHours: { first: 12, last: 13 } })
    check('hours under three apart are 400', short.status === 400, `got ${short.status}`)
    const cleared = await call<Trip>('PATCH', `/trips/${tripId}`, { climbHours: null })
    check('null goes back to Profile hours', cleared.status === 200 && cleared.payload.data?.climbHours === null)
    const stored = (
      await db
        .select({ first: trips.climb_first_hour, last: trips.climb_last_hour })
        .from(trips)
        .where(eq(trips.id, tripId))
    )[0]
    check('and both columns are null again', stored?.first === null && stored.last === null, JSON.stringify(stored))
    const withHours = await call<Trip>('POST', '/trips', {
      name: `${NAME_PREFIX} trip with hours`,
      startDate: '2026-10-08',
      endDate: '2026-10-10',
      cragIds: [a],
      climbHours: { first: 6, last: 11 },
    })
    check(
      'a trip can be created with its own hours',
      withHours.status === 201 && withHours.payload.data?.climbHours?.first === 6 && withHours.payload.data.climbHours.last === 11,
      `got ${withHours.status} ${JSON.stringify(withHours.payload.data?.climbHours)}`,
    )
    secondTripId = withHours.payload.data?.id ?? null
    const badCreate = await call<null>('POST', '/trips', {
      name: `${NAME_PREFIX} bad hours`,
      startDate: '2026-10-08',
      endDate: '2026-10-10',
      cragIds: [a],
      climbHours: { first: 20, last: 24 },
    })
    check('creating with hours past 23 is 400', badCreate.status === 400, `got ${badCreate.status}`)

    console.log('\nRefusals')
    const backwards = await call<null>('PATCH', `/trips/${tripId}`, { endDate: '2026-10-01' })
    check('an end before the saved start is 400', backwards.status === 400, `got ${backwards.status}`)
    const empty = await call<null>('PATCH', `/trips/${tripId}`, { cragIds: [] })
    check('an empty crag list is 400', empty.status === 400, `got ${empty.status}`)
    const unknown = await call<null>('PATCH', `/trips/${tripId}`, { notes: 'x' })
    check('an unknown key is 400', unknown.status === 400, `got ${unknown.status}`)
    const nothing = await call<null>('PATCH', `/trips/${tripId}`, {})
    check('an empty body is 400', nothing.status === 400, `got ${nothing.status}`)
    const malformed = await call<null>('PATCH', '/trips/not-a-uuid', { name: 'x' })
    check('a malformed id is 404', malformed.status === 404, `got ${malformed.status}`)

    console.log('\nAnother account')
    const foreign = await call<null>('PATCH', `/trips/${tripId}`, { name: 'taken' }, stranger)
    check("another account's PATCH is 404", foreign.status === 404, `got ${foreign.status}`)
    const other = await db
      .insert(users)
      .values({ username: `zz-trip-edit-${STAMP}`, name: 'ZZ trip-edit check' })
      .returning({ id: users.id })
    otherUserId = other[0]?.id ?? null
    if (otherUserId === null) throw new Error('could not create the other account')
    const otherCrag = await db
      .insert(locations)
      .values({ user_id: otherUserId, name: `${NAME_PREFIX} foreign`, lat: '44.0', lon: '-92.0', is_climbing_location: true })
      .returning({ id: locations.id })
    otherCragId = otherCrag[0]?.id ?? null
    const smuggled = await call<null>('PATCH', `/trips/${tripId}`, { cragIds: [a, otherCragId] })
    check("another account's crag in cragIds is 404", smuggled.status === 404, `got ${smuggled.status}`)
    const after = await call<Trip>('GET', `/trips/${tripId}`)
    check(
      'and neither refusal changed the trip',
      after.payload.data?.name === `${NAME_PREFIX} renamed` && after.payload.data.locations?.length === 2,
      JSON.stringify(after.payload.data?.locations),
    )
  } catch (err) {
    failed++
    console.log(`\n  ERROR  ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    try {
      if (tripId !== null) {
        const res = await call<null>('DELETE', `/trips/${tripId}`)
        if (res.status !== 200) console.log(`  COULD NOT DELETE the trip: ${res.status}`)
      }
      if (secondTripId !== null) {
        const res = await call<null>('DELETE', `/trips/${secondTripId}`)
        if (res.status !== 200) console.log(`  COULD NOT DELETE the second trip: ${res.status}`)
      }
      for (const id of cragIds) await deleteLocationCascade(id, process.env['DEFAULT_USER_ID'] ?? '')
      if (otherCragId !== null && otherUserId !== null) await deleteLocationCascade(otherCragId, otherUserId)
      if (otherUserId !== null) await db.delete(users).where(eq(users.id, otherUserId))
      const left = await db.select({ id: trips.id }).from(trips).where(eq(trips.id, tripId ?? STRANGER_ID))
      console.log(left.length === 0 ? '  cleaned up' : '  COULD NOT CLEAN UP the trip')
    } catch (err) {
      console.log(
        `\n  COULD NOT CLEAN UP — remove rows named "${NAME_PREFIX}…" and the user "zz-trip-edit-${STAMP}" by hand: ` +
          (err instanceof Error ? err.message : String(err)),
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
