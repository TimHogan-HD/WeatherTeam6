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
  const { users, locations, trips, tripLocations, walls, feedback, loginAttempts } = await import('../db/schema.js')
  const { LOGIN_ATTEMPT_LIMIT, keyFor } = await import('../lib/auth/loginThrottle.js')
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
  const throttleKeys = ['a', 'b', 'nobody', 'ghost', 'burst'].map((s) => keyFor(`${PREFIX}-${s}-${STAMP}`))

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

    const crossGuide = await call<null>('GET', `/guidebook/${locB}`, { auth: `Session ${token}` })
    check(
      "GET /guidebook/:id on B's location is 404 for A",
      crossGuide.status === 404,
      `got ${crossGuide.status}`,
    )
    const ownGuide = await call<null>('GET', `/guidebook/${locA}`, { auth: `Session ${token}` })
    check('GET /guidebook/:id on A\'s own location is 200', ownGuide.status === 200, `got ${ownGuide.status}`)

    const stillThere = await db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.id, locB))
      .limit(1)
    check("B's location is still in the database", stillThere.length === 1)

    // Routes that take a location id in the body or read a table keyed by
    // location alone. Each of these once skipped the ownership check.
    const crossTrip = await call<null>('POST', '/trips', {
      auth: `Session ${token}`,
      body: { name: 'ZZ auth check trip', startDate: '2026-10-01', endDate: '2026-10-03', cragIds: [locB] },
    })
    check(
      "POST /trips naming B's location is 404 for A",
      crossTrip.status === 404,
      `got ${crossTrip.status}`,
    )

    const crossWall = await call<null>('POST', '/walls', {
      auth: `Session ${token}`,
      body: {
        locationId: locB,
        name: 'ZZ auth check wall',
        aspectDeg: 180,
        aspectSource: 'manual',
        angleDeg: 90,
        angleBand: 'vertical',
      },
    })
    check(
      "POST /walls on B's location is 404 for A",
      crossWall.status === 404,
      `got ${crossWall.status}`,
    )

    const crossHistory = await call<null>('GET', `/locations/${locB}/history`, {
      auth: `Session ${token}`,
    })
    check(
      "GET /locations/:id/history on B's location is 404 for A",
      crossHistory.status === 404,
      `got ${crossHistory.status}`,
    )

    const feedbackB = await db
      .insert(feedback)
      .values({ user_id: idB, kind: 'app', message: `${PREFIX} feedback` })
      .returning({ id: feedback.id })
    const fbB = feedbackB[0]?.id ?? ''
    const crossResolve = await call<null>('POST', `/feedback/${fbB}/resolve`, { auth: `Session ${token}` })
    check("POST /feedback/:id/resolve on B's feedback is 404 for A", crossResolve.status === 404, `got ${crossResolve.status}`)
    const fbRow = await db.select({ resolved_at: feedback.resolved_at }).from(feedback).where(eq(feedback.id, fbB))
    check("and B's feedback is still open", fbRow.length === 1 && fbRow[0]?.resolved_at === null)

    const strayTrips = await db.select({ id: trips.id }).from(trips).where(eq(trips.user_id, idA))
    const strayWalls = await db.select({ id: walls.id }).from(walls).where(eq(walls.location_id, locB))
    check('and none of them wrote a row', strayTrips.length === 0 && strayWalls.length === 0)

    console.log('\n3b. Sign-in attempts are capped per username')
    const tryLogin = (username: string, passphrase: string) =>
      call<AuthLoginResponse>('POST', '/auth/login', { body: { username, passphrase } })
    // Section 2's wrong passphrase for A counts; start every username here from nothing.
    await db.delete(loginAttempts).where(inArray(loginAttempts.key_hash, throttleKeys))

    for (let i = 0; i < LOGIN_ATTEMPT_LIMIT - 1; i++) await tryLogin(userB.username, 'wrong-passphrase-here')
    const lastTry = await tryLogin(userB.username, userB.passphrase)
    check(`the right passphrase on attempt ${LOGIN_ATTEMPT_LIMIT} still signs in`, lastTry.status === 200, `got ${lastTry.status}`)
    const afterSuccess = await db.select({ id: loginAttempts.id }).from(loginAttempts).where(eq(loginAttempts.key_hash, keyFor(userB.username)))
    check('and a successful sign-in clears the count', afterSuccess.length === 0, `${afterSuccess.length} rows left`)

    for (let i = 0; i < LOGIN_ATTEMPT_LIMIT; i++) await tryLogin(userB.username, 'wrong-passphrase-here')
    const capped = await tryLogin(userB.username, userB.passphrase)
    check(`attempt ${LOGIN_ATTEMPT_LIMIT + 1} is 429 even with the right passphrase`, capped.status === 429, `got ${capped.status}`)
    const otherUser = await tryLogin(userA.username, userA.passphrase)
    check('another username is unaffected', otherUser.status === 200, `got ${otherUser.status}`)

    const ghost = `${PREFIX}-ghost-${STAMP}`
    for (let i = 0; i < LOGIN_ATTEMPT_LIMIT; i++) await tryLogin(ghost, 'wrong-passphrase-here')
    const ghostCapped = await tryLogin(ghost, 'wrong-passphrase-here')
    check('an unknown username is capped the same way, so the cap reveals nothing', ghostCapped.status === 429, `got ${ghostCapped.status}`)

    const stored = await db.select({ key: loginAttempts.key_hash }).from(loginAttempts)
    check(
      'the table holds hashes, never a username',
      stored.every((r) => r.key !== userB.username && r.key !== ghost && /^[0-9a-f]{64}$/.test(r.key)),
    )

    const burstName = `${PREFIX}-burst-${STAMP}`
    const burst = await Promise.all(Array.from({ length: 25 }, () => tryLogin(burstName, 'wrong-passphrase-here')))
    const checked = burst.filter((r) => r.status === 401).length
    check(
      `25 attempts fired at once check at most ${LOGIN_ATTEMPT_LIMIT} passphrases`,
      checked <= LOGIN_ATTEMPT_LIMIT && burst.every((r) => r.status === 401 || r.status === 429),
      `${checked} checked; statuses ${[...new Set(burst.map((r) => r.status))].join(', ')}`,
    )
    const rowsFor = async (name: string) =>
      (await db.select({ id: loginAttempts.id }).from(loginAttempts).where(eq(loginAttempts.key_hash, keyFor(name)))).length
    const atCap = await rowsFor(ghost)
    for (let i = 0; i < 3; i++) await tryLogin(ghost, 'wrong-passphrase-here')
    check('refused attempts on a capped username add no rows', (await rowsFor(ghost)) === atCap, `${atCap} → ${await rowsFor(ghost)}`)

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
      // Only non-empty if a cross-user write above got through; a trip or wall
      // left behind would block the location and user deletes below.
      if (createdUserIds.length > 0) {
        const ownTrips = await db
          .select({ id: trips.id })
          .from(trips)
          .where(inArray(trips.user_id, createdUserIds))
        const tripIds = ownTrips.map((t) => t.id)
        if (tripIds.length > 0) {
          await db.delete(tripLocations).where(inArray(tripLocations.trip_id, tripIds))
          await db.delete(trips).where(inArray(trips.id, tripIds))
        }
      }
      if (createdLocationIds.length > 0) {
        await db.delete(walls).where(inArray(walls.location_id, createdLocationIds))
      }
      if (createdLocationIds.length > 0) {
        await db.delete(locations).where(inArray(locations.id, createdLocationIds))
      }
      if (createdUserIds.length > 0) {
        await db.delete(feedback).where(inArray(feedback.user_id, createdUserIds))
        await db.delete(users).where(inArray(users.id, createdUserIds))
      }
      await db.delete(loginAttempts).where(inArray(loginAttempts.key_hash, throttleKeys))
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
