/**
 * Acceptance check for the owner's thermometer: `sensor_readings` and
 * `GET /api/v1/sensors` (owner, 2026-11-25).
 *
 * Usage, from `apps/api`:
 *   $env:DATABASE_URL = "<Neon pooled connection string>"
 *   npm run check:sensors
 *
 * Why a script: the migration, the per-minute key and the newest-per-device
 * query only meet against Postgres. Checks that a repeated row at the same
 * minute is a no-op, that the route returns each device's newest reading with
 * its gaps as null, that only the owner may read it, and that it is behind the
 * sign-in gate. No Govee call (the fetch and the offline rule are unit tests),
 * so CI runs it with the database checks. Creates two throwaway users and rows
 * under an obvious device prefix, all removed in `finally`.
 *
 * console rather than the logger is deliberate — the output is the result.
 */

import type { ApiResponse, Account, SensorReading } from '@weatherteam6/types'

const PORT = 3093
const BASE = `http://127.0.0.1:${PORT}/api/v1`

/** Local-only credentials for this process. Never leave it, never touch the real ones. */
const SHARED_SECRET = 'local-acceptance-check'
const TOKEN_SECRET = 'local-acceptance-token-secret'

const PREFIX = 'zz-check-sensors'
const STAMP = Date.now()
const DEVICE_A = `${PREFIX}-${STAMP}-a`
const DEVICE_B = `${PREFIX}-${STAMP}-b`

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

async function get<T>(path: string, token: string | null): Promise<{ status: number; payload: ApiResponse<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    headers: token === null ? {} : { Authorization: `Session ${token}` },
  })
  const payload = (await res.json().catch(() => ({ data: null, error: 'response was not JSON', status: res.status }))) as ApiResponse<T>
  return { status: res.status, payload }
}

async function run(): Promise<void> {
  if (!process.env['DATABASE_URL']) {
    console.error('\nMissing DATABASE_URL — the Neon pooled connection string.\n')
    process.exit(2)
  }

  process.env['API_SHARED_SECRET'] = SHARED_SECRET
  process.env['AUTH_TOKEN_SECRET'] = TOKEN_SECRET
  process.env['LOG_LEVEL'] ??= 'warn'

  const { createApp } = await import('../index.js')
  const { db, pool } = await import('../db/index.js')
  const { users, sensorReadings } = await import('../db/schema.js')
  const { hashPassword } = await import('../lib/auth/password.js')
  const { signToken, expiryFrom } = await import('../lib/auth/token.js')
  const { eq, inArray } = await import('drizzle-orm')

  const app = createApp()
  const server = app.listen(PORT)
  await new Promise<void>((resolve) => server.once('listening', resolve))

  const userIds: string[] = []
  const realOwner = process.env['DEFAULT_USER_ID']

  try {
    const hash = await hashPassword('correct-horse-battery-sensors')
    const inserted = await db
      .insert(users)
      .values([
        { username: `${PREFIX}-${STAMP}-owner`, password_hash: hash, name: 'ZZ sensors owner' },
        { username: `${PREFIX}-${STAMP}-friend`, password_hash: hash, name: 'ZZ sensors friend' },
      ])
      .returning({ id: users.id })
    for (const row of inserted) userIds.push(row.id)
    const [ownerId, friendId] = userIds
    if (ownerId === undefined || friendId === undefined) throw new Error('could not create the test users')
    // `isOwner` reads DEFAULT_USER_ID per call; naming the test user the owner in
    // this process only reaches the owner's path without the real owner.
    process.env['DEFAULT_USER_ID'] = ownerId
    const ownerToken = signToken({ sub: ownerId, exp: expiryFrom() }, TOKEN_SECRET)
    const friendToken = signToken({ sub: friendId, exp: expiryFrom() }, TOKEN_SECRET)

    console.log('\nStoring')
    const older = new Date('2026-11-25T10:00:00Z')
    const newer = new Date('2026-11-25T10:10:00Z')
    await db.insert(sensorReadings).values([
      { device: DEVICE_A, sku: 'H5171', device_name: 'ZZ A', recorded_at: older, temp_c: 0, humidity_pct: 40 },
      { device: DEVICE_A, sku: 'H5171', device_name: 'ZZ A', recorded_at: newer, temp_c: 21.5, humidity_pct: null },
      { device: DEVICE_B, sku: 'H5171', device_name: null, recorded_at: older, temp_c: null, humidity_pct: 55 },
    ])
    const again = await db
      .insert(sensorReadings)
      .values({ device: DEVICE_A, sku: 'H5171', device_name: 'ZZ A', recorded_at: newer, temp_c: 99, humidity_pct: 99 })
      .onConflictDoNothing()
      .returning({ device: sensorReadings.device })
    check('a second row for the same device and minute is a no-op', again.length === 0, JSON.stringify(again))
    const stored = await db.select().from(sensorReadings).where(inArray(sensorReadings.device, [DEVICE_A, DEVICE_B]))
    check('and the first one stands', stored.length === 3 && !stored.some((r) => r.temp_c === 99), JSON.stringify(stored))

    console.log('\nReading back')
    const mine = await get<SensorReading[]>('/sensors', ownerToken)
    const ours = (mine.payload.data ?? []).filter((r) => r.device === DEVICE_A || r.device === DEVICE_B)
    const a = ours.find((r) => r.device === DEVICE_A)
    const b = ours.find((r) => r.device === DEVICE_B)
    check('the owner gets a 200 in the envelope', mine.status === 200 && mine.payload.error === null, JSON.stringify(mine))
    check('one row per device', ours.length === 2, JSON.stringify(ours))
    check(
      "device A is its newest reading, with its missing humidity null",
      a?.recorded_at === newer.toISOString() && a.temp_c === 21.5 && a.humidity_pct === null,
      JSON.stringify(a),
    )
    check(
      'device B keeps its null temperature and null name, never 0 or ""',
      b?.temp_c === null && b.humidity_pct === 55 && b.device_name === null,
      JSON.stringify(b),
    )
    check('newest device first', ours[0]?.device === DEVICE_A, JSON.stringify(ours.map((r) => r.device)))

    console.log('\nWho may read it')
    const meOwner = await get<Account>('/me', ownerToken)
    const meFriend = await get<Account>('/me', friendToken)
    check('GET /me says the owner can read the thermometer', meOwner.payload.data?.can_read_sensors === true, JSON.stringify(meOwner))
    check('GET /me says anyone else cannot', meFriend.payload.data?.can_read_sensors === false, JSON.stringify(meFriend))
    const friend = await get<SensorReading[]>('/sensors', friendToken)
    check('another account is a 403 with no readings', friend.status === 403 && friend.payload.data === null, JSON.stringify(friend))
    const anon = await get<SensorReading[]>('/sensors', null)
    check('without a session it is a 401', anon.status === 401, `got ${anon.status}`)
  } catch (err) {
    failed++
    console.log(`\n  ERROR  ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    if (realOwner === undefined) delete process.env['DEFAULT_USER_ID']
    else process.env['DEFAULT_USER_ID'] = realOwner
    let cleaned = true
    try {
      await db.delete(sensorReadings).where(inArray(sensorReadings.device, [DEVICE_A, DEVICE_B]))
      for (const id of userIds) await db.delete(users).where(eq(users.id, id))
    } catch (err) {
      cleaned = false
      console.log(`\n  CLEANUP FAILED — ${err instanceof Error ? err.message : String(err)}`)
    }
    console.log(
      cleaned
        ? '\n  cleaned up the test users and their sensor rows'
        : `\n  COULD NOT CLEAN UP — remove the users named "${PREFIX}-*" and sensor_readings rows for devices ${DEVICE_A}, ${DEVICE_B} by hand`,
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
