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

const RAIN_MODELS_STORED = ['gfs_seamless', 'ecmwf_ifs025', 'icon_seamless']

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
  const { pointKeyForPlace } = await import('../lib/runs/pointKey.js')
  const { confirmRuns, deleteRunsForPoint, storeDeterministicRun, storeEnsembleRun } = await import(
    '../lib/runs/storeRun.js'
  )
  const { loadStoredDeterministic, loadStoredEnsemble } = await import(
    '../lib/runs/latestRuns.js'
  )
  const { pruneWeatherRuns, PARSED_RETENTION_DAYS } = await import(
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
  const adHocKey = pointKeyForPlace({ lat: LAT, lon: LON, elevation_m: null }) + '/check'
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
    const stored = await storeDeterministicRun(adHocKey, {
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
            /**
             * **The three states shortwave has, in one fixture.** 0 is night, a
             * number is daylight, and null is an hour the model did not answer
             * for — NBM's shortwave horizon is 42h against 270h of dew point
             * (`model-matrix.md`, 2026-09-21), so the third case is routine
             * rather than hypothetical. A driver or a column default that
             * flattened any two of these together would be invisible to vitest,
             * which never opens a connection.
             */
            shortwave_wm2: i === 0 ? 0 : i === 1 ? 512.5 : null,
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
      'shortwave 0 — night — reads back as 0, not null',
      hours[0]?.shortwave_wm2 === 0,
      `got ${String(hours[0]?.shortwave_wm2)}`,
    )
    check(
      'shortwave in daylight keeps its decimals',
      hours[1]?.shortwave_wm2 === 512.5,
      `got ${String(hours[1]?.shortwave_wm2)}`,
    )
    check(
      'shortwave past the model’s own horizon reads back as null, not 0',
      hours[2]?.shortwave_wm2 === null,
      `got ${String(hours[2]?.shortwave_wm2)}`,
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
    const again = await storeDeterministicRun(adHocKey, {
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
            // The retry carries a *different* shortwave for the same hours, so
            // the upsert is checked to overwrite rather than keep the first value.
            shortwave_wm2: i === 0 ? 0 : i === 1 ? 640 : null,
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
    check(
      'the new column is in the upsert’s SET list — a re-store overwrites shortwave',
      updatedHours[1]?.shortwave_wm2 === 640,
      `got ${String(updatedHours[1]?.shortwave_wm2)}`,
    )

    console.log('\nStoring an ensemble run')
    const ens = await storeEnsembleRun(adHocKey, {
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
          precip_mm_mean: 0.4,
          members_wet: 96,
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
          precip_mm_mean: null,
          members_wet: 0,
          member_count: 0,
          model_member_counts: {},
        },
      ],
      fetched_at: fetchedAt,
    })

    check('the ensemble run stored one hour, not two', ens?.hours === 1, `got ${String(ens?.hours)}`)
    const ensHours = await db
      .select()
      .from(weatherEnsembleHours)
      .where(eq(weatherEnsembleHours.run_id, ens?.run_id ?? ''))
    check('member counts persisted', ensHours[0]?.member_count === 143)
    check(
      'the wet-member count persisted',
      ensHours[0]?.members_wet === 96,
      String(ensHours[0]?.members_wet),
    )
    check(
      'and the mean accumulation, which is the only additive one',
      ensHours[0]?.precip_mm_mean === 0.4,
      String(ensHours[0]?.precip_mm_mean),
    )
    /**
     * Compared **field by field, never as serialised JSON.**
     *
     * `model_member_counts` is a `jsonb` column, and Postgres does not store
     * jsonb as the text it was given — it parses it and reorders the keys, by
     * length and then bytewise. `gfs_seamless` and `ecmwf_ifs025` are both
     * twelve characters, so `e` sorts before `g` and the object always reads
     * back as `{"ecmwf_ifs025":51,"gfs_seamless":31}` however it went in.
     *
     * `JSON.stringify(a) === JSON.stringify(b)` therefore compared key *order*,
     * which jsonb never promised, and failed on completely correct data. It
     * was written in the same session as the code and never run — the
     * migrations it needs were unapplied until 2026-09-02 — so the first real
     * execution was its first honest test. Defect class 11, in a script whose
     * entire purpose is to catch what vitest cannot.
     */
    const stored_counts: Record<string, number> = {}
    const rawCounts: unknown = ensHours[0]?.model_member_counts
    if (typeof rawCounts === 'object' && rawCounts !== null && !Array.isArray(rawCounts)) {
      for (const [model, count] of Object.entries(rawCounts)) {
        if (typeof count === 'number') stored_counts[model] = count
      }
    }
    check(
      'the per-model split persisted as an object',
      stored_counts['gfs_seamless'] === 31 &&
        stored_counts['ecmwf_ifs025'] === 51 &&
        Object.keys(stored_counts).length === 2,
      JSON.stringify(stored_counts),
    )

    console.log('\nReading the freshest run back — what a panel renders from')
    const fresh = await loadStoredDeterministic(adHocKey, new Date(Date.now() - 60 * 60 * 1000))
    check('the stored batch came back', fresh !== null)
    check(
      'the fetch time is the run’s own, not now',
      fresh?.fetched_at?.getTime() === fetchedAt.getTime(),
      `got ${String(fresh?.fetched_at?.toISOString())}`,
    )
    check(
      'a null column survives the read as null',
      fresh?.models[0]?.hours[0]?.pressure_hpa === null,
      `got ${String(fresh?.models[0]?.hours[0]?.pressure_hpa)}`,
    )
    check(
      'the shared-probability flag survives as a boolean',
      fresh?.models[0]?.probability_is_shared === true,
      `got ${String(fresh?.models[0]?.probability_is_shared)}`,
    )
    check(
      'models with no stored run are named, not silently missing',
      (fresh?.unavailable_models.includes('ncep_hrrr_conus') ?? false) &&
        !(fresh?.unavailable_models.includes('ncep_nbm_conus') ?? true),
      fresh?.unavailable_models.join(',') ?? 'none',
    )
    check(
      'the hours come back in time order',
      (fresh?.models[0]?.hours ?? []).every(
        (h, i, all) => i === 0 || h.valid_at >= (all[i - 1]?.valid_at ?? h.valid_at),
      ),
    )

    const ensRead = await loadStoredEnsemble(adHocKey, new Date(Date.now() - 60 * 60 * 1000))
    check('the ensemble run came back too', ensRead !== null)
    check(
      'the wet count survives the read',
      ensRead?.hours[0]?.members_wet === 96,
      String(ensRead?.hours[0]?.members_wet),
    )
    check(
      'the per-model counts come back as numbers, not strings',
      typeof Object.values(ensRead?.hours[0]?.model_member_counts ?? {})[0] === 'number',
    )

    // The cutoff is the whole point of the read path: a run older than it must
    // not be served as current. A cutoff in the future proves it cuts, where a
    // cutoff an hour back would pass whether or not the comparison worked.
    const stale = await loadStoredDeterministic(adHocKey, new Date(Date.now() + 60 * 1000))
    check('a run older than the cutoff is not served', stale === null, stale ? 'served it' : '')

    console.log('\nPer-model reads — a later collection without a model must not hide it (#179)')
    const laterAt = new Date(fetchedAt.getTime() + 60 * 1000)
    await storeDeterministicRun(adHocKey, {
      models: [
        {
          model: 'gfs_seamless',
          probability_is_shared: null,
          hours: [
            {
              valid_at_local: hour(0),
              temp_c: 18,
              dewpoint_c: null,
              humidity_pct: null,
              precip_mm: 0,
              wind_kmh: null,
              wind_gust_kmh: null,
              wind_dir_deg: null,
              cloud_pct: null,
              precip_prob_pct: null,
              pressure_hpa: null,
              shortwave_wm2: null,
            },
          ],
        },
      ],
      unavailable_models: [],
      utc_offset_seconds: -25200,
      model_elevation_m: 1147,
      fetched_at: laterAt,
    }, { models: RAIN_MODELS_STORED, byLocal: new Map([[hour(0), 0.3]]) })
    const recent = (): Promise<Awaited<ReturnType<typeof loadStoredDeterministic>>> =>
      loadStoredDeterministic(adHocKey, new Date(Date.now() - 60 * 60 * 1000))
    const byModel = (
      runs: Awaited<ReturnType<typeof loadStoredDeterministic>>,
      model: string,
    ): { fetched_at: Date; checked_at: Date; probability_is_shared: boolean | null } | undefined =>
      runs?.models.find((m) => m.model === model)

    const mixed = await recent()
    const nbm = byModel(mixed, 'ncep_nbm_conus')
    const gfs = byModel(mixed, 'gfs_seamless')
    check('the earlier model survives a later collection that lacked it', nbm !== undefined)
    check(
      'each model carries its own fetch time',
      nbm?.fetched_at.getTime() === fetchedAt.getTime() &&
        gfs?.fetched_at.getTime() === laterAt.getTime(),
      `nbm ${String(nbm?.fetched_at.toISOString())}, gfs ${String(gfs?.fetched_at.toISOString())}`,
    )
    check(
      'the read’s own fetch time is the older model’s',
      mixed?.fetched_at?.getTime() === fetchedAt.getTime(),
      String(mixed?.fetched_at?.toISOString()),
    )
    check('a null share flag reads back as null', gfs?.probability_is_shared === null)

    console.log('\nThe rain median — on the thermal run only, beside its own rain (#209)')
    const gfsRun = mixed?.models.find((m) => m.model === 'gfs_seamless')
    const nbmRun = mixed?.models.find((m) => m.model === 'ncep_nbm_conus')
    check(
      'the median’s models read back as the array stored',
      JSON.stringify(gfsRun?.rain_models) === JSON.stringify(RAIN_MODELS_STORED),
      JSON.stringify(gfsRun?.rain_models),
    )
    check(
      'the median reads back beside the model’s own rain, not over it',
      gfsRun?.hours[0]?.rain_median_mm === 0.3 && gfsRun.hours[0].precip_mm === 0,
      `median ${String(gfsRun?.hours[0]?.rain_median_mm)}, own ${String(gfsRun?.hours[0]?.precip_mm)}`,
    )
    check('a run stored without a median reads back null, not empty', nbmRun?.rain_models === null)

    console.log('\nConfirming a skipped model — stamped current, not refetched')
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
    await db
      .update(weatherRuns)
      .set({ checked_at: twoHoursAgo })
      .where(and(eq(weatherRuns.point_key, adHocKey), eq(weatherRuns.model, 'ncep_nbm_conus')))
    check(
      'a model not checked inside the cutoff is left out',
      byModel(await recent(), 'ncep_nbm_conus') === undefined,
    )

    const confirmedAt = new Date()
    const confirmed = await confirmRuns(
      adHocKey,
      [{ model: 'ncep_nbm_conus', fetched_at: fetchedAt }],
      confirmedAt,
    )
    check('confirmRuns stamped exactly one run', confirmed === 1, `got ${String(confirmed)}`)
    const back = byModel(await recent(), 'ncep_nbm_conus')
    check(
      'the confirmed model is served again, fetch time unchanged, check time moved',
      back?.fetched_at.getTime() === fetchedAt.getTime() &&
        back.checked_at.getTime() === confirmedAt.getTime(),
      `fetched ${String(back?.fetched_at.toISOString())}, checked ${String(back?.checked_at.toISOString())}`,
    )
    await confirmRuns(adHocKey, [{ model: 'ncep_nbm_conus', fetched_at: fetchedAt }], twoHoursAgo)
    check(
      'a late confirmation never moves the check time backwards',
      byModel(await recent(), 'ncep_nbm_conus')?.checked_at.getTime() === confirmedAt.getTime(),
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

    console.log('\nA run inside the retention window survives the prune')
    const recentAt = new Date(Date.now() - 60 * 60 * 1000)
    const young = await storeEnsembleRun(adHocKey, {
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
          precip_mm_mean: 0.4,
          members_wet: 96,
          member_count: 143,
          model_member_counts: { gfs_seamless: 31 },
        },
      ],
      fetched_at: recentAt,
    })
    const recentRun = young?.run_id ?? ''
    await pruneWeatherRuns()
    const stillThere = await db.select().from(weatherRuns).where(eq(weatherRuns.id, recentRun))
    check('the run itself survived', stillThere.length === 1)
    const keptHours = await db
      .select()
      .from(weatherEnsembleHours)
      .where(eq(weatherEnsembleHours.run_id, recentRun))
    check('and its parsed hours survived', keptHours.length === 1)

    console.log('\nDeleting one saved copy of a place leaves the place\'s runs')
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
    locationKey = pointKeyForPlace({ lat: LAT, lon: LON, elevation_m: null }) + '/check-shared'

    const attached = await storeDeterministicRun(locationKey, {
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
    check('a run is stored for the place', attached.length === 1)

    const deleted = await deleteLocationCascade(locationId, userId)
    check('deleteLocationCascade returns true — no foreign-key violation', deleted)
    if (deleted) {
      locationId = null
      const keptRuns = await db
        .select()
        .from(weatherRuns)
        .where(and(eq(weatherRuns.point_key, locationKey), eq(weatherRuns.model, 'gfs_seamless')))
      check('the place\'s run is still there for any other copy', keptRuns.length === 1)
      const keptHours = await db
        .select()
        .from(weatherRunHours)
        .where(eq(weatherRunHours.run_id, attached[0]?.run_id ?? ''))
      check('and so are its hours', keptHours.length === 2)
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
    shortwave_wm2: null as number | null,
  }
}

void run()
