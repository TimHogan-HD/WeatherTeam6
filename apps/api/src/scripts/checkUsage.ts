/**
 * Acceptance check for `POST /api/v1/usage` — the usage log
 * (`docs/usage-log.md`, which says how to remove it, this script included).
 *
 * Usage, from `apps/api`:
 *   $env:DATABASE_URL = "<Neon pooled connection string>"
 *   npm run check:usage
 *
 * Why a script: the migration and the insert only meet against Postgres.
 * Checks that an event is stored under its visit id and no account, that a
 * refused body writes nothing, and that the report reads it back. Creates one
 * throwaway user (the route is behind the sign-in gate) and its own random
 * visit ids, and removes all of them in `finally`. No upstream weather call,
 * so CI runs it with the database checks.
 *
 * console rather than the logger is deliberate — the output is the result.
 */

import { randomUUID } from 'node:crypto'
import type { ApiResponse } from '@weatherteam6/types'

const PORT = 3094
const BASE = `http://127.0.0.1:${PORT}/api/v1`

/** Local-only credentials for this process. Never leave it, never touch the real ones. */
const SHARED_SECRET = 'local-acceptance-check'
const TOKEN_SECRET = 'local-acceptance-token-secret'

const PREFIX = 'zz-check-usage'
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

async function post(token: string | null, body: unknown): Promise<{ status: number; payload: ApiResponse<null> }> {
  const res = await fetch(`${BASE}/usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token === null ? {} : { Authorization: `Session ${token}` }) },
    body: JSON.stringify(body),
  })
  const payload = (await res.json().catch(() => ({ data: null, error: 'response was not JSON', status: res.status }))) as ApiResponse<null>
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
  const { users, usageEvents } = await import('../db/schema.js')
  const { hashPassword } = await import('../lib/auth/password.js')
  const { signToken, expiryFrom } = await import('../lib/auth/token.js')
  const { summarizeUsage } = await import('../lib/usage/summarize.js')
  const { eq, inArray } = await import('drizzle-orm')

  const app = createApp()
  const server = app.listen(PORT)
  await new Promise<void>((resolve) => server.once('listening', resolve))

  let userId: string | null = null
  const visit = randomUUID()
  const otherVisit = randomUUID()

  try {
    const inserted = await db
      .insert(users)
      .values({ username: `${PREFIX}-${STAMP}`, password_hash: await hashPassword('correct-horse-battery-usage'), name: 'ZZ usage check' })
      .returning({ id: users.id })
    userId = inserted[0]?.id ?? null
    if (userId === null) throw new Error('could not create the test user')
    const token = signToken({ sub: userId, exp: expiryFrom() }, TOKEN_SECRET)
    const rowsFor = () => db.select().from(usageEvents).where(inArray(usageEvents.visit_id, [visit, otherVisit]))

    console.log('\nRecording')
    const home = await post(token, { visit, screen: '/', tab: null })
    const crag = await post(token, { visit, screen: '/location/:id', tab: 'precip' })
    check('a screen is a 201 in the envelope', home.status === 201 && home.payload.error === null, JSON.stringify(home))
    check('a crag tab is a 201', crag.status === 201, JSON.stringify(crag))
    const stored = await rowsFor()
    check(
      'both are stored under the visit, with the tab only where it was sent',
      stored.length === 2 &&
        stored.every((r) => r.visit_id === visit) &&
        stored.some((r) => r.screen === '/' && r.tab === null) &&
        stored.some((r) => r.screen === '/location/:id' && r.tab === 'precip'),
      JSON.stringify(stored),
    )
    check(
      'and no row carries the account',
      stored.every((r) => !Object.keys(r).some((k) => k.includes('user')) && !Object.values(r).includes(userId)),
      JSON.stringify(stored[0]),
    )

    console.log('\nRefusals')
    const withId = await post(token, { visit: otherVisit, screen: '/location/3f2a9c1e-0000-4000-8000-000000000001', tab: null })
    const badTab = await post(token, { visit: otherVisit, screen: '/location/:id', tab: 'radar' })
    const noVisit = await post(token, { screen: '/', tab: null })
    check('an address with an id in it is a 400', withId.status === 400, `got ${withId.status}`)
    check('a tab the crag screen does not have is a 400', badTab.status === 400, `got ${badTab.status}`)
    check('a missing visit id is a 400', noVisit.status === 400, `got ${noVisit.status}`)
    const anon = await post(null, { visit: otherVisit, screen: '/', tab: null })
    check('without a session it is a 401', anon.status === 401, `got ${anon.status}`)
    check('and none of them wrote a row', (await rowsFor()).length === 2)

    console.log('\nReading back')
    const summary = summarizeUsage(
      (await rowsFor()).map((r) => ({ visit_id: r.visit_id, screen: r.screen, tab: r.tab, at: r.created_at })),
    )
    check(
      'the report counts one visit and each screen once',
      summary.visits === 1 && summary.events === 2 && summary.screens.every((s) => s.count === 1),
      JSON.stringify(summary),
    )
  } catch (err) {
    failed++
    console.log(`\n  ERROR  ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    let cleaned = true
    try {
      await db.delete(usageEvents).where(inArray(usageEvents.visit_id, [visit, otherVisit]))
      if (userId !== null) await db.delete(users).where(eq(users.id, userId))
    } catch (err) {
      cleaned = false
      console.log(`\n  CLEANUP FAILED — ${err instanceof Error ? err.message : String(err)}`)
    }
    console.log(
      cleaned
        ? '\n  cleaned up the test user and its usage rows'
        : `\n  COULD NOT CLEAN UP — remove the user named "${PREFIX}-*" and usage_events rows for visits ${visit}, ${otherVisit} by hand`,
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
