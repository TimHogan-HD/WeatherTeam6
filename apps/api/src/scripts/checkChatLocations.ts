/**
 * Acceptance check for Phase 5 — `/weather`, save, and `/remove` from chat.
 *
 * Usage, from `apps/api`:
 *   $env:DATABASE_URL = "<Neon pooled connection string>"
 *   npm run check:chat-locations
 *
 * Why a script rather than a test: vitest mocks `fetch` and never opens a
 * connection, so none of this is visible to it — `panel_states.elevation_m`
 * and `feature_code` round-tripping through the `numeric`/`text` columns
 * migration 0010 added, `insertGeneralLocation` actually writing a row (the
 * insert the bot's Save buttons and `POST /locations` now share), and above
 * all the delete-cascade ordering: `panel_states` is one of
 * `DEPENDENT_TABLES`, so removing a location the chat just saved has to take
 * its own panel state with it in the same transaction, not raise a
 * foreign-key violation.
 *
 * Creates rows under an obvious prefix and always removes them, including
 * when a step fails partway through — and says so loudly if cleanup did not
 * work.
 *
 * `DEFAULT_USER_ID` is optional: without it the seeded user is read from `users`.
 *
 * console rather than the logger is deliberate — this is an operator CLI and
 * its output is the result.
 */

// Runtime imports are deferred into run(): `../db/index.js` throws at import
// time when DATABASE_URL is unset, which would pre-empt the explanation below
// with a stack trace.

const NAME_PREFIX = 'ZZ chat-locations check'

/** Willow River State Park, Wisconsin — the issue #82 point. */
const LAT = 45.02
const LON = -92.62
const ELEVATION_M = 298.4
const FEATURE_CODE = 'PRK'

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
  const { panelStates } = await import('../db/schema.js')
  const { eq } = await import('drizzle-orm')
  const { createPanelState, loadPanelState, updatePanelState } = await import(
    '../lib/telegram/panelState.js'
  )
  const { insertGeneralLocation } = await import('../lib/locations/createLocation.js')
  const { deleteLocationCascade } = await import('../lib/locations/deleteLocation.js')

  const userId = await resolveSeededUser(db)
  if (userId === null) {
    console.error('\nNo users in the database, and no DEFAULT_USER_ID set. Nothing to write against.\n')
    await pool.end()
    process.exit(2)
  }

  const createdStateIds: string[] = []
  let locationId: string | null = null

  try {
    console.log('\nA /weather search result: elevation_m and feature_code round-trip')
    const preview = await createPanelState(userId, {
      view: 'weather_preview',
      lat: LAT,
      lon: LON,
      placeName: `${NAME_PREFIX} ${new Date().toISOString()}`,
      elevationM: ELEVATION_M,
      featureCode: FEATURE_CODE,
    })
    createdStateIds.push(preview.id)

    const loaded = await loadPanelState(preview.id, userId)
    check('elevation_m survived the numeric column round trip', loaded?.elevationM === ELEVATION_M, `got ${String(loaded?.elevationM)}`)
    check('feature_code survived', loaded?.featureCode === FEATURE_CODE, `got ${String(loaded?.featureCode)}`)
    check('placeName survived', loaded?.placeName === preview.placeName)

    console.log('\nSave — the insert the bot Save buttons and POST /locations now share')
    if (loaded === null || loaded.lat === null || loaded.lon === null || loaded.placeName === null) {
      throw new Error('preview state did not load back with lat/lon/placeName — stopping')
    }
    const saved = await insertGeneralLocation({
      user_id: userId,
      name: loaded.placeName,
      lat: loaded.lat,
      lon: loaded.lon,
      elevation_m: loaded.elevationM,
      timezone: null,
      is_climbing_location: true,
      rock_type: 'unknown',
    })
    locationId = saved.id
    check('the location was written', saved.name === loaded.placeName)
    check(
      'elevation_m persisted on the location too, so save and preview agree on temperature',
      saved.elevation_m !== null && Math.abs(parseFloat(saved.elevation_m) - ELEVATION_M) < 0.01,
      `got ${String(saved.elevation_m)}`,
    )

    console.log('\nThe panel state attaches to the saved location, the way VERB_SAVE leaves it')
    const attached = await updatePanelState(preview.id, userId, { locationId: saved.id, view: 'conditions' })
    check('the state now points at the saved location', attached?.locationId === saved.id)

    console.log('\n/remove — deleting a location a still-open chat panel points at')
    const deleted = await deleteLocationCascade(locationId, userId)
    check('deleteLocationCascade returns true — no foreign-key violation from the attached panel state', deleted)
    if (deleted) locationId = null
    check(
      'the panel state went with the location (panel_states is a DEPENDENT_TABLE)',
      (await loadPanelState(preview.id, userId)) === null,
    )
  } catch (err) {
    failed++
    console.log(`\n  ERROR  ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    for (const id of createdStateIds) {
      await db
        .delete(panelStates)
        .where(eq(panelStates.id, id))
        .catch(() => {
          console.log(`  COULD NOT CLEAN UP panel state ${id} — remove it by hand`)
        })
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

run().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
