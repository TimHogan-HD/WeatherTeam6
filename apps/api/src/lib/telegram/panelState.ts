import { randomBytes } from 'node:crypto'
import { and, eq, lt } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { panelStates } from '../../db/schema.js'

/**
 * Lifecycle for the row behind a panel message's buttons.
 *
 * `callback_data` is 64 bytes, so a button carries an id into this table plus
 * the one field it changes; everything else about the panel is read back from
 * here. See `callbackData.ts`.
 *
 * This module imports `db`, which throws at import time without `DATABASE_URL`,
 * so nothing pure lives here — the rendering is in `panels.ts` and the encoding
 * in `callbackData.ts`, both testable without a database. What this module does
 * is exactly the part vitest cannot see; `npm run check:panel-state` exercises it
 * against real Postgres.
 */

/**
 * The panel views.
 *
 * **'pick_forecast' and 'pick_rain' are the location picker remembering what
 * was asked for.** Before them, `/forecast` with no location opened a picker
 * whose buttons all opened *conditions*, so typing `/forecast` and tapping your
 * crag landed you on the conditions panel — reported from a real device as
 * "conditions and forecast are the same it seems". They render the same list;
 * only the view their buttons open differs.
 *
 * `view` is a plain text column validated here, so adding a value needs no
 * migration, and `mapRow` degrades a value this build does not know rather than
 * typing it as something it is not.
 */
export const PANEL_VIEWS = [
  'list',
  'pick_forecast',
  'pick_rain',
  'pick_remove',
  'conditions',
  'alerts',
  'help',
  'forecast',
  'rain',
  // Phase 5 — `/weather <place>`, save, and `/remove`.
  'weather_search',
  'weather_preview',
  'remove_confirm',
  'removed',
] as const
export type PanelView = (typeof PANEL_VIEWS)[number]

/**
 * How far the day buttons can page. Seven days is what
 * `fetchDeterministicHourly` asks for and the ensemble's own 168 h horizon, so a
 * larger offset would page into days no model answered for.
 */
export const MAX_DAY_OFFSET = 6

export const PANEL_MODES = ['simple', 'advanced'] as const
export type PanelMode = (typeof PANEL_MODES)[number]

/** Rows older than this are pruned; a button pointing at one says "expired". */
export const PANEL_STATE_MAX_AGE_DAYS = 7

export type PanelState = {
  readonly id: string
  readonly userId: string
  readonly locationId: string | null
  readonly lat: number | null
  readonly lon: number | null
  readonly placeName: string | null
  /** Geocoded elevation for an unsaved point (Phase 5) — `null` when absent or not yet known. */
  readonly elevationM: number | null
  /** GeoNames `feature_code` for an unsaved point (Phase 5) — feed to `geocodeKindLabel`. */
  readonly featureCode: string | null
  readonly view: PanelView
  readonly model: string | null
  readonly intervalHours: number | null
  readonly dayOffset: number
  readonly columnSet: string | null
  readonly units: string
  readonly mode: PanelMode
}

export function isPanelView(value: string): value is PanelView {
  return (PANEL_VIEWS as readonly string[]).includes(value)
}

export function isPanelMode(value: string): value is PanelMode {
  return (PANEL_MODES as readonly string[]).includes(value)
}

/**
 * 8 lowercase hex characters — the id format `callbackData.ts` validates, and
 * 32 bits of randomness from a CSPRNG. Short because it has to fit in a button
 * alongside a uuid.
 */
function newPanelStateId(): string {
  return randomBytes(4).toString('hex')
}

type PanelStateRow = typeof panelStates.$inferSelect

/**
 * `numeric` comes back from the driver as a string, and `Number('')` is `0` —
 * a coordinate of exactly 0,0 in the Gulf of Guinea, which is a plausible
 * looking point rather than a visible gap. Anything that does not parse finitely
 * is `null`.
 */
function toNumber(value: string | null): number | null {
  if (value === null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * A row that somehow holds a view or mode this build does not know — an older
 * deploy's value, or a hand-edited row — degrades to the defaults rather than
 * being typed as something it is not.
 */
function mapRow(row: PanelStateRow): PanelState {
  return {
    id: row.id,
    userId: row.user_id,
    locationId: row.location_id,
    lat: toNumber(row.lat),
    lon: toNumber(row.lon),
    placeName: row.place_name,
    elevationM: toNumber(row.elevation_m),
    featureCode: row.feature_code,
    view: isPanelView(row.view) ? row.view : 'help',
    model: row.model,
    intervalHours: row.interval_hours,
    dayOffset: row.day_offset,
    columnSet: row.column_set,
    units: row.units,
    mode: isPanelMode(row.mode) ? row.mode : 'simple',
  }
}

export type PanelStateInit = {
  readonly view: PanelView
  readonly locationId?: string | null
  readonly lat?: number | null
  readonly lon?: number | null
  readonly placeName?: string | null
  readonly elevationM?: number | null
  readonly featureCode?: string | null
  readonly mode?: PanelMode
}

/**
 * Insert a new panel state and return it.
 *
 * The id is random rather than sequential, so a collision is possible; the
 * insert uses `onConflictDoNothing` and retries with a fresh id rather than
 * letting a 1-in-4-billion clash surface as a 500. After `ATTEMPTS` failures
 * something other than luck is wrong and it throws.
 */
export async function createPanelState(
  userId: string,
  init: PanelStateInit,
): Promise<PanelState> {
  const ATTEMPTS = 5
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const inserted = await db
      .insert(panelStates)
      .values({
        id: newPanelStateId(),
        user_id: userId,
        location_id: init.locationId ?? null,
        lat: init.lat === null || init.lat === undefined ? null : String(init.lat),
        lon: init.lon === null || init.lon === undefined ? null : String(init.lon),
        place_name: init.placeName ?? null,
        elevation_m:
          init.elevationM === null || init.elevationM === undefined ? null : String(init.elevationM),
        feature_code: init.featureCode ?? null,
        view: init.view,
        mode: init.mode ?? 'simple',
      })
      .onConflictDoNothing()
      .returning()

    const row = inserted[0]
    if (row) return mapRow(row)
  }
  throw new Error('could not allocate a panel state id')
}

/**
 * The state behind a tapped button, or `null` when it is gone — pruned, or
 * belonging to someone else.
 *
 * Scoped by `user_id` as well as id, so an id guessed or replayed from another
 * chat reads as expired rather than opening someone else's panel. The chat check
 * in the webhook is the first gate; this is the second.
 */
export async function loadPanelState(id: string, userId: string): Promise<PanelState | null> {
  const rows = await db
    .select()
    .from(panelStates)
    .where(and(eq(panelStates.id, id), eq(panelStates.user_id, userId)))
    .limit(1)

  const row = rows[0]
  return row ? mapRow(row) : null
}

export type PanelStatePatch = {
  readonly locationId?: string | null
  readonly view?: PanelView
  readonly model?: string | null
  readonly intervalHours?: number | null
  readonly dayOffset?: number
  readonly columnSet?: string | null
  readonly units?: string
  readonly mode?: PanelMode
}

/**
 * Apply a patch and return the updated state, or `null` if the row is gone.
 *
 * Every caller re-renders from what this returns rather than from what it sent,
 * so the panel on screen is drawn from the row that was actually written.
 */
export async function updatePanelState(
  id: string,
  userId: string,
  patch: PanelStatePatch,
): Promise<PanelState | null> {
  const values: Partial<typeof panelStates.$inferInsert> = { updated_at: new Date() }
  // Assigned key by key: spreading the patch would write `undefined` for every
  // field the caller left out, and drizzle turns that into no column at all only
  // by accident of the key being absent — which a spread does not preserve.
  if ('locationId' in patch) values.location_id = patch.locationId ?? null
  if (patch.view !== undefined) values.view = patch.view
  if ('model' in patch) values.model = patch.model ?? null
  if ('intervalHours' in patch) values.interval_hours = patch.intervalHours ?? null
  if (patch.dayOffset !== undefined) values.day_offset = patch.dayOffset
  if ('columnSet' in patch) values.column_set = patch.columnSet ?? null
  if (patch.units !== undefined) values.units = patch.units
  if (patch.mode !== undefined) values.mode = patch.mode

  const updated = await db
    .update(panelStates)
    .set(values)
    .where(and(eq(panelStates.id, id), eq(panelStates.user_id, userId)))
    .returning()

  const row = updated[0]
  return row ? mapRow(row) : null
}

/**
 * Delete panel states last touched more than `maxAgeDays` ago. Returns how many
 * went.
 *
 * Driven by `updated_at`, not `created_at`: a panel someone is still tapping is
 * not stale, however long ago it was opened.
 *
 * `now` is a parameter so the check script can prove the cutoff actually cuts,
 * rather than asserting that a row created a second ago survives — which every
 * possible cutoff would satisfy.
 */
export async function prunePanelStates(
  now: Date = new Date(),
  maxAgeDays: number = PANEL_STATE_MAX_AGE_DAYS,
): Promise<number> {
  const cutoff = new Date(now.getTime() - maxAgeDays * 24 * 60 * 60 * 1000)
  const deleted = await db
    .delete(panelStates)
    .where(lt(panelStates.updated_at, cutoff))
    .returning({ id: panelStates.id })
  return deleted.length
}
