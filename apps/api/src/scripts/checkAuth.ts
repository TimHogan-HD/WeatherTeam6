/**
 * Acceptance check for token auth (`docs/handoffs/leave-telegram-v1.md` Phase 1).
 *
 * Usage, from `apps/api`:
 *   $env:DATABASE_URL = "<Neon pooled connection string>"
 *   npm run check:auth
 *
 * Why this exists as a script rather than a test: the vitest suite mocks `fetch`
 * and never opens a database connection, so the one property that matters most
 * here is invisible to it — **a token for user A must not read user B's
 * locations.** That is the whole point of the schema change and it cannot be
 * asserted without two real rows and a real query.
 *
 * It creates two users and one location each, all under an obvious prefix, and
 * removes them in a `finally` block even when a step fails partway through. It
 * says so loudly if cleanup did not work.
 *
 * This is a **workspace-level** check: `ci.yml` deliberately runs only
 * root-level `check:*` scripts, because these need a real DATABASE_URL. Run it
 * by hand; it is not a merge gate.
 *
 * console rather than the logger is deliberate — this is an operator-facing CLI
 * and its output is the result.
 */

import type { ApiResponse, AuthLoginResponse, Location } from '@weatherteam6/types'

// Runtime imports are deferred into run(): `../db/index.js` throws at import
// time when DATABASE_URL is unset, which would pre-empt the explanation below
// with a stack trace. Types are erased at compile time, so they stay static.

const PORT = 3098
const BASE = `http://127.0.0.1:${PORT}/api/v1`

/** Local-only credentials for this process. Never leave it, never touch the real ones. */
const SHARED_SECRET = 'local-acceptance-check'
const TOKEN_SECRET = 'local-acceptance-token-secret'

const PREFIX = 'zz-check-auth'
const STAMP = Date.now()

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
  options: { auth?: string; body?: unknown } = {},
): Promise<{ status: number; payload: ApiResponse<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(options.auth === undefined ? {} : { Authorization: options.auth }),
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  })
  // The API guarantees this envelope on every route, error paths included.
  const payload = (await res.json().catch(() => ({
    data: null,
    error: 'response was not JSON',
    status: res.status,
  }))) as ApiResponse<T>
  return { status: res.status, payload }
}

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
  const { users, locations } = await import('../db/schema.js')
  const { hashPassword } = await import('../lib/auth/password.js')
  const { signToken, expiryFrom } = await import('../lib/auth/token.js')
  const { eq, inArray } = await import('drizzle-orm')

  // Bearer resolves to DEFAULT_USER_ID. Any real user will do; the seeded one
  // is read from the table when the variable is not already set.
  if (!process.env['DEFAULT_USER_ID']) {
    const seeded = await db.select({ id: users.id }).from(users).limit(1)
    const id = seeded[0]?.id
    if (id === undefined) {
      console.error('\nNo users in the database and no DEFAULT_USER_ID set.\n')
      await pool.end()
      process.exit(2)
    }
    process.env['DEFAULT_USER_ID'] = id
    console.log(`\nUsing the seeded user ${id} for the Bearer scheme`)
  }

  const app = createApp()
  const server = app.listen(PORT)
  await new Promise<void>((resolve) => server.once('listening', resolve))

  const createdUserIds: string[] = []
  const createdLocationIds: string[] = []

  const userA = { username: `${PREFIX}-a-${STAMP}`, passphrase: 'correct-horse-battery-a' }
  const userB = { username: `${PREFIX}-b-${STAMP}`, passphrase: 'correct-horse-battery-b' }

  try {
    console.log('\nCreating two users and one location each')
    for (const u of [userA, userB]) {
      const inserted = await db
        .insert(users)
        .values({
          username: u.username,
          password_hash: await hashPassword(u.passphrase),
          name: `ZZ auth check ${u.username}`,
        })
        .returning({ id: users.id })
      const id = inserted[0]?.id
      if (id === undefined) throw new Error(`could not create ${u.username}`)
      createdUserIds.push(id)

      const loc = await db
        .insert(locations)
        .values({
          user_id: id,
          name: `ZZ auth check crag for ${u.username}`,
          lat: '36.15192',
          lon: '-115.45413',
        })
        .returning({ id: locations.id })
      const locId = loc[0]?.id
      if (locId === undefined) throw new Error(`could not create a location for ${u.username}`)
      createdLocationIds.push(locId)
    }
    const [idA, idB] = createdUserIds
    const [locA, locB] = createdLocationIds
    if (idA === undefined || idB === undefined || locA === undefined || locB === undefined) {
      throw new Error('setup did not produce two users and two locations')
    }
    console.log(`  user A ${idA}\n  user B ${idB}`)

    console.log('\n1. A valid passphrase issues a token, and the token opens a gated route')
    const login = await call<AuthLoginResponse>('POST', '/auth/login', {
      body: { username: userA.username, passphrase: userA.passphrase },
    })
    check('POST /auth/login returns 200', login.status === 200, `got ${login.status}`)
    const token = login.payload.data?.token ?? null
    check('the response carries a token', token !== null)
    check(
      'expires_at is ~30 days out',
      (() => {
        const iso = login.payload.data?.expires_at
        if (iso === undefined) return false
        const days = (Date.parse(iso) - Date.now()) / 86_400_000
        return days > 29.5 && days < 30.5
      })(),
      `got ${String(login.payload.data?.expires_at)}`,
    )
    if (token === null) throw new Error('no token issued — stopping')

    const mine = await call<Location[]>('GET', '/locations', { auth: `Session ${token}` })
    check('GET /locations with the token returns 200', mine.status === 200, `got ${mine.status}`)
    const ids = (mine.payload.data ?? []).map((l) => l.id)
    check("it returns A's own location", ids.includes(locA), `got ${ids.length} rows`)

    console.log('\n2. A wrong passphrase does not, and neither does a tampered token')
    const wrongPass = await call<AuthLoginResponse>('POST', '/auth/login', {
      body: { username: userA.username, passphrase: `${userA.passphrase}x` },
    })
    check('a wrong passphrase is 401', wrongPass.status === 401, `got ${wrongPass.status}`)
    check(
      'the rejection does not say which half was wrong',
      !JSON.stringify(wrongPass.payload).toLowerCase().includes('passphrase is'),
    )

    const unknownUser = await call<AuthLoginResponse>('POST', '/auth/login', {
      body: { username: `${PREFIX}-nobody-${STAMP}`, passphrase: userA.passphrase },
    })
    check('an unknown username is 401', unknownUser.status === 401, `got ${unknownUser.status}`)

    const noBody = await call<AuthLoginResponse>('POST', '/auth/login', { body: {} })
    check('a missing body is 400, not 500', noBody.status === 400, `got ${noBody.status}`)

    // Flip one character of the payload segment. The signature covers it, so
    // this is the "I know a user id" attack and it must not open anything.
    const [payloadSeg, sigSeg] = token.split('.')
    const tampered = `${String(payloadSeg).slice(0, -1)}A.${String(sigSeg)}`
    const withTampered = await call<Location[]>('GET', '/locations', {
      auth: `Session ${tampered}`,
    })
    check('a tampered token is 401', withTampered.status === 401, `got ${withTampered.status}`)

    const expired = signToken({ sub: idA, exp: Math.floor(Date.now() / 1000) - 60 }, TOKEN_SECRET)
    const withExpired = await call<Location[]>('GET', '/locations', { auth: `Session ${expired}` })
    check('an expired token is 401', withExpired.status === 401, `got ${withExpired.status}`)

    const foreign = signToken({ sub: idA, exp: expiryFrom() }, 'a-different-signing-key')
    const withForeign = await call<Location[]>('GET', '/locations', { auth: `Session ${foreign}` })
    check(
      'a token signed with another key is 401',
      withForeign.status === 401,
      `got ${withForeign.status}`,
    )

    const noAuth = await call<Location[]>('GET', '/locations')
    check('no Authorization header is 401', noAuth.status === 401, `got ${noAuth.status}`)

    console.log("\n3. A token for user A cannot read user B's locations")
    check("A's list does not contain B's location", !ids.includes(locB), `got ${ids.join(', ')}`)

    const crossRead = await call<Location>('GET', `/locations/${locB}`, {
      auth: `Session ${token}`,
    })
    check(
      "GET /locations/:id on B's location is 404 for A",
      crossRead.status === 404,
      `got ${crossRead.status}`,
    )

    const crossDelete = await call<null>('DELETE', `/locations/${locB}`, {
      auth: `Session ${token}`,
    })
    check(
      "DELETE on B's location is 404 for A",
      crossDelete.status === 404,
      `got ${crossDelete.status}`,
    )

    const stillThere = await db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.id, locB))
      .limit(1)
    check("B's location is still in the database", stillThere.length === 1)

    console.log('\n4. The other schemes and the mount order still behave')
    const bearer = await call<Location[]>('GET', '/locations', { auth: `Bearer ${SHARED_SECRET}` })
    check('Bearer still works', bearer.status === 200, `got ${bearer.status}`)

    const getLogin = await call<null>('GET', '/auth/login')
    check(
      'GET /auth/login falls through to the gate and 401s',
      getLogin.status === 401,
      `got ${getLogin.status}`,
    )

    const unmatchedAuthPath = await call<null>('GET', '/auth/whatever')
    check(
      'an unmatched path under /auth is 401, not 404',
      unmatchedAuthPath.status === 401,
      `got ${unmatchedAuthPath.status}`,
    )

    delete process.env['AUTH_TOKEN_SECRET']
    const closedGate = await call<Location[]>('GET', '/locations', {
      auth: `Bearer ${SHARED_SECRET}`,
    })
    check(
      'an unset AUTH_TOKEN_SECRET fails CLOSED with 503, for every scheme',
      closedGate.status === 503,
      `got ${closedGate.status}`,
    )
    const closedLogin = await call<AuthLoginResponse>('POST', '/auth/login', {
      body: { username: userA.username, passphrase: userA.passphrase },
    })
    check(
      'and the login route refuses to issue a token, 503',
      closedLogin.status === 503,
      `got ${closedLogin.status}`,
    )
    process.env['AUTH_TOKEN_SECRET'] = TOKEN_SECRET
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
        await db.delete(users).where(inArray(users.id, createdUserIds))
      }
    } catch (err) {
      cleaned = false
      console.log(`\n  CLEANUP FAILED — ${err instanceof Error ? err.message : String(err)}`)
    }
    console.log(
      cleaned
        ? '\n  cleaned up the test users and locations'
        : `\n  COULD NOT CLEAN UP — remove the users named "${PREFIX}-*" and their locations by hand`,
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
