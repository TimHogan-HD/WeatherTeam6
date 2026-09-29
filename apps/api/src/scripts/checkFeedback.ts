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
    check('GET lists all three rows', mine.length === 3, `found ${mine.length}`)
    const leaked = (list.payload.data ?? []).filter((f) => f.message?.startsWith(NAME_PREFIX) && !createdFeedback.includes(f.id))
    check('and no refused request left a row behind', leaked.every((f) => f.message !== tag))

    console.log('\nDeleting the location detaches its checks')
    const removed = await call<null>('DELETE', `/locations/${locationId}`)
    check('DELETE /locations answers 200, not a foreign-key 500', removed.status === 200, `got ${removed.status}`)
    if (removed.status === 200) createdLocations.pop()
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
