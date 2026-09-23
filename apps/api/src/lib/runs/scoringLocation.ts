import { compassDegrees, parseNumeric, parseNumericRequired, type RockType } from '@weatherteam6/types'
import type { WallOrientation } from '../scoring/rockThermal.js'

/**
 * The crag facts the v2 readings need, or **null when this location is not a
 * crag**.
 *
 * Threaded through rather than read downstream, because the caller is the only
 * thing that knows `is_climbing_location` — and passing it is the whole
 * protection. See `hourlySeries.BuildInput.scoring`.
 *
 * `cliffAngleDeg` feeds the drying window and may be the 45 placeholder;
 * `wall` is the recorded geometry and is null unless **both** aspect and angle
 * were recorded. Keeping them apart is what stops a defaulted angle from being
 * read as a measured wall.
 */
export type ScoringLocation = {
  rockType: RockType
  cliffAngleDeg: number
  wall: WallOrientation | null
} | null

/** The columns `scoringLocationFor` reads, as the database returns them. */
export type ScoringLocationRow = {
  lat: string
  lon: string
  is_climbing_location: boolean
  rock_type: RockType | null
  aspect: string | null
  cliff_angle: string | null
}

/**
 * **The substitute for an unrecorded angle** — what the rest of the app has
 * always used. It is a placeholder, not a guess anyone made about a crag
 * (`climbing-terminology-research.md` §6.1 argues for vertical instead), and
 * changing it moves every unedited location's drying window, which is a model
 * decision rather than part of the editor.
 */
export const DEFAULT_CLIFF_ANGLE_DEG = 45

/**
 * **One implementation for every route that scores a location** —
 * `/hourly`, `/conditions` and `check:conditions` each hand-rolled the same two
 * fallbacks, and the recorded wall is a third thing they would have had to
 * agree on.
 *
 * - `rock_type` null → `unknown`, the slowest window: caution, not a guess.
 * - `cliff_angle` null → `DEFAULT_CLIFF_ANGLE_DEG` for drying, and **no wall**.
 * - `aspect` not one of the 16 compass points → **no wall**. `aspectToDegrees`
 *   would answer 180 for it, which is a fabricated south face.
 */
export function scoringLocationFor(row: ScoringLocationRow): ScoringLocation {
  if (!row.is_climbing_location) return null

  const recordedAngle = parseNumeric(row.cliff_angle)
  const angle = recordedAngle !== null && Number.isFinite(recordedAngle) ? recordedAngle : null
  const aspectDeg = compassDegrees(row.aspect)

  return {
    rockType: row.rock_type ?? 'unknown',
    cliffAngleDeg: angle ?? DEFAULT_CLIFF_ANGLE_DEG,
    wall:
      angle !== null && aspectDeg !== null
        ? {
            lat: parseNumericRequired(row.lat),
            lon: parseNumericRequired(row.lon),
            aspectDeg,
            cliffAngleDeg: angle,
          }
        : null,
  }
}
