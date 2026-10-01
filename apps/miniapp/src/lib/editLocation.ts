import {
  isCompassPoint,
  wallAngleFromCliffAngle,
  type CompassPoint,
  type Location,
  type RockType,
  type UpdateLocationInput,
} from '@weatherteam6/types'

/**
 * The location editor's state and the one decision it makes: which fields to
 * send. Pure, so it is reachable from a test with no DOM.
 */
export type EditDraft = {
  rockType: RockType
  aspect: CompassPoint | null
  /** Climbers' degrees past vertical; null is "not recorded". */
  wallAngle: number | null
}

/**
 * Whether the rock type is the research's rather than the reader's. An absent
 * `known_crag` (an older API) reads as unlocked, as on the facts card.
 */
export function rockLocked(location: Location): boolean {
  return location.known_crag !== null && location.known_crag !== undefined
}

/**
 * The saved row, as the form shows it.
 *
 * - A rock type nobody recorded is `unknown`, which the picker calls "Not sure".
 * - **An aspect that is not one of the 16 points opens as unrecorded.** The
 *   column is free text from before `PATCH` existed; the model already ignores
 *   anything else (`compassDegrees`), so the form says what the model sees.
 * - The angle is converted from the stored column here and nowhere else in the
 *   client, through `wallAngle.ts`.
 */
export function draftFrom(location: Location): EditDraft {
  const aspect = location.aspect?.trim().toUpperCase() ?? null
  return {
    rockType: location.rock_type ?? 'unknown',
    aspect: isCompassPoint(aspect) ? aspect : null,
    wallAngle: wallAngleFromCliffAngle(location.cliff_angle),
  }
}

/**
 * **Only what changed is sent**, compared with what the form opened on. So an
 * untouched free-text aspect is left alone rather than cleared, and a locked
 * rock type is never sent at all — the API would accept the locked value back,
 * but there is nothing for it to do.
 *
 * Null means nothing changed; the Save control is off.
 */
export function updateFor(location: Location, draft: EditDraft): UpdateLocationInput | null {
  const before = draftFrom(location)
  const out: UpdateLocationInput = {}
  if (!rockLocked(location) && draft.rockType !== before.rockType) out.rock_type = draft.rockType
  if (draft.aspect !== before.aspect) out.aspect = draft.aspect
  if (draft.wallAngle !== before.wallAngle) out.wall_angle_deg = draft.wallAngle
  return Object.keys(out).length === 0 ? null : out
}

/**
 * Starting points a climber names a wall by; the slider fine-tunes from there.
 * A judgement call, not a classification the model reads.
 */
export const WALL_ANGLE_PRESETS: readonly { label: string; deg: number }[] = [
  { label: 'Slab', deg: -20 },
  { label: 'Vertical', deg: 0 },
  { label: 'Overhang', deg: 30 },
  { label: 'Roof', deg: 90 },
]

/** The slider's step, degrees. Nobody measures a crag closer than this. */
export const WALL_ANGLE_STEP = 5
