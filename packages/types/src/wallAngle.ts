import type { RockType } from './index.js'

/**
 * **Wall angle as a climber says it, and the column that stores it backwards.**
 *
 * `climbing-terminology-research.md` §1: `locations.cliff_angle` puts vertical
 * at 0 and runs *positive into slab* (90 is flat ground), while climbers and
 * gyms put vertical at 0 and run *positive into overhang* — a "40° wall" is
 * steep. Same zero, opposite sign. §5's recommendation is convention B for
 * anything a human enters or reads, so that is what the API speaks:
 *
 * | `wall_angle_deg` | means | `cliff_angle` |
 * | --- | --- | --- |
 * | −90 | flat ground | 90 |
 * | −20 | slab | 20 |
 * | 0 | vertical | 0 |
 * | 30 | overhanging | −30 |
 * | 90 | roof | −90 |
 *
 * The column keeps its own convention, extended past vertical with negatives,
 * rather than being migrated: every reader of it (`dryingModel`,
 * `hourlyConditions`, `rockThermal.skyCoolingC`) already means "0 vertical, 90
 * slab", and a rename would move all of them at once for no change in meaning.
 * These two functions are the only place the sign flips, so it cannot be
 * flipped twice.
 */

/** Flat ground, in climbers' convention. */
export const WALL_ANGLE_MIN_DEG = -90
/** A roof — horizontal, facing the ground. */
export const WALL_ANGLE_MAX_DEG = 90

/** `locations.cliff_angle` → degrees past vertical. Null stays null: an unset angle is not vertical. */
export function wallAngleFromCliffAngle(cliffAngle: number | null): number | null {
  if (cliffAngle === null || !Number.isFinite(cliffAngle)) return null
  // `-0` would serialise as 0 but compare oddly in a test; vertical is 0.
  return cliffAngle === 0 ? 0 : -cliffAngle
}

/** Degrees past vertical → `locations.cliff_angle`. */
export function cliffAngleFromWallAngle(wallAngle: number): number {
  return wallAngle === 0 ? 0 : -wallAngle
}

/**
 * **A wall angle in words a climber reads one way only**: `Vertical`,
 * `20° slab`, `30° overhang`, `Flat`, `Roof`. A bare `20°` is read as an
 * overhang by a climber and as a slab by the stored column, so the side of
 * vertical is always named. Takes climbers' degrees; null is unrecorded.
 */
export function wallAngleLabel(wallAngle: number | null): string | null {
  if (wallAngle === null || !Number.isFinite(wallAngle)) return null
  const deg = Math.round(wallAngle)
  if (deg === 0) return 'Vertical'
  if (deg <= WALL_ANGLE_MIN_DEG) return 'Flat'
  if (deg >= WALL_ANGLE_MAX_DEG) return 'Roof'
  return deg < 0 ? `${-deg}° slab` : `${deg}° overhang`
}

/**
 * The body of `PATCH /api/v1/locations/:id`. Every field is optional and an
 * absent field is left alone; **`null` clears it**, which is how a wrong
 * recorded value is taken back to "nobody has recorded this".
 *
 * - `aspect` — the direction the wall faces, one of the 16 `COMPASS_POINTS`.
 * - `wall_angle_deg` — degrees past vertical, climbers' convention (above).
 * - `rock_type` — refused on a location with `known_crag` set; the research's
 *   rock type is locked there.
 *
 * All three are refused on a location that is not a climbing location: a town
 * saved for its weather has no wall to describe.
 */
export type UpdateLocationInput = {
  aspect?: string | null
  wall_angle_deg?: number | null
  rock_type?: RockType | null
}
