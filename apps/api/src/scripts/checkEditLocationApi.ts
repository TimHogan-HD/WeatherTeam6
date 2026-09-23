/**
 * Acceptance check for `PATCH /api/v1/locations/:id` — scoring Phase 4b.
 *
 * Usage, from `apps/api`:
 *   $env:DATABASE_URL = "<Neon pooled connection string>"
 *   npm run check:edit-location
 *
 * Why a script: the rules are unit-tested in `updateLocation.test.ts`, but the
 * failures that matter here only appear against Postgres — a negative angle
 * that a `numeric` column refuses or mangles, a `null` that fails to clear, an
 * `updated_at` that never writes, a 409 path that still wrote the row. The
 * vitest suite never opens a connection.
 *
 * Makes no upstream weather calls. Creates three locations named with the
 * prefix below and always tries to delete them, including when a step fails.
 *
 * `DEFAULT_USER_ID` is optional: without it the first user in `users` is used.
 * console rather than the logger is deliberate — the output is the result.
 */

import type { ApiResponse, Location } from '@weatherteam6/types'

const PORT = 3098
const BASE = `http://127.0.0.1:${PORT}/api/v1`

/** Local-only credential for the /api/v1 gate. Never leaves this process. */
const SECRET = 'local-acceptance-check'

const NAME_PREFIX = 'ZZ Phase4b check'

// Red Rock Canyon NCA — a crag that is deliberately not in KNOWN_CRAGS.
const RED_ROCK = { lat: 36.15192, lon: -115.45413 }
// Barn Bluff, Red Wing — inside a known crag's box, so its rock type locks.
const RED_WING = { lat: 44.5695, lon: -92.526 }

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

  const created: string[] = []
  const stamp = new Date().toISOString()

  async function save(body: Record<string, unknown>): Promise<Location> {
    const res = await call<Location>('POST', '/locations', { name: `${NAME_PREFIX} ${stamp}`, ...body })
    if (res.status !== 201 || res.payload.data === null) {
      throw new Error(`setup: POST /locations answered ${res.status} ${String(res.payload.error)}`)
    }
    created.push(res.payload.data.id)
    return res.payload.data
  }

  try {
    console.log('\nEditing a crag: aspect and an overhanging angle')
    const crag = await save({ ...RED_ROCK, is_climbing_location: true, rock_type: 'sandstone' })
    check('a new location has no recorded wall', crag.aspect === null && crag.cliff_angle === null)
    check('and reports wall_angle_deg as null, not 0', crag.wall_angle_deg === null)

    const edited = await call<Location>('PATCH', `/locations/${crag.id}`, {
      aspect: 'se',
      wall_angle_deg: 15,
    })
    check('PATCH returns 200', edited.status === 200, `got ${edited.status} ${String(edited.payload.error)}`)
    check('aspect is stored as the compass point', edited.payload.data?.aspect === 'SE')
    check(
      'a 15° overhang is stored as cliff_angle −15 — negative survives the numeric column',
      edited.payload.data?.cliff_angle === -15,
      `got ${String(edited.payload.data?.cliff_angle)}`,
    )
    check(
      'and reads back in climbers’ convention as +15',
      edited.payload.data?.wall_angle_deg === 15,
      `got ${String(edited.payload.data?.wall_angle_deg)}`,
    )
    check('updated_at was written', typeof edited.payload.data?.updated_at === 'string')
    check('rock_type was left alone', edited.payload.data?.rock_type === 'sandstone')

    const readBack = await call<Location>('GET', `/locations/${crag.id}`)
    check(
      'GET reads the edit back from the database',
      readBack.payload.data?.aspect === 'SE' && readBack.payload.data?.cliff_angle === -15,
      `got ${String(readBack.payload.data?.aspect)} / ${String(readBack.payload.data?.cliff_angle)}`,
    )

    console.log('\nClearing one field leaves the other')
    const cleared = await call<Location>('PATCH', `/locations/${crag.id}`, { wall_angle_deg: null })
    check('PATCH null returns 200', cleared.status === 200, `got ${cleared.status}`)
    check('cliff_angle is null again, not 0', cleared.payload.data?.cliff_angle === null)
    check('aspect survived', cleared.payload.data?.aspect === 'SE')

    console.log('\nThe wrong field name is refused, not ignored')
    const wrong = await call<Location>('PATCH', `/locations/${crag.id}`, { cliff_angle: 10 })
    check('PATCH { cliff_angle } is a 400', wrong.status === 400, `got ${wrong.status}`)
    check('and names the field', String(wrong.payload.error).includes('cliff_angle'))
    const afterWrong = await call<Location>('GET', `/locations/${crag.id}`)
    check('the row did not change', afterWrong.payload.data?.cliff_angle === null)

    console.log('\nAn unlocked rock type changes')
    const retyped = await call<Location>('PATCH', `/locations/${crag.id}`, { rock_type: 'sandstone_eolian' })
    check('PATCH rock_type returns 200', retyped.status === 200, `got ${retyped.status}`)
    check('rock_type stored', retyped.payload.data?.rock_type === 'sandstone_eolian')
    check('known_crag stays null', retyped.payload.data?.known_crag === null)

    console.log('\nA known crag’s rock type is locked')
    const locked = await save({ ...RED_WING, is_climbing_location: true, rock_type: 'granite' })
    check('setup: the save locked it', locked.known_crag === 'red-wing', `got ${String(locked.known_crag)}`)
    const refused = await call<Location>('PATCH', `/locations/${locked.id}`, { rock_type: 'granite' })
    check('changing it is a 409', refused.status === 409, `got ${refused.status}`)
    const afterRefused = await call<Location>('GET', `/locations/${locked.id}`)
    check(
      'and the 409 wrote nothing',
      afterRefused.payload.data?.rock_type === locked.rock_type &&
        afterRefused.payload.data?.updated_at === locked.updated_at,
    )
    const resubmit = await call<Location>('PATCH', `/locations/${locked.id}`, {
      rock_type: locked.rock_type,
      aspect: 'W',
    })
    check(
      'resubmitting the locked value with another edit is a 200',
      resubmit.status === 200 && resubmit.payload.data?.aspect === 'W',
      `got ${resubmit.status} ${String(resubmit.payload.error)}`,
    )

    console.log('\nA town takes no wall facts')
    const town = await save({ ...RED_ROCK, is_climbing_location: false })
    const townEdit = await call<Location>('PATCH', `/locations/${town.id}`, { aspect: 'N' })
    check('aspect on a non-crag is a 409', townEdit.status === 409, `got ${townEdit.status}`)
    const townClear = await call<Location>('PATCH', `/locations/${town.id}`, { aspect: null })
    check('clearing it is a 200', townClear.status === 200, `got ${townClear.status}`)

    console.log('\nMissing and malformed ids')
    const absent = await call<Location>('PATCH', `/locations/${ABSENT_ID}`, { aspect: 'N' })
    check('an absent id is a 404', absent.status === 404, `got ${absent.status}`)
    const malformed = await call<Location>('PATCH', '/locations/not-a-uuid', { aspect: 'N' })
    check('a non-uuid is a 404, not a Postgres 500', malformed.status === 404, `got ${malformed.status}`)
  } catch (err) {
    failed++
    console.log(`  FAIL  ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    for (const id of created) {
      const cleanup = await call<null>('DELETE', `/locations/${id}`).catch(() => null)
      if (cleanup?.status !== 200) {
        console.log(`\n  COULD NOT CLEAN UP ${id} — remove the location named "${NAME_PREFIX} ..." by hand`)
      }
    }
    if (created.length > 0) console.log(`\n  cleanup attempted for ${created.length} test location(s)`)
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
