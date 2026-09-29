import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { AreaPosition, Logbook, RecordPositionInput, RouteTick } from '@weatherteam6/types'
import { db } from '../../db/index.js'
import { areaLocations, routeTicks, routeTodos } from '../../db/schema.js'
import type { ParsedTick } from './parseLogbook.js'

type TickRow = typeof routeTicks.$inferSelect

function toTick(row: TickRow): RouteTick {
  return {
    id: row.id,
    route_id: row.route_id,
    ticked_on: row.ticked_on,
    style: row.style,
    laps: row.laps,
    note: row.note,
    created_at: row.created_at.toISOString(),
  }
}

/** The caller's ticks, newest day first and newest entry first within a day, and their to-dos. */
export async function logbookFor(userId: string): Promise<Logbook> {
  const [ticks, todos] = await Promise.all([
    db
      .select()
      .from(routeTicks)
      .where(eq(routeTicks.user_id, userId))
      .orderBy(desc(routeTicks.ticked_on), desc(routeTicks.created_at)),
    db.select({ route_id: routeTodos.route_id }).from(routeTodos).where(eq(routeTodos.user_id, userId)),
  ])
  return { ticks: ticks.map(toTick), todos: todos.map((t) => t.route_id) }
}

export async function createTick(userId: string, tick: ParsedTick): Promise<RouteTick> {
  const inserted = await db
    .insert(routeTicks)
    .values({ user_id: userId, ...tick })
    .returning()
  const row = inserted[0]
  if (!row) throw new Error('Insert returned no row')
  return toTick(row)
}

/** False when the tick does not exist or is another user's — the caller maps both to one 404. */
export async function deleteTick(userId: string, tickId: string): Promise<boolean> {
  const rows = await db
    .delete(routeTicks)
    .where(and(eq(routeTicks.id, tickId), eq(routeTicks.user_id, userId)))
    .returning({ id: routeTicks.id })
  return rows.length > 0
}

/** Idempotent: a route already on the list stays one row. */
export async function addTodo(userId: string, routeId: string): Promise<void> {
  await db.insert(routeTodos).values({ user_id: userId, route_id: routeId }).onConflictDoNothing()
}

/** Idempotent: removing a route that is not on the list is not an error. */
export async function removeTodo(userId: string, routeId: string): Promise<void> {
  await db.delete(routeTodos).where(and(eq(routeTodos.user_id, userId), eq(routeTodos.route_id, routeId)))
}

type PositionRow = Pick<typeof areaLocations.$inferSelect, 'lat' | 'lon' | 'accuracy_m' | 'recorded_at'>

/** Built field by field so `recorded_by` — another user's id — cannot ride along in a spread. */
function toPosition(row: PositionRow): AreaPosition {
  return { lat: row.lat, lon: row.lon, accuracy_m: row.accuracy_m, recorded_at: row.recorded_at.toISOString() }
}

const POSITION_COLUMNS = {
  lat: areaLocations.lat,
  lon: areaLocations.lon,
  accuracy_m: areaLocations.accuracy_m,
  recorded_at: areaLocations.recorded_at,
}

/** The later recording replaces the earlier one, whoever made either. */
export async function recordPosition(
  userId: string,
  areaId: string,
  fix: RecordPositionInput,
): Promise<AreaPosition> {
  const values = { ...fix, recorded_by: userId, recorded_at: sql`now()` }
  const rows = await db
    .insert(areaLocations)
    .values({ area_id: areaId, ...values })
    .onConflictDoUpdate({ target: areaLocations.area_id, set: values })
    .returning(POSITION_COLUMNS)
  const row = rows[0]
  if (!row) throw new Error('Upsert returned no row')
  return toPosition(row)
}

/** Recorded positions for these areas, by area id. An area nobody recorded is absent. */
export async function positionsFor(areaIds: readonly string[]): Promise<Map<string, AreaPosition>> {
  if (areaIds.length === 0) return new Map()
  const rows = await db
    .select({ area_id: areaLocations.area_id, ...POSITION_COLUMNS })
    .from(areaLocations)
    .where(inArray(areaLocations.area_id, [...areaIds]))
  return new Map(rows.map((r) => [r.area_id, toPosition(r)]))
}
