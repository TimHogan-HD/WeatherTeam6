/**
 * Acceptance check for `GET`/`PUT /api/v1/preferences` — scoring Phase 5.
 *
 * Usage, from `apps/api`:
 *   $env:DATABASE_URL = "<Neon pooled connection string>"
 *   npm run check:preferences
 *
 * Why a script: the rules are unit-tested in `updatePreferences.test.ts`, but
 * what matters here only appears against Postgres — the upsert's first insert
 * and later update, a null that clears a stored end, a 409 that must not have
 * written, one account's settings never reaching another, and `/hourly` still
 * answering once it reads the settings table.
 *
 * Creates two throwaway users (never the owner's account, whose settings are
 * real) and one location, and removes all of it in `finally`. The `/hourly`
 * step makes upstream weather calls.
 *
 * console rather than the logger is deliberate — the output is the result.
 */

import { fToC, type ApiResponse, type HourlySeries, type Preferences } from '@weatherteam6/types'

const PORT = 3095
const BASE = `http://127.0.0.1:${PORT}/api/v1`

/** Local-only credentials for this process. Never leave it, never touch the real ones. */
const SHARED_SECRET = 'local-acceptance-check'
const TOKEN_SECRET = 'local-acceptance-token-secret'

const PREFIX = 'zz-check-preferences'
const STAMP = Date.now()

/** Taylors Falls — a known crag, so its rock type is settled. */
const CRAG = { lat: '45.3955', lon: '-92.6616' }

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
  token: string,
  body?: unknown,
): Promise<{ status: number; payload: ApiResponse<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Session ${token}`,
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

const close = (a: number | null | undefined, b: number): boolean => a !== null && a !== undefined && Math.abs(a - b) < 1e-6

async function run(): Promise<void> {
  if (!process.env['DATABASE_URL']) {
    console.error(
      '\nMissing DATABASE_URL — the Neon pooled connection string.' +
        '\nNeon dashboard > project > Connect. Vercel will not reveal its copy.\n',
    )
    process.exit(2)
  }

  process.env['API_SHARED_SECRET'] = SHARED_SECRET
  process.env['AUTH_TOKEN_SECRET'] = TOKEN_SECRET
  process.env['LOG_LEVEL'] ??= 'warn'

  const { createApp } = await import('../index.js')
  const { db, pool } = await import('../db/index.js')
  const { users, locations, userPreferences } = await import('../db/schema.js')
  const { hashPassword } = await import('../lib/auth/password.js')
  const { signToken, expiryFrom } = await import('../lib/auth/token.js')
  const { inArray } = await import('drizzle-orm')

  const app = createApp()
  const server = app.listen(PORT)
  await new Promise<void>((resolve) => server.once('listening', resolve))

  const createdUserIds: string[] = []
  const createdLocationIds: string[] = []

  try {
    for (const who of ['a', 'b']) {
      const inserted = await db
        .insert(users)
        .values({
          username: `${PREFIX}-${who}-${STAMP}`,
          password_hash: await hashPassword(`correct-horse-battery-${who}`),
          name: `ZZ preferences check ${who}`,
        })
        .returning({ id: users.id })
      const id = inserted[0]?.id
      if (id === undefined) throw new Error(`could not create user ${who}`)
      createdUserIds.push(id)
    }
    const [idA, idB] = createdUserIds
    if (idA === undefined || idB === undefined) throw new Error('setup did not produce two users')
    const tokenA = signToken({ sub: idA, exp: expiryFrom() }, TOKEN_SECRET)
    const tokenB = signToken({ sub: idB, exp: expiryFrom() }, TOKEN_SECRET)

    console.log('\nA new account')
    const fresh = await call<Preferences>('GET', '/preferences', tokenA)
    check(
      'reads every setting as the default, with no row stored',
      fresh.status === 200 &&
        fresh.payload.data?.temp_low_c === null &&
        fresh.payload.data.temp_high_c === null &&
        fresh.payload.data.default_tab === null,
      `${fresh.status} ${JSON.stringify(fresh.payload.data)}`,
    )

    console.log('\nSaving, then saving again')
    const first = await call<Preferences>('PUT', '/preferences', tokenA, {
      temp_low_c: fToC(15),
      temp_high_c: fToC(75),
      default_tab: 'hourly',
    })
    check(
      'the first save inserts the row and returns it',
      first.status === 200 &&
        close(first.payload.data?.temp_low_c, fToC(15)) &&
        close(first.payload.data?.temp_high_c, fToC(75)) &&
        first.payload.data?.default_tab === 'hourly',
      `${first.status} ${JSON.stringify(first.payload)}`,
    )
    const second = await call<Preferences>('PUT', '/preferences', tokenA, { temp_high_c: null })
    check(
      'a later save updates only what it names, and null clears an end',
      second.status === 200 &&
        second.payload.data?.temp_high_c === null &&
        close(second.payload.data.temp_low_c, fToC(15)) &&
        second.payload.data.default_tab === 'hourly',
      JSON.stringify(second.payload.data),
    )
    const rows = await db.select().from(userPreferences).where(inArray(userPreferences.user_id, [idA]))
    check('one row for the account, however many saves', rows.length === 1, `got ${rows.length}`)

    console.log('\nRefusals')
    // Both ends inside their limits, 5 °F apart.
    const narrow = await call<Preferences>('PUT', '/preferences', tokenA, { temp_low_c: fToC(45), temp_high_c: fToC(50) })
    check('a range under 10 °F wide is a 409', narrow.status === 409, `got ${narrow.status}`)
    const after = await call<Preferences>('GET', '/preferences', tokenA)
    check(
      'and wrote nothing',
      after.payload.data?.temp_high_c === null && close(after.payload.data.temp_low_c, fToC(15)),
      JSON.stringify(after.payload.data),
    )
    const outOfBounds = await call<Preferences>('PUT', '/preferences', tokenA, { temp_high_c: fToC(20) })
    check('an end outside its limits is a 400', outOfBounds.status === 400, `got ${outOfBounds.status}`)
    const unknown = await call<Preferences>('PUT', '/preferences', tokenA, { ideal_temp_min_c: 10 })
    check('an unknown field is a 400', unknown.status === 400, `got ${unknown.status}`)

    console.log('\nAccounts are separate')
    const other = await call<Preferences>('GET', '/preferences', tokenB)
    check(
      "another account does not see the first one's settings",
      other.payload.data?.temp_low_c === null && other.payload.data.default_tab === null,
      JSON.stringify(other.payload.data),
    )

    console.log('\nThe readings read the settings')
    const loc = await db
      .insert(locations)
      .values({ user_id: idA, name: `ZZ preferences check ${STAMP}`, ...CRAG, is_climbing_location: true })
      .returning({ id: locations.id })
    const locationId = loc[0]?.id
    if (locationId === undefined) throw new Error('could not create the location')
    createdLocationIds.push(locationId)
    const hourly = await call<HourlySeries>('GET', `/hourly/${locationId}`, tokenA)
    check(
      '/hourly answers for a crag whose owner has saved a range',
      hourly.status === 200 && hourly.payload.data?.readings !== undefined,
      `${hourly.status} ${String(hourly.payload.error)}`,
    )
  } catch (err) {
    failed++
    console.log(`\n  ERROR  ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    let cleaned = true
    try {
      if (createdLocationIds.length > 0) {
        await db.delete(locations).where(inArray(locations.id, createdLocationIds))
      }
      if (createdUserIds.length > 0) {
        await db.delete(userPreferences).where(inArray(userPreferences.user_id, createdUserIds))
        await db.delete(users).where(inArray(users.id, createdUserIds))
      }
    } catch (err) {
      cleaned = false
      console.log(`\n  CLEANUP FAILED — ${err instanceof Error ? err.message : String(err)}`)
    }
    console.log(
      cleaned
        ? '\n  cleaned up the test users, their settings and their location'
        : `\n  COULD NOT CLEAN UP — remove the users named "${PREFIX}-*", their user_preferences rows and location by hand`,
    )
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
