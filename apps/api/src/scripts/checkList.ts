/**
 * Acceptance check for `GET /api/v1/list` (#606), the Conditions list and the
 * Map in one request.
 *
 * Usage, from `apps/api`:
 *   $env:DATABASE_URL = "<Neon pooled connection string>"
 *   npm run check:list
 *
 * Vitest covers the composition (`buildList.test.ts`) but never reaches the
 * database, so what only real Postgres can show is here:
 *   - the list holds exactly the reader's own places, never another account's;
 *   - a place that is not a crag gets `conditions: null`;
 *   - each part says what the per-place route says for the same place
 *     (`/alerts/:id` from stored rows, an expired alert left out; `/forecast/:id`
 *     and `/conditions/:id` where both answered);
 *   - rain-now is a part of its own.
 *
 * **Not run by `ci.yml`**: the forecast and conditions parts read stored runs
 * first and fetch Open-Meteo when there are none, which a throwaway database
 * never has, and the CI job must not spend the shared allowance. A part whose
 * upstream failed here is reported as skipped, not passed.
 *
 * Two users, three places and two alerts, all under an obvious prefix, removed
 * in a `finally` even when a step fails, and loud if that cleanup fails.
 * console rather than the logger: this is an operator CLI and its output is
 * the result.
 */

import type { ApiResponse, Conditions, ForecastSnapshot, ListResponse, RainNow, WeatherAlert } from '@weatherteam6/types'

// Runtime imports are deferred into run(): `../db/index.js` throws at import
// time when DATABASE_URL is unset.

const PORT = 3097
const BASE = `http://127.0.0.1:${PORT}/api/v1`
const SHARED_SECRET = 'local-acceptance-check'
const TOKEN_SECRET = 'local-acceptance-token-secret'
const PREFIX = 'zz-check-list'
const STAMP = Date.now()

let passed = 0
let failed = 0
let skipped = 0

function check(label: string, ok: boolean, detail = ''): void {
  if (ok) {
    passed++
    console.log(`  PASS  ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function skip(label: string, why: string): void {
  skipped++
  console.log(`  SKIP  ${label} — ${why}`)
}

async function get<T>(path: string, token: string): Promise<{ status: number; payload: ApiResponse<T> }> {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Session ${token}` } })
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
  const { users, locations, weatherAlerts } = await import('../db/schema.js')
  const { deleteLocationCascade } = await import('../lib/locations/deleteLocation.js')
  const { hashPassword } = await import('../lib/auth/password.js')
  const { signToken, expiryFrom } = await import('../lib/auth/token.js')
  const { inArray } = await import('drizzle-orm')

  const app = createApp()
  const server = app.listen(PORT)
  await new Promise<void>((resolve) => server.once('listening', resolve))

  const createdUserIds: string[] = []
  const createdLocations: { id: string; userId: string }[] = []

  try {
    console.log('\nCreating two users: A with a crag and a city, B with a crag')
    for (const who of ['a', 'b']) {
      const inserted = await db
        .insert(users)
        .values({
          username: `${PREFIX}-${who}-${STAMP}`,
          password_hash: await hashPassword(`correct-horse-battery-${who}`),
          name: `ZZ list check ${who}`,
        })
        .returning({ id: users.id })
      const id = inserted[0]?.id
      if (id === undefined) throw new Error(`could not create user ${who}`)
      createdUserIds.push(id)
    }
    const [idA, idB] = createdUserIds
    if (idA === undefined || idB === undefined) throw new Error('setup did not produce two users')

    const place = async (userId: string, name: string, crag: boolean): Promise<string> => {
      const row = await db
        .insert(locations)
        .values({
          user_id: userId,
          name: `ZZ list check ${name}`,
          // Red Wing, MN: inside MRMS coverage, so rain-now has a point to read.
          lat: '44.56',
          lon: '-92.54',
          is_climbing_location: crag,
          ...(crag ? { rock_type: 'limestone' as const } : {}),
        })
        .returning({ id: locations.id })
      const id = row[0]?.id
      if (id === undefined) throw new Error(`could not create ${name}`)
      createdLocations.push({ id, userId })
      return id
    }
    const cragA = await place(idA, 'crag A', true)
    const cityA = await place(idA, 'city A', false)
    const cragB = await place(idB, 'crag B', true)

    const now = Date.now()
    await db.insert(weatherAlerts).values([
      {
        location_id: cragA,
        nws_alert_id: `${PREFIX}-active-${STAMP}`,
        event: 'Wind Advisory',
        severity: 'Moderate',
        certainty: 'Likely',
        expires: new Date(now + 3_600_000),
      },
      {
        location_id: cragA,
        nws_alert_id: `${PREFIX}-expired-${STAMP}`,
        event: 'Frost Advisory',
        severity: 'Minor',
        certainty: 'Likely',
        expires: new Date(now - 3_600_000),
      },
    ])

    const token = signToken({ sub: idA, exp: expiryFrom() }, TOKEN_SECRET)

    console.log('\n1. One request answers for exactly the reader’s places')
    const started = Date.now()
    const list = await get<ListResponse>('/list', token)
    console.log(`  (answered in ${Date.now() - started} ms)`)
    check('GET /list is 200', list.status === 200, `got ${list.status}`)
    const body = list.payload.data
    if (body === null) throw new Error('no body — stopping')
    const ids = body.places.map((p) => p.location_id).sort()
    check("it lists A's two places", ids.length === 2 && ids.includes(cragA) && ids.includes(cityA), ids.join(','))
    check("and never B's", !ids.includes(cragB))
    const crag = body.places.find((p) => p.location_id === cragA)
    const city = body.places.find((p) => p.location_id === cityA)
    if (crag === undefined || city === undefined) throw new Error('a place is missing — stopping')

    console.log('\n2. A place that is not a crag gets no score asked for')
    check('the city carries conditions: null', city.conditions === null, JSON.stringify(city.conditions))
    check('the crag carries a conditions part', crag.conditions !== null)

    console.log('\n3. Alerts say what /alerts/:id says')
    const alerts = await get<WeatherAlert[]>(`/alerts/${cragA}`, token)
    check('the alerts part is 200', crag.alerts.status === 200, `got ${crag.alerts.status}`)
    check(
      'it holds the active alert and not the expired one',
      crag.alerts.data?.length === 1 && crag.alerts.data[0]?.event === 'Wind Advisory',
      JSON.stringify(crag.alerts.data?.map((a) => a.event)),
    )
    check(
      'and matches /alerts/:id',
      JSON.stringify(crag.alerts.data) === JSON.stringify(alerts.payload.data),
    )
    check(
      'a place with no alerts is an empty list, 200',
      city.alerts.status === 200 && city.alerts.data?.length === 0,
      JSON.stringify(city.alerts),
    )

    console.log('\n4. Forecast and conditions say what their own routes say')
    const forecast = await get<ForecastSnapshot[]>(`/forecast/${cragA}`, token)
    if (crag.forecast.status === 200 && forecast.status === 200) {
      const dates = (f: ForecastSnapshot[] | null) => JSON.stringify((f ?? []).map((d) => [d.forecast_date, d.window]))
      check('the forecast part has the same days and windows as /forecast/:id', dates(crag.forecast.data) === dates(forecast.payload.data))
    } else {
      check('a failed forecast part is an error, never data', crag.forecast.status === 200 || crag.forecast.data === null)
      skip('forecast parity', `part ${crag.forecast.status}, route ${forecast.status} (no stored run and no upstream)`)
    }
    const conditions = await get<Conditions>(`/conditions/${cragA}`, token)
    const part = crag.conditions
    if (part !== null && part.status === 200 && conditions.status === 200) {
      const key = (c: Conditions | null) =>
        JSON.stringify([c?.location_id, c?.forecast_date, c?.readings?.unavailable_reason, c?.readings?.model])
      check('the conditions part reads as /conditions/:id', key(part.data) === key(conditions.payload.data), `${key(part.data)} vs ${key(conditions.payload.data)}`)
    } else {
      skip('conditions parity', `part ${part?.status ?? 'null'}, route ${conditions.status}`)
    }

    console.log('\n5. Rain-now rides along as its own part')
    const rain = await get<RainNow | null>('/rain-now', token)
    check('the rain-now part has a status', typeof body.rain_now.status === 'number')
    if (body.rain_now.status === 200 && body.rain_now.data !== null) {
      const where = body.rain_now.data.places.map((p) => p.location_id).sort()
      check('it reads every one of A’s places and only those', JSON.stringify(where) === JSON.stringify(ids))
    } else {
      skip('rain-now places', `part ${body.rain_now.status}, /rain-now ${rain.status} (no recent frame)`)
    }

    console.log('\n6. A reader with one place gets one place')
    const listB = await get<ListResponse>('/list', signToken({ sub: idB, exp: expiryFrom() }, TOKEN_SECRET))
    check(
      "B's list is B's crag alone",
      listB.payload.data?.places.length === 1 && listB.payload.data.places[0]?.location_id === cragB,
    )
  } catch (err) {
    failed++
    console.log(`\n  ERROR  ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    let cleaned = true
    try {
      for (const loc of createdLocations) {
        // The same cascade DELETE /locations/:id walks, alerts included.
        await deleteLocationCascade(loc.id, loc.userId)
      }
      if (createdUserIds.length > 0) await db.delete(users).where(inArray(users.id, createdUserIds))
    } catch (err) {
      cleaned = false
      console.log(`\n  CLEANUP FAILED — ${err instanceof Error ? err.message : String(err)}`)
    }
    console.log(
      cleaned
        ? '\n  cleaned up the test users, places and alerts'
        : `\n  COULD NOT CLEAN UP — remove the users named "${PREFIX}-*" and their locations by hand`,
    )
    server.close()
    await pool.end()
  }

  console.log(`\n${failed === 0 ? 'ALL PASSED' : 'FAILURES'} — ${passed} passed, ${failed} failed, ${skipped} skipped\n`)
  process.exit(failed === 0 ? 0 : 1)
}

run().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
