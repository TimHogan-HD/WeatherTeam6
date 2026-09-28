import {
  cliffAngleFromWallAngle,
  isCompassPoint,
  isRockType,
  ROCK_TYPES,
  WALL_ANGLE_MAX_DEG,
  WALL_ANGLE_MIN_DEG,
  type CompassPoint,
  type Location,
} from '@weatherteam6/types'
import { resolveRockType } from './resolveRockType.js'

/**
 * **`PATCH /locations/:id`, minus the database** — Phase 4b. Pure, so every
 * refusal below is reachable from the test suite; the route reads the row,
 * calls `planLocationUpdate`, and writes what it returns.
 *
 * `undefined` means "leave it alone" and `null` means "nobody has recorded
 * this", so the two are kept apart all the way to the column list.
 */
export type ParsedLocationUpdate = {
  aspect?: CompassPoint | null
  /** Climbers' convention, degrees past vertical. */
  wall_angle_deg?: number | null
  rock_type?: Location['rock_type']
}

const FIELDS = ['aspect', 'wall_angle_deg', 'rock_type'] as const

/**
 * Validate the body. **An unknown key is refused, not ignored**: a client that
 * sends `cliff_angle` — the stored column, in the opposite sign convention —
 * would otherwise get a 200 and an unchanged row, which reads as success
 * (`defect-patterns.md` §2). Naming the key in the error is what makes that
 * mistake visible on the first try.
 */
export function parseLocationUpdate(body: unknown): ParsedLocationUpdate | { error: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { error: 'Body must be a JSON object' }
  }
  const raw = body as Record<string, unknown>

  const unknown = Object.keys(raw).filter((k) => !(FIELDS as readonly string[]).includes(k))
  if (unknown.length > 0) {
    return { error: `Unsupported field(s): ${unknown.join(', ')} — editable fields are ${FIELDS.join(', ')}` }
  }
  if (!FIELDS.some((k) => k in raw)) {
    return { error: `Nothing to update — editable fields are ${FIELDS.join(', ')}` }
  }

  const out: ParsedLocationUpdate = {}

  if ('aspect' in raw) {
    const v = raw['aspect']
    if (v === null) {
      out.aspect = null
    } else {
      const point = typeof v === 'string' ? v.trim().toUpperCase() : null
      if (!isCompassPoint(point)) {
        return { error: 'aspect must be a 16-point compass direction (N, NNE, NE, … NNW) or null' }
      }
      out.aspect = point
    }
  }

  if ('wall_angle_deg' in raw) {
    const v = raw['wall_angle_deg']
    if (v === null) {
      out.wall_angle_deg = null
    } else if (
      typeof v !== 'number' ||
      !Number.isFinite(v) ||
      v < WALL_ANGLE_MIN_DEG ||
      v > WALL_ANGLE_MAX_DEG
    ) {
      return {
        error: `wall_angle_deg must be degrees past vertical between ${WALL_ANGLE_MIN_DEG} (flat) and ${WALL_ANGLE_MAX_DEG} (roof), or null`,
      }
    } else {
      out.wall_angle_deg = v
    }
  }

  if ('rock_type' in raw) {
    const v = raw['rock_type']
    if (v === null) {
      out.rock_type = null
    } else if (!isRockType(v)) {
      return { error: `rock_type must be one of ${ROCK_TYPES.join(', ')}, or null` }
    } else {
      out.rock_type = v
    }
  }

  return out
}

/** The stored row, as far as the plan needs it. */
export type UpdatableLocation = {
  lat: number
  lon: number
  is_climbing_location: boolean
  rock_type: Location['rock_type']
  known_crag: string | null
}

/** The columns to write. Absent keys are not touched. */
export type LocationColumnUpdate = {
  aspect?: string | null
  cliff_angle?: string | null
  rock_type?: Location['rock_type']
  known_crag?: string | null
}

export type LocationUpdatePlan =
  | { ok: true; columns: LocationColumnUpdate }
  | { ok: false; status: 409; error: string }

/**
 * Decide what to write, or why not.
 *
 * - **A location that is not a crag takes no wall facts.** A value for any of
 *   the three is refused; `null` is accepted, because clearing a field is never
 *   wrong. The v2 model is never asked about such a location, so a stored
 *   aspect there would be dead data reasoned about as live
 *   (`defect-patterns.md` §10).
 * - **A known crag's rock type is locked** (`architecture.md`, owner decision
 *   2026-09-23). Sending the locked value back is accepted, because an editor
 *   that submits every field should not fail on the one it did not change;
 *   anything else is refused rather than silently kept, so the caller learns
 *   why the change did not take.
 * - **An unlocked rock type still goes through `resolveRockType`**, the one
 *   place the lock is applied. A row saved before its crag joined
 *   `KNOWN_CRAGS` (and before `locations:lock-known-crags` ran) locks here, and
 *   takes the research's type rather than the one requested — the same rule
 *   `POST /locations` applies.
 */
export function planLocationUpdate(
  row: UpdatableLocation,
  update: ParsedLocationUpdate,
): LocationUpdatePlan {
  if (!row.is_climbing_location) {
    const setsValue = FIELDS.some((k) => update[k] !== undefined && update[k] !== null)
    if (setsValue) {
      return {
        ok: false,
        status: 409,
        error: 'Not a climbing location — aspect, wall angle and rock type apply only to a crag',
      }
    }
  }

  const columns: LocationColumnUpdate = {}

  if (update.aspect !== undefined) columns.aspect = update.aspect

  if (update.wall_angle_deg !== undefined) {
    columns.cliff_angle =
      update.wall_angle_deg === null ? null : String(cliffAngleFromWallAngle(update.wall_angle_deg))
  }

  if (update.rock_type !== undefined) {
    if (row.known_crag !== null) {
      if (update.rock_type !== row.rock_type) {
        return {
          ok: false,
          status: 409,
          error: `Rock type is locked for this known crag (${row.known_crag})`,
        }
      }
    } else {
      const resolved = resolveRockType({
        lat: row.lat,
        lon: row.lon,
        is_climbing_location: row.is_climbing_location,
        rock_type: update.rock_type,
      })
      columns.rock_type = resolved.rock_type
      columns.known_crag = resolved.known_crag
    }
  }

  return { ok: true, columns }
}
