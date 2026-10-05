/**
 * Acceptance check for the trip recorder, `GET /trips/:tripId/forecast` and
 * `GET /trips/:tripId/summary`.
 *
 * Usage, from `apps/api`:
 *   $env:DATABASE_URL = "<Neon pooled connection string>"
 *   npm run check:record-trips
 *
 * The recorder's promise is an upsert on (location, day, hour) against real
 * Postgres, which vitest never reaches. This seeds a throwaway user, crag and
 * trip, runs `recordTripDays` twice inside one hour, and reads the rows back.
 *
 * **It runs the real recorder**, so every other unfinished trip in the database
 * is recorded for this hour too, exactly as the cron would.
 *
 * Rows are named with the prefix below and removed in `finally`, through
 * `deleteLocationCascade`, which also proves the new table is on its list.
 *
 * console rather than the logger is deliberate: this is an operator-facing CLI.
 */

import type { ApiResponse, TripOutlook, TripSummary, TripTrend } from '@weatherteam6/types'

const PORT = 3097
const BASE = `http://127.0.0.1:${PORT}/api/v1`
const SHARED_SECRET = 'local-acceptance-check'
const TOKEN_SECRET = 'local-acceptance-token-secret'
const PREFIX = 'zz-check-record-trips'
const STAMP = Date.now()

// Red Rock Canyon NCA, Nevada.
const LAT = '36.15192'
const LON = '-115.45413'

/** Readings reach today and six days on; the outlook reaches 16 days. */
const LAST_SCORED_LEAD = 6

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

function isoDay(now: Date, offsetDays: number): string {
  return new Date(now.getTime() + offsetDays * 86_400_000).toISOString().slice(0, 10)
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
  const { users, locations, trips, tripLocations, tripDayRecords, tripDayOutcomes, tripRainRecords } = await import('../db/schema.js')
  const { recordTripDays } = await import('../lib/trips/recordTripDays.js')
  const { deleteLocationCascade } = await import('../lib/locations/deleteLocation.js')
  const { signToken, expiryFrom } = await import('../lib/auth/token.js')
  const { eq } = await import('drizzle-orm')

  const app = createApp()
  const server = app.listen(PORT)
  await new Promise<void>((resolve) => server.once('listening', resolve))

  let userId: string | null = null
  let locationId: string | null = null
  let tripId: string | null = null
  let oldLocationId: string | null = null
  const extraTripIds: string[] = []

  try {
    const user = await db
      .insert(users)
      .values({ username: `${PREFIX}-${STAMP}`, name: 'ZZ record-trips check' })
      .returning({ id: users.id })
    userId = user[0]?.id ?? null
    if (userId === null) throw new Error('could not create the user')

    const location = await db
      .insert(locations)
      .values({
        user_id: userId,
        name: `${PREFIX} crag ${STAMP}`,
        lat: LAT,
        lon: LON,
        is_climbing_location: true,
        rock_type: 'sandstone',
      })
      .returning({ id: locations.id })
    locationId = location[0]?.id ?? null
    if (locationId === null) throw new Error('could not create the location')

    const now = new Date()
    // Starts a day before UTC's today so the location's local today is inside
    // it wherever it is; ends past the 16-day horizon.
    const trip = await db
      .insert(trips)
      .values({ user_id: userId, name: `${PREFIX} trip`, start_date: isoDay(now, -1), end_date: isoDay(now, 20) })
      .returning({ id: trips.id })
    tripId = trip[0]?.id ?? null
    if (tripId === null) throw new Error('could not create the trip')
    await db.insert(tripLocations).values({ trip_id: tripId, location_id: locationId })

    // A trip at the same crag that is over: both its days are 1-3 local days
    // behind wherever the crag is, so both are looked back on.
    const past = await db
      .insert(trips)
      .values({ user_id: userId, name: `${PREFIX} past trip`, start_date: isoDay(now, -3), end_date: isoDay(now, -2) })
      .returning({ id: trips.id })
    const pastTripId = past[0]?.id
    if (pastTripId === undefined) throw new Error('could not create the past trip')
    extraTripIds.push(pastTripId)
    await db.insert(tripLocations).values({ trip_id: pastTripId, location_id: locationId })

    // A crag whose only trip ended a week ago: nothing should be read for it.
    const oldLocation = await db
      .insert(locations)
      .values({ user_id: userId, name: `${PREFIX} old crag ${STAMP}`, lat: LAT, lon: LON, is_climbing_location: true, rock_type: 'sandstone' })
      .returning({ id: locations.id })
    oldLocationId = oldLocation[0]?.id ?? null
    if (oldLocationId === null) throw new Error('could not create the old location')
    const old = await db
      .insert(trips)
      .values({ user_id: userId, name: `${PREFIX} old trip`, start_date: isoDay(now, -8), end_date: isoDay(now, -7) })
      .returning({ id: trips.id })
    const oldTripId = old[0]?.id
    if (oldTripId === undefined) throw new Error('could not create the old trip')
    extraTripIds.push(oldTripId)
    await db.insert(tripLocations).values({ trip_id: oldTripId, location_id: oldLocationId })

    console.log('\nRecording once')
    const first = await recordTripDays(now)
    check('the test crag did not fail', !first.failed.includes(locationId), first.failed.join(','))

    const readRows = () => db.select().from(tripDayRecords).where(eq(tripDayRecords.location_id, locationId ?? ''))
    const rows1 = await readRows()
    check('rows were written for the trip days', rows1.length >= 10, `${rows1.length} rows`)
    check(
      'they run from today (lead 0) past the readings (lead 7+)',
      rows1.some((r) => r.lead_days === 0) && rows1.some((r) => r.lead_days > LAST_SCORED_LEAD),
      rows1.map((r) => r.lead_days).join(','),
    )
    check(
      'no day past the readings carries a score',
      rows1.every((r) => r.lead_days <= LAST_SCORED_LEAD || (r.score === null && r.dryness === null)),
    )
    check(
      'some day inside the readings carries a score and its run',
      rows1.some((r) => r.lead_days <= LAST_SCORED_LEAD && r.score !== null && r.scored_run_fetched_at !== null),
    )
    check('every row carries the outlook', rows1.every((r) => (r.member_count ?? 0) > 0 && r.temp_c_max !== null))

    console.log('\nRecording again inside the same hour')
    const second = await recordTripDays(now)
    check('the test crag did not fail again', !second.failed.includes(locationId), second.failed.join(','))
    const rows2 = await readRows()
    check('the rerun replaced its rows rather than adding', rows2.length === rows1.length, `${rows1.length} then ${rows2.length}`)
    const keys = new Set(rows2.map((r) => `${r.local_date}|${r.recorded_at.toISOString()}`))
    check('one row per (location, day, hour)', keys.size === rows2.length)

    console.log('\nThe trend point')
    const trendRows = await db.select().from(tripRainRecords).where(eq(tripRainRecords.trip_id, tripId))
    const point = trendRows[0]
    check('one trend point for the trip after two runs in one hour', trendRows.length === 1, `${trendRows.length} rows`)
    check('it is under the test crag', point?.location_id === locationId)
    check('it covers part of the trip, and says so', point !== undefined && point.trip_days === 22 && (point.days_covered ?? 99) < 22, JSON.stringify(point))
    check(
      'its rain is a range around the likely total',
      point !== undefined &&
        point.mean_mm !== null &&
        point.p10_mm !== null &&
        point.p90_mm !== null &&
        point.p10_mm <= point.p90_mm &&
        (point.member_count ?? 0) > 0,
      JSON.stringify(point),
    )
    check('it carries the warmest high', point?.high_c_max !== null && point?.high_c_max !== undefined)
    check('the recorder counted it', first.trendRowsWritten >= 1, String(first.trendRowsWritten))

    console.log('\nReading the trip forecast')
    const token = signToken({ sub: userId, exp: expiryFrom() }, TOKEN_SECRET)
    const res = await fetch(`${BASE}/trips/${tripId}/forecast`, { headers: { Authorization: `Session ${token}` } })
    const body = (await res.json()) as ApiResponse<TripOutlook[]>
    const entry = body.data?.[0]
    check('GET /trips/:tripId/forecast returns 200', res.status === 200, String(res.status))
    check('the location has outlook days', (entry?.days?.length ?? 0) > 0)
    check('trip_days is the whole trip', entry?.trip_days === 22, String(entry?.trip_days))
    check(
      'the rain total says it covers less than the trip',
      entry?.rain_total !== null && entry?.rain_total !== undefined && entry.rain_total.days_covered < entry.trip_days,
      JSON.stringify(entry?.rain_total),
    )

    const trendRes = await fetch(`${BASE}/trips/${tripId}/trend`, { headers: { Authorization: `Session ${token}` } })
    const trendBody = (await trendRes.json()) as ApiResponse<TripTrend[]>
    const series = trendBody.data?.[0]
    check('GET /trips/:tripId/trend returns 200', trendRes.status === 200, String(trendRes.status))
    check(
      'the trend matches the recorded point',
      series?.locationId === locationId && series.points.length === 1 && series.points[0]?.trip_days === 22,
      JSON.stringify(series),
    )
    const otherToken = signToken({ sub: '00000000-0000-4000-8000-0000000000fd', exp: expiryFrom() }, TOKEN_SECRET)
    const foreign = await fetch(`${BASE}/trips/${tripId}/trend`, { headers: { Authorization: `Session ${otherToken}` } })
    check("another account reading this trip's trend gets 404", foreign.status === 404, String(foreign.status))

    console.log('\nThe days that are over')
    const pastDates = [isoDay(now, -3), isoDay(now, -2)]
    const outcomes = await db.select().from(tripDayOutcomes).where(eq(tripDayOutcomes.location_id, locationId))
    check(
      'an outcome for each past trip day, one each after two runs, and none for today or later',
      pastDates.every((d) => outcomes.filter((o) => o.local_date === d).length === 1) &&
        outcomes.every((o) => o.local_date < isoDay(now, 0)),
      outcomes.map((o) => o.local_date).join(','),
    )
    check(
      'each carries the rain and the high and low it turned out to have',
      outcomes.every((o) => o.rain_mm !== null && o.rain_mm >= 0 && o.temp_c_max !== null && o.temp_c_min !== null && o.temp_c_min <= o.temp_c_max),
      JSON.stringify(outcomes),
    )
    check(
      'a score comes only with its dryness',
      outcomes.every((o) => (o.score === null) === (o.dryness === null)),
      JSON.stringify(outcomes),
    )
    check('the recorder counted them', first.outcomeRowsWritten >= 2, String(first.outcomeRowsWritten))
    check(
      'no day record was written for a past day',
      rows2.every((r) => !pastDates.includes(r.local_date)),
    )

    console.log('\nA trip that ended a week ago')
    const oldId = oldLocationId ?? ''
    const [oldDays, oldOutcomes, oldTrend] = await Promise.all([
      db.select().from(tripDayRecords).where(eq(tripDayRecords.location_id, oldId)),
      db.select().from(tripDayOutcomes).where(eq(tripDayOutcomes.location_id, oldId)),
      db.select().from(tripRainRecords).where(eq(tripRainRecords.location_id, oldId)),
    ])
    check(
      'nothing is recorded for it',
      oldDays.length + oldOutcomes.length + oldTrend.length === 0,
      `${oldDays.length} days, ${oldOutcomes.length} outcomes, ${oldTrend.length} trend`,
    )

    console.log('\nReading the past trip summary')
    const sumRes = await fetch(`${BASE}/trips/${pastTripId}/summary`, { headers: { Authorization: `Session ${token}` } })
    const sumBody = (await sumRes.json()) as ApiResponse<TripSummary[]>
    const summary = sumBody.data?.[0]
    check('GET /trips/:tripId/summary returns 200', sumRes.status === 200, String(sumRes.status))
    check(
      'it answers both trip days, in order, under the crag',
      summary?.locationId === locationId && summary.days.map((d) => d.local_date).join() === pastDates.join(),
      JSON.stringify(summary),
    )
    check(
      'each day carries the outcome that was stored',
      summary?.days.every((d) => {
        const stored = outcomes.find((o) => o.local_date === d.local_date)
        return d.outcome !== null && stored !== undefined && d.outcome.rain_mm === stored.rain_mm && d.outcome.score === stored.score
      }) === true,
      JSON.stringify(summary?.days.map((d) => d.outcome)),
    )
    const foreignSummary = await fetch(`${BASE}/trips/${pastTripId}/summary`, { headers: { Authorization: `Session ${otherToken}` } })
    check("another account reading this trip's summary gets 404", foreignSummary.status === 404, String(foreignSummary.status))
  } catch (err) {
    failed++
    console.log(`\n  ERROR  ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    try {
      if (locationId !== null && userId !== null) {
        const removed = await deleteLocationCascade(locationId, userId)
        const left = await db.select().from(tripDayRecords).where(eq(tripDayRecords.location_id, locationId))
        check('deleting the location clears its trip_day_records', removed && left.length === 0, `${left.length} left`)
        const trendLeft = await db.select().from(tripRainRecords).where(eq(tripRainRecords.location_id, locationId))
        check('and its trip_rain_records', trendLeft.length === 0, `${trendLeft.length} left`)
        const outcomesLeft = await db.select().from(tripDayOutcomes).where(eq(tripDayOutcomes.location_id, locationId))
        check('and its trip_day_outcomes', outcomesLeft.length === 0, `${outcomesLeft.length} left`)
      }
      if (oldLocationId !== null && userId !== null) await deleteLocationCascade(oldLocationId, userId)
      for (const id of extraTripIds) await db.delete(trips).where(eq(trips.id, id))
      if (tripId !== null) await db.delete(trips).where(eq(trips.id, tripId))
      if (userId !== null) await db.delete(users).where(eq(users.id, userId))
      console.log('  cleaned up')
    } catch (err) {
      console.log(
        `\n  COULD NOT CLEAN UP — remove the user "${PREFIX}-${STAMP}", its trip and location by hand: ` +
          (err instanceof Error ? err.message : String(err)),
      )
      failed++
    }
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
