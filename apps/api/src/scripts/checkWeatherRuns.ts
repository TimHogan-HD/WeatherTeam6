/**
 * Acceptance check for weather run persistence — storage, prune ordering, and
 * the location-delete cascade.
 *
 * Usage, from `apps/api`:
 *   $env:DATABASE_URL = "<Neon pooled connection string>"
 *   npm run check:weather-runs
 *
 * Why a script rather than a test: vitest mocks `fetch` and never opens a
 * connection, so nothing here is visible to it. Every failure this covers is a
 * Postgres constraint error — **deleting a `weather_runs` row while
 * `weather_run_hours` still references it**, which no FK in this schema declares
 * `onDelete` for, and which surfaces as a generic 500 only once real data
 * exists. Both the prune and the location delete have to get the order right,
 * independently.
 *
 * It also checks that a null stored for an hour reads back as null rather than
 * 0 — the single most common defect class in this repo, and one that a
 * doubles-to-string round trip could reintroduce silently.
 *
 * No upstream call is made: the fixtures are shaped by hand so the check is
 * about the database, not about Open-Meteo being up.
 *
 * Creates rows under an obvious prefix and always removes them, including when a
 * step fails partway through — and says so loudly if cleanup did not work.
 *
 * console rather than the logger is deliberate — this is an operator CLI and its
 * output is the result.
 */

// Runtime imports are deferred into run(): `../db/index.js` throws at import
// time when DATABASE_URL is unset, which would pre-empt the explanation below
// with a stack trace.

const NAME_PREFIX = 'ZZ weather-runs check'

/** Red Rock Canyon NCA, Nevada. */
const LAT = 36.15192
const LON = -115.45413

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

type Db = (typeof import('../db/index.js'))['db']

async function resolveSeededUser(db: Db): Promise<string | null> {
  const existing = process.env['DEFAULT_USER_ID']
  if (existing) return existing

  const { users } = await import('../db/schema.js')
  const rows = await db.select({ id: users.id }).from(users).limit(1)
  const id = rows[0]?.id
  if (!id) return null

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

  process.env['LOG_LEVEL'] ??= 'warn'

  const { db, pool } = await import('../db/index.js')
  const { locations, weatherEnsembleHours, weatherRunHours, weatherRuns } = await import(
    '../db/schema.js'
  )
  const { and, eq } = await import('drizzle-orm')
  const { pointKeyForCoords, pointKeyForLocation } = await import('../lib/runs/pointKey.js')
  const { deleteRunsForPoint, storeDeterministicRun, storeEnsembleRun } = await import(
    '../lib/runs/storeRun.js'
  )
  const { pruneWeatherRuns, PARSED_RETENTION_DAYS, RAW_RETENTION_HOURS } = await import(
    '../lib/runs/pruneRuns.js'
  )
  const { deleteLocationCascade } = await import('../lib/locations/deleteLocation.js')

  const userId = await resolveSeededUser(db)
  if (userId === null) {
    console.error(
      '\nNo users in the database, and no DEFAULT_USER_ID set. Nothing to write against.\n',
    )
    await pool.end()
    process.exit(2)
  }

  // A key no real point can collide with, so a failed run cannot corrupt real
  // history and cleanup can find everything it made.
  const adHocKey = pointKeyForCoords(LAT, LON) + '/check'
  let locationId: string | null = null
  let locationKey: string | null = null

  const fetchedAt = new Date()
  const hour = (offsetHours: number): string => {
    const d = new Date(Date.UTC(2026, 8, 1, 0, 0, 0))
    d.setUTCHours(d.getUTCHours() + offsetHours)
    return d.toISOString().slice(0, 16)
  }

  try {
    console.log('\nStoring a deterministic run with a null column')
    const stored = await storeDeterministicRun(adHocKey, null, {
      models: [
        {
          model: 'ncep_nbm_conus',
          probability_is_shared: true,
          hours: [0, 1, 2].map((i) => ({
            valid_at_local: hour(i),
            temp_c: 20 + i,
            dewpoint_c: null,
            humidity_pct: null,
            precip_mm: 0,
            wind_kmh: null,
            wind_gust_kmh: null,
            wind_dir_deg: null,
            cloud_pct: null,
            precip_prob_pct: 40,
            // NBM returns nulls for this at every point measured.
            pressure_hpa: null,
          })),
        },
      ],
      unavailable_models: ['ncep_hrrr_conus'],
      utc_offset_seconds: -25200,
      model_elevation_m: 1147,
      fetched_at: fetchedAt,
    })

    check('one run row per model', stored.length === 1, `got ${String(stored.length)}`)
    check('three hours stored', stored[0]?.hours === 3, `got ${String(stored[0]?.hours)}`)

    const runId = stored[0]?.run_id ?? ''
    const hours = await db
      .select()
      .from(weatherRunHours)
      .where(eq(weatherRunHours.run_id, runId))
      .orderBy(weatherRunHours.valid_at)

    check('the hours read back', hours.length === 3, `got ${String(hours.length)}`)
    check(
      'a null column reads back as null, not 0',
      hours[0]?.pressure_hpa === null,
      `got ${String(hours[0]?.pressure_hpa)}`,
    )
    check(
      'a real 0 reads back as 0, not null',
      hours[0]?.precip_mm === 0,
      `got ${String(hours[0]?.precip_mm)}`,
    )
    check(
      'a stored double is a number, not a string',
      typeof hours[0]?.temp_c === 'number',
      `got ${typeof hours[0]?.temp_c}`,
    )
    check(
      'valid_at was shifted out of local time by the offset',
      hours[0]?.valid_at.toISOString() === '2026-09-01T07:00:00.000Z',
      `got ${String(hours[0]?.valid_at.toISOString())}`,
    )

    const runRow = await db.select().from(weatherRuns).where(eq(weatherRuns.id, runId))
    check(
      'the shared-probability flag persisted as true',
      runRow[0]?.precip_prob_is_shared === true,
      `got ${String(runRow[0]?.precip_prob_is_shared)}`,
    )

    console.log('\nRe-storing the same fetch — the retry case')
    const again = await storeDeterministicRun(adHocKey, null, {
      models: [
        {
          model: 'ncep_nbm_conus',
          probability_is_shared: true,
          hours: [0, 1, 2].map((i) => ({
            valid_at_local: hour(i),
            temp_c: 30 + i,
            dewpoint_c: null,
            humidity_pct: null,
            precip_mm: 0,
            wind_kmh: null,
            wind_gust_kmh: null,
            wind_dir_deg: null,
            cloud_pct: null,
            precip_prob_pct: 40,
            pressure_hpa: null,
          })),
        },
      ],
      unavailable_models: [],
      utc_offset_seconds: -25200,
      model_elevation_m: 1147,
      fetched_at: fetchedAt,
    })

    check('the same run row is reused', again[0]?.run_id === runId, `got ${String(again[0]?.run_id)}`)
    const allRuns = await db
      .select({ id: weatherRuns.id })
      .from(weatherRuns)
      .where(eq(weatherRuns.point_key, adHocKey))
    check('no duplicate run row', allRuns.length === 1, `got ${String(allRuns.length)}`)
    const updatedHours = await db
      .select()
      .from(weatherRunHours)
      .where(eq(weatherRunHours.run_id, runId))
      .orderBy(weatherRunHours.valid_at)
    check('the hours were updated in place', updatedHours[0]?.temp_c === 30)
    check('and there are still three of them', updatedHours.length === 3)

    console.log('\nStoring an ensemble run')
    const ens = await storeEnsembleRun(adHocKey, null, {
      daily: { days: [], model_sources: [], utc_offset_seconds: -25200 },
      hours: [
        {
          valid_at_local: hour(0),
          precip_mm_p10: 0,
          precip_mm_p50: 0.2,
          precip_mm_p90: 1.4,
          temp_c_p10: 18,
          temp_c_p50: 20,
          temp_c_p90: 23,
          wind_kmh_p10: 4,
          wind_kmh_p50: 8,
          wind_kmh_p90: 15,
          member_count: 143,
          model_member_counts: { gfs_seamless: 31, ecmwf_ifs025: 51 },
        },
        {
          // No members left: must not be stored at all.
          valid_at_local: hour(1),
          precip_mm_p10: null,
          precip_mm_p50: null,
          precip_mm_p90: null,
          temp_c_p10: null,
          temp_c_p50: null,
          temp_c_p90: null,
          wind_kmh_p10: null,
          wind_kmh_p50: null,
          wind_kmh_p90: null,
          member_count: 0,
          model_member_counts: {},
        },
      ],
      fetched_at: fetchedAt,
      raw: { note: 'check fixture' },
    })

    check('the ensemble run stored one hour, not two', ens?.hours === 1, `got ${String(ens?.hours)}`)
    const ensHours = await db
      .select()
      .from(weatherEnsembleHours)
      .where(eq(weatherEnsembleHours.run_id, ens?.run_id ?? ''))
    check('member counts persisted', ensHours[0]?.member_count === 143)
    check(
      'the per-model split persisted as an object',
      JSON.stringify(ensHours[0]?.model_member_counts) ===
        JSON.stringify({ gfs_seamless: 31, ecmwf_ifs025: 51 }),
      JSON.stringify(ensHours[0]?.model_member_counts),
    )

    console.log('\nPruning — children before parents, or this is a foreign-key violation')
    // Backdated by hand, because the cutoff is what is under test: pruning a row
    // written a second ago would pass for every possible cutoff, including one
    // that cuts nothing.
    const expiredAt = new Date(Date.now() - (PARSED_RETENTION_DAYS + 1) * 24 * 60 * 60 * 1000)
    await db
      .update(weatherRuns)
      .set({ fetched_at: expiredAt })
      .where(eq(weatherRuns.point_key, adHocKey))

    const pruned = await pruneWeatherRuns()
    check('the prune deleted the run rows', pruned.runsDeleted >= 2, `got ${String(pruned.runsDeleted)}`)
    check('and their deterministic hours', pruned.hoursDeleted >= 3, `got ${String(pruned.hoursDeleted)}`)
    check(
      'and their ensemble hours',
      pruned.ensembleHoursDeleted >= 1,
      `got ${String(pruned.ensembleHoursDeleted)}`,
    )
    const leftovers = await db
      .select({ id: weatherRuns.id })
      .from(weatherRuns)
      .where(eq(weatherRuns.point_key, adHocKey))
    check('nothing is left for the point', leftovers.length === 0, `got ${String(leftovers.length)}`)

    console.log('\nClearing the raw payload past its shorter window')
    // Only an ensemble run carries `raw` — a deterministic run's parsed hours
    // are its whole payload, so it is stored with none.
    const rawAt = new Date(Date.now() - (RAW_RETENTION_HOURS + 1) * 60 * 60 * 1000)
    const withRaw = await storeEnsembleRun(adHocKey, null, {
      daily: { days: [], model_sources: [], utc_offset_seconds: 0 },
      hours: [
        {
          valid_at_local: hour(0),
          precip_mm_p10: 0,
          precip_mm_p50: 0,
          precip_mm_p90: 0.5,
          temp_c_p10: 18,
          temp_c_p50: 20,
          temp_c_p90: 23,
          wind_kmh_p10: 1,
          wind_kmh_p50: 2,
          wind_kmh_p90: 3,
          member_count: 143,
          model_member_counts: { gfs_seamless: 31 },
        },
      ],
      fetched_at: rawAt,
      raw: { big: 'payload' },
    })
    const clearedRun = withRaw?.run_id ?? ''
    const beforeClear = await db.select().from(weatherRuns).where(eq(weatherRuns.id, clearedRun))
    check('the raw payload was stored in the first place', beforeClear[0]?.raw !== null)

    const afterRaw = await pruneWeatherRuns()
    check('at least one raw payload was cleared', afterRaw.rawCleared >= 1)
    const stillThere = await db.select().from(weatherRuns).where(eq(weatherRuns.id, clearedRun))
    check('the run itself survived — it is inside the parsed window', stillThere.length === 1)
    check('but its raw payload is gone', stillThere[0]?.raw === null)
    const keptHours = await db
      .select()
      .from(weatherEnsembleHours)
      .where(eq(weatherEnsembleHours.run_id, clearedRun))
    check('and its parsed hours survived', keptHours.length === 1)

    console.log('\nDeleting a location that has runs — the ordered cascade')
    const savedLocation = await db
      .insert(locations)
      .values({
        user_id: userId,
        name: `${NAME_PREFIX} ${new Date().toISOString()}`,
        lat: String(LAT),
        lon: String(LON),
      })
      .returning({ id: locations.id })
    locationId = savedLocation[0]?.id ?? null
    if (locationId === null) throw new Error('could not save a location — stopping')
    locationKey = pointKeyForLocation(locationId)

    const attached = await storeDeterministicRun(locationKey, locationId, {
      models: [
        {
          model: 'gfs_seamless',
          probability_is_shared: false,
          hours: [0, 1].map((i) => ({ ...emptyHour(hour(i)), temp_c: 15 + i })),
        },
      ],
      unavailable_models: [],
      utc_offset_seconds: 0,
      model_elevation_m: null,
      fetched_at: new Date(),
    })
    check('the run is attached to the location', attached.length === 1)

    const deleted = await deleteLocationCascade(locationId, userId)
    check('deleteLocationCascade returns true — no foreign-key violation', deleted)
    if (deleted) {
      const orphanHours = await db
        .select()
        .from(weatherRunHours)
        .where(eq(weatherRunHours.run_id, attached[0]?.run_id ?? ''))
      check('the hours went with the run', orphanHours.length === 0)
      const orphanRuns = await db
        .select()
        .from(weatherRuns)
        .where(and(eq(weatherRuns.point_key, locationKey), eq(weatherRuns.model, 'gfs_seamless')))
      check('and the run went with the location', orphanRuns.length === 0)
      locationId = null
      locationKey = null
    }
  } catch (err) {
    failed++
    console.log(`\n  ERROR  ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    const cleanedAdHoc = await deleteRunsForPoint(adHocKey).catch(() => -1)
    if (cleanedAdHoc < 0) {
      console.log(`  COULD NOT CLEAN UP runs under "${adHocKey}" — remove them by hand`)
    }
    if (locationKey !== null) {
      const ok = await deleteRunsForPoint(locationKey).catch(() => -1)
      if (ok < 0) console.log(`  COULD NOT CLEAN UP runs under "${locationKey}" — remove by hand`)
    }
    if (locationId !== null) {
      const gone = await deleteLocationCascade(locationId, userId).catch(() => false)
      console.log(
        gone
          ? '  cleaned up the test location'
          : `  COULD NOT CLEAN UP the location — remove "${NAME_PREFIX} ..." by hand`,
      )
    }
    await pool.end()
  }

  console.log(`\n${failed === 0 ? 'ALL PASSED' : 'FAILURES'} — ${passed} passed, ${failed} failed\n`)
  process.exit(failed === 0 ? 0 : 1)
}

/** An hour with nothing in it, for fixtures that only care about one field. */
function emptyHour(valid_at_local: string) {
  return {
    valid_at_local,
    temp_c: null as number | null,
    dewpoint_c: null as number | null,
    humidity_pct: null as number | null,
    precip_mm: null as number | null,
    wind_kmh: null as number | null,
    wind_gust_kmh: null as number | null,
    wind_dir_deg: null as number | null,
    cloud_pct: null as number | null,
    precip_prob_pct: null as number | null,
    pressure_hpa: null as number | null,
  }
}

void run()
