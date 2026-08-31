/**
 * Acceptance check for the bot panel's state row.
 *
 * Usage, from `apps/api`:
 *   $env:DATABASE_URL = "<Neon pooled connection string>"
 *   npm run check:panel-state
 *
 * Why a script rather than a test: vitest mocks `fetch` and never opens a
 * connection, so none of what this covers is visible to it — a value that fails
 * to persist, a scope predicate that does not scope, a prune cutoff that cuts
 * nothing, and above all the **foreign-key violation** that deleting a location
 * with a panel still open would otherwise raise. `panel_states.location_id` is a
 * real FK and no FK in this schema declares `onDelete`.
 *
 * Creates rows under an obvious prefix and always removes them, including when a
 * step fails partway through — and says so loudly if cleanup did not work.
 *
 * `DEFAULT_USER_ID` is optional: without it the seeded user is read from `users`.
 *
 * console rather than the logger is deliberate — this is an operator CLI and its
 * output is the result.
 */

// Runtime imports are deferred into run(): `../db/index.js` throws at import
// time when DATABASE_URL is unset, which would pre-empt the explanation below
// with a stack trace.

const NAME_PREFIX = 'ZZ panel-state check'

/** Red Rock Canyon NCA, Nevada. */
const LAT = 36.15192
const LON = -115.45413

/** Any well-formed uuid that will not be the seeded user. */
const OTHER_USER_ID = '00000000-0000-4000-8000-0000000000fd'

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
  const { locations, panelStates } = await import('../db/schema.js')
  const { eq } = await import('drizzle-orm')
  const { createPanelState, loadPanelState, prunePanelStates, updatePanelState } = await import(
    '../lib/telegram/panelState.js'
  )
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
    console.log('\nRound-tripping a panel state')
    const created = await createPanelState(userId, { view: 'list' })
    createdStateIds.push(created.id)
    check(
      'the id is 8 lowercase hex characters — the format callbackData validates',
      /^[0-9a-f]{8}$/.test(created.id),
      `got "${created.id}"`,
    )
    check('it starts in simple mode', created.mode === 'simple', `got ${created.mode}`)
    check('day_offset defaults to 0, not null', created.dayOffset === 0, `got ${String(created.dayOffset)}`)

    const loaded = await loadPanelState(created.id, userId)
    check('it loads back', loaded !== null)
    check('the view persisted', loaded?.view === 'list', `got ${String(loaded?.view)}`)

    console.log('\nUpdating one field')
    const updated = await updatePanelState(created.id, userId, { mode: 'advanced' })
    check('the update returns the new state', updated?.mode === 'advanced', `got ${String(updated?.mode)}`)
    const reloaded = await loadPanelState(created.id, userId)
    check(
      'and it is what is actually stored, not just what was returned',
      reloaded?.mode === 'advanced',
      `got ${String(reloaded?.mode)}`,
    )
    check(
      'the untouched fields survived the patch',
      reloaded?.view === 'list' && reloaded.dayOffset === 0,
      `view ${String(reloaded?.view)}, day_offset ${String(reloaded?.dayOffset)}`,
    )

    console.log('\nScoping — an id from another user must read as gone, not open their panel')
    check(
      'loadPanelState refuses a foreign user',
      (await loadPanelState(created.id, OTHER_USER_ID)) === null,
    )
    check(
      'updatePanelState refuses a foreign user',
      (await updatePanelState(created.id, OTHER_USER_ID, { mode: 'simple' })) === null,
    )
    check(
      'and that refusal wrote nothing',
      (await loadPanelState(created.id, userId))?.mode === 'advanced',
    )

    console.log('\nDeleting a location that still has a panel open — the foreign-key case')
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

    const attached = await createPanelState(userId, { view: 'conditions', locationId })
    createdStateIds.push(attached.id)
    check('the panel points at the location', attached.locationId === locationId)

    const deleted = await deleteLocationCascade(locationId, userId)
    check('deleteLocationCascade returns true — no foreign-key violation', deleted)
    if (deleted) locationId = null
    check(
      'the panel state went with the location',
      (await loadPanelState(attached.id, userId)) === null,
    )

    console.log('\nPruning')
    const stale = await createPanelState(userId, { view: 'list' })
    createdStateIds.push(stale.id)
    const fresh = await createPanelState(userId, { view: 'list' })
    createdStateIds.push(fresh.id)

    // Backdated by hand, because the cutoff is what is under test: pruning a row
    // created a second ago would pass for every possible cutoff, including one
    // that cuts nothing.
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    await db
      .update(panelStates)
      .set({ updated_at: eightDaysAgo })
      .where(eq(panelStates.id, stale.id))

    const removed = await prunePanelStates()
    check('prune removed at least the stale row', removed >= 1, `removed ${String(removed)}`)
    check('the stale row is gone', (await loadPanelState(stale.id, userId)) === null)
    check('the fresh row survived', (await loadPanelState(fresh.id, userId)) !== null)
  } catch (err) {
    failed++
    console.log(`\n  ERROR  ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    // Panel states first: one of them references the location.
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
