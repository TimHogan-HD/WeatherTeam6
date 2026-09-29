/**
 * Acceptance check for the logbook (`/api/v1/logbook/*`) and recorded boulder
 * positions (`PUT /api/v1/guidebook/areas/:areaId/position`).
 *
 * Usage, from `apps/api`:
 *   $env:DATABASE_URL = "<Neon pooled connection string>"
 *   npm run check:logbook
 *
 * Why a script: the parsers are unit-tested in `parseLogbook.test.ts`, but what
 * matters here only appears against Postgres — the to-do primary key making a
 * second PUT a no-op, the position upsert replacing rather than adding, the
 * `date` column round-tripping, and one user being unable to delete another's
 * tick. The vitest suite never opens a connection.
 *
 * Makes no upstream calls. Creates two users under the prefix below, one
 * location for user A at Red Wing, and whatever ticks and to-dos the steps
 * write, and removes all of them in `finally`. The position row is shared by
 * every account, so a row that existed before the run is saved and restored
 * exactly; one the run created is deleted.
 *
 * console rather than the logger is deliberate — the output is the result.
 */

import type { ApiResponse, AreaPosition, Guidebook, Logbook, RouteTick } from '@weatherteam6/types'

const PORT = 3096
const BASE = `http://127.0.0.1:${PORT}/api/v1`

/** Local-only credentials for this process. Never leave it, never touch the real ones. */
const SHARED_SECRET = 'local-acceptance-check'
const TOKEN_SECRET = 'local-acceptance-token-secret'

const PREFIX = 'zz-check-logbook'
const STAMP = Date.now()

/** The owner's saved Red Wing row, which links to Barn Bluff (`guidebook.test.ts`). */
const RED_WING = { lat: '44.5625', lon: '-92.5338' }

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
): Promise<{ status: number; text: string; payload: ApiResponse<T> }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Session ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const text = await res.text()
  let payload: ApiResponse<T>
  try {
    payload = JSON.parse(text) as ApiResponse<T>
  } catch {
    payload = { data: null, error: 'response was not JSON', status: res.status }
  }
  return { status: res.status, text, payload }
}

function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
  const { users, locations, routeTicks, routeTodos, areaLocations } = await import('../db/schema.js')
  const { hashPassword } = await import('../lib/auth/password.js')
  const { signToken, expiryFrom } = await import('../lib/auth/token.js')
  const { guidebookFor } = await import('../lib/guidebook/guidebook.js')
  const { and, eq, inArray } = await import('drizzle-orm')

  const barnBluff = guidebookFor(Number(RED_WING.lat), Number(RED_WING.lon))
  const wall = barnBluff?.walls[0]
  const route = wall?.routes[0]
  if (wall === undefined || route === undefined) {
    console.error('\nThe snapshot no longer links Red Wing to a Barn Bluff wall with a route.\n')
    await pool.end()
    process.exit(2)
  }
  console.log(`\nRecording against ${wall.name} (${wall.id}), ticking ${route.name} (${route.id})`)

  const app = createApp()
  const server = app.listen(PORT)
  await new Promise<void>((resolve) => server.once('listening', resolve))

  const createdUserIds: string[] = []
  const createdLocationIds: string[] = []
  const before = await db.select().from(areaLocations).where(eq(areaLocations.area_id, wall.id))
  const priorPosition = before[0] ?? null
  console.log(priorPosition === null ? '  no position recorded for it yet' : '  a position exists and will be restored')

  try {
    for (const who of ['a', 'b']) {
      const inserted = await db
        .insert(users)
        .values({
          username: `${PREFIX}-${who}-${STAMP}`,
          password_hash: await hashPassword(`correct-horse-battery-${who}`),
          name: `ZZ logbook check ${who}`,
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

    const loc = await db
      .insert(locations)
      .values({ user_id: idA, name: `ZZ logbook check Red Wing ${STAMP}`, ...RED_WING, is_climbing_location: true })
      .returning({ id: locations.id })
    const locA = loc[0]?.id
    if (locA === undefined) throw new Error('could not create a location for user A')
    createdLocationIds.push(locA)

    console.log('\n0. A browser may send PUT')
    // The to-do and position routes are the API's first PUTs. Without PUT in
    // the preflight answer every browser refuses them before they are sent,
    // while this script's own fetch (no Origin, no preflight) sees a 200.
    const preflight = await fetch(`${BASE}/logbook/todos/${route.id}`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'PUT' },
    })
    const allowed = preflight.headers.get('access-control-allow-methods') ?? ''
    check('the CORS preflight allows PUT', /\bPUT\b/.test(allowed), `allowed: ${allowed}`)

    console.log('\n1. A tick is created and listed')
    const today = localToday()
    const posted = await call<RouteTick>('POST', '/logbook/ticks', tokenA, {
      route_id: route.id,
      ticked_on: today,
      style: 'flash',
      laps: 2,
      note: `  ${PREFIX}  `,
    })
    check('POST /logbook/ticks answers 201', posted.status === 201, `got ${posted.status} ${String(posted.payload.error)}`)
    const tick = posted.payload.data
    check('the date round-trips through the date column unchanged', tick?.ticked_on === today, `got ${tick?.ticked_on}`)
    check('the note is stored trimmed', tick?.note === PREFIX)
    const listed = await call<Logbook>('GET', '/logbook', tokenA)
    check('GET /logbook lists it', listed.payload.data?.ticks.some((t) => t.id === tick?.id) === true)

    console.log('\n2. An unknown route is a 404 and writes nothing')
    const ghost = await call<RouteTick>('POST', '/logbook/ticks', tokenA, {
      route_id: '00000000-0000-4000-8000-0000000000fe',
      ticked_on: today,
      style: 'send',
    })
    check('POST for a route not in the snapshot answers 404', ghost.status === 404, `got ${ghost.status}`)
    const rowsA = await db.select({ id: routeTicks.id }).from(routeTicks).where(eq(routeTicks.user_id, idA))
    check('user A still has exactly one tick', rowsA.length === 1, `found ${rowsA.length}`)

    console.log("\n3. User B cannot delete user A's tick")
    const cross = await call<null>('DELETE', `/logbook/ticks/${tick?.id ?? ''}`, tokenB)
    check("B's DELETE answers 404, not 403 or 200", cross.status === 404, `got ${cross.status}`)
    const stillThere = await call<Logbook>('GET', '/logbook', tokenA)
    check("A's tick survived", stillThere.payload.data?.ticks.some((t) => t.id === tick?.id) === true)
    const bSees = await call<Logbook>('GET', '/logbook', tokenB)
    check("B's logbook does not show it", bSees.payload.data?.ticks.length === 0)
    const own = await call<null>('DELETE', `/logbook/ticks/${tick?.id ?? ''}`, tokenA)
    check("A's own DELETE answers 200", own.status === 200, `got ${own.status}`)
    const gone = await call<Logbook>('GET', '/logbook', tokenA)
    check('and the tick is gone', gone.payload.data?.ticks.length === 0)

    console.log('\n4. To-dos are idempotent')
    const put1 = await call<null>('PUT', `/logbook/todos/${route.id}`, tokenA)
    const put2 = await call<null>('PUT', `/logbook/todos/${route.id}`, tokenA)
    check('both PUTs answer 200', put1.status === 200 && put2.status === 200, `got ${put1.status}, ${put2.status}`)
    const todoRows = await db
      .select()
      .from(routeTodos)
      .where(and(eq(routeTodos.user_id, idA), eq(routeTodos.route_id, route.id)))
    check('and leave one row', todoRows.length === 1, `found ${todoRows.length}`)
    const withTodo = await call<Logbook>('GET', '/logbook', tokenA)
    check('GET /logbook lists the to-do', withTodo.payload.data?.todos.includes(route.id) === true)
    const unknownTodo = await call<null>('PUT', '/logbook/todos/not-a-route', tokenA)
    check('a to-do for an unknown route answers 404', unknownTodo.status === 404, `got ${unknownTodo.status}`)
    const del1 = await call<null>('DELETE', `/logbook/todos/${route.id}`, tokenA)
    const del2 = await call<null>('DELETE', `/logbook/todos/${route.id}`, tokenA)
    check('removing it, and removing it again, both answer 200', del1.status === 200 && del2.status === 200, `got ${del1.status}, ${del2.status}`)

    console.log('\n5. A position is recorded, replaced, and a rough fix changes nothing')
    const first = await call<AreaPosition>('PUT', `/guidebook/areas/${wall.id}/position`, tokenA, {
      lat: 44.5661,
      lon: -92.5301,
      accuracy_m: 8,
    })
    check('the first PUT answers 200', first.status === 200, `got ${first.status} ${String(first.payload.error)}`)
    const second = await call<AreaPosition>('PUT', `/guidebook/areas/${wall.id}/position`, tokenB, {
      lat: 44.5662,
      lon: -92.5302,
      accuracy_m: 5,
    })
    check('a second PUT, from another account, answers 200', second.status === 200, `got ${second.status}`)
    const posRows = await db.select().from(areaLocations).where(eq(areaLocations.area_id, wall.id))
    check('one row for the area', posRows.length === 1, `found ${posRows.length}`)
    check('carrying the second fix', posRows[0]?.lat === 44.5662 && posRows[0]?.lon === -92.5302 && posRows[0]?.accuracy_m === 5)

    const rough = await call<AreaPosition>('PUT', `/guidebook/areas/${wall.id}/position`, tokenA, {
      lat: 1,
      lon: 1,
      accuracy_m: 51,
    })
    check('accuracy 51 m answers 400', rough.status === 400, `got ${rough.status}`)
    check('saying the fix was too rough', /too rough/.test(rough.payload.error ?? ''), String(rough.payload.error))
    const afterRough = await db.select().from(areaLocations).where(eq(areaLocations.area_id, wall.id))
    check('and the stored position is unchanged', afterRough[0]?.lat === 44.5662 && afterRough[0]?.accuracy_m === 5)
    const noArea = await call<AreaPosition>('PUT', '/guidebook/areas/not-an-area/position', tokenA, {
      lat: 1,
      lon: 1,
      accuracy_m: 5,
    })
    check('an area not in the snapshot answers 404', noArea.status === 404, `got ${noArea.status}`)

    console.log('\n6. The guidebook carries the position and never who recorded it')
    const guide = await call<Guidebook>('GET', `/guidebook/${locA}`, tokenA)
    check('GET /guidebook answers 200', guide.status === 200, `got ${guide.status}`)
    const shown = guide.payload.data?.walls.find((w) => w.id === wall.id)
    check('the recorded wall carries the position', shown?.position?.lat === 44.5662 && shown.position.accuracy_m === 5)
    const others = guide.payload.data?.walls.filter((w) => w.id !== wall.id) ?? []
    check(
      'every other wall carries a position field, null where nobody recorded one',
      others.every((w) => w.position !== undefined),
    )
    check('the response never names recorded_by', !guide.text.includes('recorded_by'))
    check("nor carries either recorder's id", !guide.text.includes(idA) && !guide.text.includes(idB))
  } catch (err) {
    failed++
    console.log(`\n  ERROR  ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    let cleaned = true
    try {
      if (priorPosition !== null) {
        const { lat, lon, accuracy_m, recorded_by, recorded_at } = priorPosition
        await db
          .update(areaLocations)
          .set({ lat, lon, accuracy_m, recorded_by, recorded_at })
          .where(eq(areaLocations.area_id, wall.id))
      } else if (createdUserIds.length > 0) {
        await db
          .delete(areaLocations)
          .where(and(eq(areaLocations.area_id, wall.id), inArray(areaLocations.recorded_by, createdUserIds)))
      }
      if (createdUserIds.length > 0) {
        await db.delete(routeTicks).where(inArray(routeTicks.user_id, createdUserIds))
        await db.delete(routeTodos).where(inArray(routeTodos.user_id, createdUserIds))
      }
      if (createdLocationIds.length > 0) {
        await db.delete(locations).where(inArray(locations.id, createdLocationIds))
      }
      if (createdUserIds.length > 0) {
        await db.delete(users).where(inArray(users.id, createdUserIds))
      }
      const restored = await db.select().from(areaLocations).where(eq(areaLocations.area_id, wall.id))
      const same =
        priorPosition === null
          ? restored.length === 0
          : JSON.stringify(restored[0]) === JSON.stringify(priorPosition)
      if (!same) {
        cleaned = false
        console.log(`\n  CLEANUP FAILED — area_locations for ${wall.id} is not as it was before the run`)
      }
    } catch (err) {
      cleaned = false
      console.log(`\n  CLEANUP FAILED — ${err instanceof Error ? err.message : String(err)}`)
    }
    console.log(
      cleaned
        ? '\n  cleaned up the test users, their location, ticks, to-dos and the position row'
        : `\n  COULD NOT CLEAN UP — remove the users named "${PREFIX}-*", their rows, and check area_locations for ${wall.id} by hand`,
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
