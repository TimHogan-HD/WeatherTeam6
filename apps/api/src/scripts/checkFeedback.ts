/**
 * Acceptance check for `/api/v1/feedback` and its interaction with
 * `DELETE /locations/:id`.
 *
 * Usage, from `apps/api`:
 *   $env:DATABASE_URL = "<Neon pooled connection string>"
 *   npm run check:feedback
 *
 * Why a script: the parser is unit-tested in `parseFeedback.test.ts`, but what
 * matters here only appears against Postgres — the `app_readings` jsonb
 * round-trip, the table's CHECK constraints, and above all that deleting a
 * location **detaches** its forecast checks instead of failing on the foreign
 * key or deleting them. The vitest suite never opens a connection.
 *
 * Makes no upstream weather calls. Creates one location named with the prefix
 * below and feedback rows whose text carries it, and always tries to delete
 * both, including when a step fails.
 *
 * `DEFAULT_USER_ID` is optional: without it the first user in `users` is used.
 * console rather than the logger is deliberate — the output is the result.
 */

import type { ApiResponse, Feedback, Location } from '@weatherteam6/types'

const PORT = 3097
const BASE = `http://127.0.0.1:${PORT}/api/v1`

/** Local-only credential for the /api/v1 gate. Never leaves this process. */
const SECRET = 'local-acceptance-check'

const NAME_PREFIX = 'ZZ feedback check'

const RED_ROCK = { lat: 36.15192, lon: -115.45413 }
/** OpenBeta's Cyclops Area point, inside Barn Bluff's guidebook. */
const BARN_BLUFF = { lat: 44.56905, lon: -92.52198 }
const CYCLOPS_AREA_ID = '16a9295d-9dda-5b6b-b610-7c6dfa297ce5'

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
  process.env['AUTH_TOKEN_SECRET'] ??= 'local-acceptance-token-secret'
  process.env['LOG_LEVEL'] ??= 'warn'

  const { createApp } = await import('../index.js')
  const { db, pool } = await import('../db/index.js')

  if ((await resolveSeededUser(db)) === null) {
    console.error('\nNo users in the database, and no DEFAULT_USER_ID set. Nothing to save against.\n')
    await pool.end()
    process.exit(2)
  }

  const app = createApp()
  const server = app.listen(PORT)
  await new Promise<void>((resolve) => server.once('listening', resolve))

  const stamp = new Date().toISOString()
  const tag = `${NAME_PREFIX} ${stamp}`
  const createdLocations: string[] = []
  const createdFeedback: string[] = []

  try {
    const loc = await call<Location>('POST', '/locations', {
      name: tag,
      ...RED_ROCK,
      is_climbing_location: true,
      rock_type: 'sandstone',
    })
    if (loc.status !== 201 || loc.payload.data === null) {
      throw new Error(`setup: POST /locations answered ${loc.status} ${String(loc.payload.error)}`)
    }
    const locationId = loc.payload.data.id
    createdLocations.push(locationId)

    console.log('\nA forecast check with a snapshot')
    const snapshot = {
      valid_at: new Date(Math.floor(Date.now() / 3600_000) * 3600_000).toISOString(),
      model: 'gfs_seamless',
      fields: [
        { label: 'Dryness', value: 'Dry' },
        { label: 'Friction', value: 'Good' },
        { label: 'Score', value: '82' },
      ],
    }
    const posted = await call<Feedback>('POST', '/feedback', {
      kind: 'forecast',
      location_id: locationId,
      observed_at: new Date().toISOString(),
      observed_conditions: 'damp',
      verdict: 'missed',
      message: tag,
      app_readings: snapshot,
    })
    check('POST returns 201', posted.status === 201, `got ${posted.status} ${String(posted.payload.error)}`)
    const checkRow = posted.payload.data
    if (checkRow !== null) createdFeedback.push(checkRow.id)
    check('the snapshot round-trips through jsonb unchanged', JSON.stringify(checkRow?.app_readings) === JSON.stringify(snapshot))
    check('the location name was copied onto the row', checkRow?.location_name === tag)
    check('observed_conditions and verdict stored', checkRow?.observed_conditions === 'damp' && checkRow?.verdict === 'missed')

    console.log('\nA check the app had no reading for')
    const bare = await call<Feedback>('POST', '/feedback', {
      kind: 'forecast',
      location_id: locationId,
      observed_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      observed_conditions: 'dry',
      verdict: 'matched',
      app_readings: null,
    })
    check('POST with app_readings: null returns 201', bare.status === 201, `got ${bare.status}`)
    if (bare.payload.data !== null) createdFeedback.push(bare.payload.data.id)
    check('and stores null, not {}', bare.payload.data?.app_readings === null)

    console.log('\nSeveral stops, each with its own area, wall, routes, hours and sun')
    const barn = await call<Location>('POST', '/locations', {
      name: `${tag} barn`,
      ...BARN_BLUFF,
      is_climbing_location: true,
      rock_type: 'limestone',
    })
    if (barn.status !== 201 || barn.payload.data === null) {
      throw new Error(`setup: POST /locations (Barn Bluff) answered ${barn.status} ${String(barn.payload.error)}`)
    }
    const barnId = barn.payload.data.id
    createdLocations.push(barnId)
    const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString()
    const { guidebookFor } = await import('../lib/guidebook/guidebook.js')
    const barnWalls = guidebookFor(BARN_BLUFF.lat, BARN_BLUFF.lon)?.walls ?? []
    const cyclopsRoute = barnWalls.find((w) => w.id === CYCLOPS_AREA_ID)?.routes[0]
    const winterRoute = barnWalls.find((w) => w.name === 'Winter Wall')?.routes[0]
    if (cyclopsRoute === undefined || winterRoute === undefined) throw new Error('setup: Barn Bluff has no Cyclops or Winter Wall routes in the snapshot')
    // Keys in the order the API writes them, so the round trip compares as text.
    const stops = [
      {
        area_id: CYCLOPS_AREA_ID,
        area_name: 'Cyclops Area',
        wall_id: null,
        wall: 'left side',
        route_picks: [{ id: cyclopsRoute.id, name: cyclopsRoute.name }],
        routes: 'Unlisted one',
        started_at: hoursAgo(3),
        ended_at: hoursAgo(1.5),
        sun_exposure: 'mostly_shade',
      },
      { area_id: null, area_name: 'Somewhere typed', wall_id: null, wall: null, route_picks: [], routes: null, started_at: hoursAgo(1), ended_at: null, sun_exposure: 'full_sun' },
    ]
    const detailed = await call<Feedback>('POST', '/feedback', {
      kind: 'forecast',
      location_id: barnId,
      observed_at: stops[0]?.started_at,
      observed_conditions: 'dry',
      verdict: 'partly',
      app_readings: null,
      stops,
    })
    check('POST with two stops returns 201', detailed.status === 201, `got ${detailed.status} ${String(detailed.payload.error)}`)
    const d = detailed.payload.data
    if (d !== null) createdFeedback.push(d.id)
    check('both stops round-trip through jsonb, in order, unchanged', JSON.stringify(d?.stops) === JSON.stringify(stops), JSON.stringify(d?.stops))
    const listed = await call<Feedback[]>('GET', '/feedback')
    const back = (listed.payload.data ?? []).find((f) => f.id === d?.id)
    check('and GET reads them back the same', JSON.stringify(back?.stops) === JSON.stringify(stops))
    check('a check with no stops reads back as []', (listed.payload.data ?? []).find((f) => f.id === checkRow?.id)?.stops.length === 0)
    const foreign = await call<Feedback>('POST', '/feedback', {
      kind: 'forecast',
      location_id: locationId,
      observed_at: stops[0]?.started_at,
      observed_conditions: 'dry',
      verdict: 'matched',
      app_readings: null,
      stops: [stops[1], stops[0]],
    })
    check("a Barn Bluff area in any stop on Red Rock is a 400", foreign.status === 400, `got ${foreign.status}`)
    if (foreign.payload.data !== null) createdFeedback.push(foreign.payload.data.id)
    const offWall = await call<Feedback>('POST', '/feedback', {
      kind: 'forecast',
      location_id: barnId,
      observed_at: stops[0]?.started_at,
      observed_conditions: 'dry',
      verdict: 'matched',
      app_readings: null,
      stops: [{ ...stops[0], route_picks: [{ id: winterRoute.id, name: winterRoute.name }] }],
    })
    check('a Winter Wall route picked on Cyclops Area is a 400', offWall.status === 400, `got ${offWall.status} ${String(offWall.payload.error)}`)
    if (offWall.payload.data !== null) createdFeedback.push(offWall.payload.data.id)

    console.log('\nApp feedback')
    const appFb = await call<Feedback>('POST', '/feedback', { kind: 'app', message: tag })
    check('POST app feedback returns 201', appFb.status === 201, `got ${appFb.status}`)
    if (appFb.payload.data !== null) createdFeedback.push(appFb.payload.data.id)
    check('with no location', appFb.payload.data?.location_id === null)

    console.log('\nRefusals write nothing')
    const blank = await call<Feedback>('POST', '/feedback', { kind: 'app', message: '   ' })
    check('a blank message is a 400', blank.status === 400, `got ${blank.status}`)
    const absent = await call<Feedback>('POST', '/feedback', {
      kind: 'app',
      message: tag,
      location_id: '00000000-0000-4000-8000-0000000000fe',
    })
    check('an absent location is a 404', absent.status === 404, `got ${absent.status}`)

    const list = await call<Feedback[]>('GET', '/feedback')
    check('GET returns 200', list.status === 200)
    const mine = (list.payload.data ?? []).filter((f) => createdFeedback.includes(f.id))
    check('GET lists all four rows', mine.length === 4, `found ${mine.length}`)
    const leaked = (list.payload.data ?? []).filter((f) => f.message?.startsWith(NAME_PREFIX) && !createdFeedback.includes(f.id))
    check('and no refused request left a row behind', leaked.every((f) => f.message !== tag))

    console.log('\nResolving an item clears it from the list and keeps the row')
    const appId = appFb.payload.data?.id ?? ''
    const resolved = await call<null>('POST', `/feedback/${appId}/resolve`)
    check('POST /resolve answers 200', resolved.status === 200, `got ${resolved.status}`)
    const again = await call<null>('POST', `/feedback/${appId}/resolve`)
    check('resolving twice is still 200', again.status === 200, `got ${again.status}`)
    const afterResolve = await call<Feedback[]>('GET', '/feedback')
    check('the resolved item left GET /feedback', !(afterResolve.payload.data ?? []).some((f) => f.id === appId))
    check('the others are still listed', (afterResolve.payload.data ?? []).some((f) => f.id === checkRow?.id))
    const { feedback: feedbackTable } = await import('../db/schema.js')
    const { eq } = await import('drizzle-orm')
    const stored = await db.select({ resolved_at: feedbackTable.resolved_at }).from(feedbackTable).where(eq(feedbackTable.id, appId))
    check('the row is still in the table, with resolved_at set', stored[0]?.resolved_at instanceof Date)
    const missing = await call<null>('POST', '/feedback/00000000-0000-4000-8000-0000000000fe/resolve')
    check('resolving an absent id is a 404', missing.status === 404, `got ${missing.status}`)
    const notUuid = await call<null>('POST', '/feedback/not-a-uuid/resolve')
    check('resolving a non-uuid is a 404, not a 500', notUuid.status === 404, `got ${notUuid.status}`)

    console.log('\nDeleting the location detaches its checks')
    const removed = await call<null>('DELETE', `/locations/${locationId}`)
    check('DELETE /locations answers 200, not a foreign-key 500', removed.status === 200, `got ${removed.status}`)
    if (removed.status === 200) createdLocations.splice(createdLocations.indexOf(locationId), 1)
    const after = await call<Feedback[]>('GET', '/feedback')
    const survived = (after.payload.data ?? []).find((f) => f.id === checkRow?.id)
    check('the forecast check survived', survived !== undefined)
    check('with location_id null and its name kept', survived?.location_id === null && survived.location_name === tag)
  } catch (err) {
    failed++
    console.log(`  FAIL  ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    for (const id of createdFeedback) {
      const cleanup = await call<null>('DELETE', `/feedback/${id}`).catch(() => null)
      if (cleanup?.status !== 200) console.log(`\n  COULD NOT CLEAN UP feedback ${id} — its message starts "${NAME_PREFIX}"`)
    }
    for (const id of createdLocations) {
      const cleanup = await call<null>('DELETE', `/locations/${id}`).catch(() => null)
      if (cleanup?.status !== 200) console.log(`\n  COULD NOT CLEAN UP location ${id} — named "${NAME_PREFIX} ..."`)
    }
    console.log(`\n  cleanup attempted for ${createdFeedback.length} feedback row(s), ${createdLocations.length} location(s)`)
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
