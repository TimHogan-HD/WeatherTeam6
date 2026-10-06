/**
 * Acceptance check for owner-minted invite links against real Postgres.
 *
 * Usage, from `apps/api`:
 *   $env:DATABASE_URL = "<Neon pooled connection string>"
 *   npm run check:invites
 *
 * Vitest never opens a database, and every property here lives in one: the
 * claim is a conditional update, the username clash rolls the claim back, and
 * only the owner may mint. It creates a throwaway owner and a throwaway
 * non-owner under an obvious prefix and removes them, their invites and any
 * redeemed accounts in a `finally`.
 */

import type { Account, ApiResponse, AuthLoginResponse, InviteCreated, Location } from '@weatherteam6/types'

const PORT = 3097
const BASE = `http://127.0.0.1:${PORT}/api/v1`
const SHARED_SECRET = 'local-acceptance-check'
const TOKEN_SECRET = 'local-acceptance-token-secret'
// Every name fits USERNAME_PATTERN's 32 characters, so a refusal is never the pattern's by accident.
const OWNER_NAME = `zz-inv-${Date.now()}-owner`
const OTHER_NAME = OWNER_NAME.replace('-owner', '-other')
const PASSPHRASE = 'correct-horse-battery-staple'

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

  process.env['API_SHARED_SECRET'] = SHARED_SECRET
  process.env['AUTH_TOKEN_SECRET'] = TOKEN_SECRET
  process.env['LOG_LEVEL'] ??= 'warn'

  const { createApp } = await import('../index.js')
  const { db, pool } = await import('../db/index.js')
  const { users, invites } = await import('../db/schema.js')
  const { signToken, expiryFrom } = await import('../lib/auth/token.js')
  const { eq, inArray, or } = await import('drizzle-orm')

  const ownerRow = await db
    .insert(users)
    .values({ username: OWNER_NAME, name: 'ZZ invites owner' })
    .returning({ id: users.id })
  const otherRow = await db
    .insert(users)
    .values({ username: OTHER_NAME, name: 'ZZ invites other' })
    .returning({ id: users.id })
  const ownerId = ownerRow[0]?.id
  const otherId = otherRow[0]?.id
  if (ownerId === undefined || otherId === undefined) throw new Error('could not create the test users')

  // This process's owner is the throwaway row, never the real DEFAULT_USER_ID.
  process.env['DEFAULT_USER_ID'] = ownerId

  const app = createApp()
  const server = app.listen(PORT)
  await new Promise<void>((resolve) => server.once('listening', resolve))

  const owner = `Session ${signToken({ sub: ownerId, exp: expiryFrom() }, TOKEN_SECRET)}`
  const other = `Session ${signToken({ sub: otherId, exp: expiryFrom() }, TOKEN_SECRET)}`
  const friendName = OWNER_NAME.replace('-owner', '-f')
  const allNames = [
    OWNER_NAME,
    OTHER_NAME,
    friendName,
    `${friendName}-2`,
    `${friendName}-3`,
  ]

  try {
    console.log('\n1. Only the owner can invite')
    const meOwner = await call<Account>('GET', '/me', { auth: owner })
    check('GET /me says the owner can invite', meOwner.payload.data?.can_invite === true, JSON.stringify(meOwner.payload))
    const meOther = await call<Account>('GET', '/me', { auth: other })
    check('GET /me says anyone else cannot', meOther.payload.data?.can_invite === false, JSON.stringify(meOther.payload))
    check("and names the caller's own username", meOther.payload.data?.username === OTHER_NAME)

    const refused = await call<InviteCreated>('POST', '/invites', { auth: other, body: {} })
    check('POST /invites by a non-owner is 403', refused.status === 403, `got ${refused.status}`)
    const unauth = await call<InviteCreated>('POST', '/invites', { body: {} })
    check('POST /invites with no token is 401', unauth.status === 401, `got ${unauth.status}`)
    const otherInvites = await db.select({ id: invites.id }).from(invites).where(eq(invites.created_by, otherId))
    check('and the refusal wrote nothing', otherInvites.length === 0)

    const minted = await call<InviteCreated>('POST', '/invites', { auth: owner, body: {} })
    check('POST /invites by the owner is 201', minted.status === 201, `got ${minted.status}`)
    const code = minted.payload.data?.code
    if (code === undefined) throw new Error('no invite code — stopping')
    const days = (Date.parse(minted.payload.data?.expires_at ?? '') - Date.now()) / 86_400_000
    check('it expires in about 7 days', days > 6.9 && days < 7.1, `got ${days}`)
    const stored = await db.select().from(invites).where(eq(invites.created_by, ownerId))
    check('the table holds a hash, not the code', stored.length === 1 && stored[0]?.code_hash !== code)

    console.log('\n2. Refusals that leave the invite usable')
    const shortPass = await call<AuthLoginResponse>('POST', '/auth/redeem', {
      body: { code, username: friendName, passphrase: 'short' },
    })
    check('a short passphrase is 400', shortPass.status === 400, `got ${shortPass.status}`)
    const badName = await call<AuthLoginResponse>('POST', '/auth/redeem', {
      body: { code, username: 'Has Spaces', passphrase: PASSPHRASE },
    })
    check('a username outside the pattern is 400', badName.status === 400, `got ${badName.status}`)
    const taken = await call<AuthLoginResponse>('POST', '/auth/redeem', {
      body: { code, username: OTHER_NAME, passphrase: PASSPHRASE },
    })
    check('a taken username is 409', taken.status === 409, `got ${taken.status}`)
    const afterTaken = await db.select().from(invites).where(eq(invites.created_by, ownerId))
    check('and the invite is still unused', afterTaken[0]?.used_at === null && afterTaken[0]?.used_by === null)

    const wrongCode = await call<AuthLoginResponse>('POST', '/auth/redeem', {
      body: { code: `${code}x`, username: friendName, passphrase: PASSPHRASE },
    })
    check('an unknown code is 410', wrongCode.status === 410, `got ${wrongCode.status}`)

    console.log('\n3. Redeeming creates the account and signs it in')
    const redeemed = await call<AuthLoginResponse>('POST', '/auth/redeem', {
      body: { code, username: friendName, passphrase: PASSPHRASE },
    })
    check('POST /auth/redeem is 200', redeemed.status === 200, `got ${redeemed.status} ${JSON.stringify(redeemed.payload)}`)
    const token = redeemed.payload.data?.token
    if (token === undefined) throw new Error('no token issued — stopping')
    const list = await call<Location[]>('GET', '/locations', { auth: `Session ${token}` })
    check('the new token opens the app, with an empty list', list.status === 200 && list.payload.data?.length === 0)
    const login = await call<AuthLoginResponse>('POST', '/auth/login', {
      body: { username: friendName, passphrase: PASSPHRASE },
    })
    check('the friend can sign in with what they chose', login.status === 200, `got ${login.status}`)
    const friendRow = await db.select({ id: users.id }).from(users).where(eq(users.username, friendName))
    const used = await db.select().from(invites).where(eq(invites.created_by, ownerId))
    check(
      'the invite records when and by whom it was used',
      used[0]?.used_at !== null && used[0]?.used_by === friendRow[0]?.id,
    )

    console.log('\n4. A used or expired invite cannot be redeemed')
    const again = await call<AuthLoginResponse>('POST', '/auth/redeem', {
      body: { code, username: `${friendName}-2`, passphrase: PASSPHRASE },
    })
    check('a second redemption is 410', again.status === 410, `got ${again.status}`)

    const minted2 = await call<InviteCreated>('POST', '/invites', { auth: owner, body: {} })
    const code2 = minted2.payload.data?.code
    if (code2 === undefined) throw new Error('no second invite — stopping')
    await db
      .update(invites)
      .set({ expires_at: new Date(Date.now() - 60_000) })
      .where(eq(invites.created_by, ownerId))
    const expired = await call<AuthLoginResponse>('POST', '/auth/redeem', {
      body: { code: code2, username: `${friendName}-3`, passphrase: PASSPHRASE },
    })
    check('an expired invite is 410', expired.status === 410, `got ${expired.status}`)
    const strays = await db
      .select({ id: users.id })
      .from(users)
      .where(or(eq(users.username, `${friendName}-2`), eq(users.username, `${friendName}-3`)))
    check('and neither refusal created an account', strays.length === 0)
  } catch (err) {
    failed++
    console.log(`\n  ERROR  ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    let cleaned = true
    try {
      const mine = await db.select({ id: users.id }).from(users).where(inArray(users.username, allNames))
      const ids = mine.map((u) => u.id)
      if (ids.length > 0) {
        await db.delete(invites).where(or(inArray(invites.created_by, ids), inArray(invites.used_by, ids)))
        await db.delete(users).where(inArray(users.id, ids))
      }
    } catch (err) {
      cleaned = false
      console.log(`\n  CLEANUP FAILED — ${err instanceof Error ? err.message : String(err)}`)
    }
    console.log(
      cleaned
        ? '\n  cleaned up the test users and invites'
        : `\n  COULD NOT CLEAN UP — remove users ${allNames.join(', ')} and their invites by hand`,
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
