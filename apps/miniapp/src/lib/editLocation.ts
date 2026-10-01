import { type Location, type RockType, type UpdateLocationInput } from '@weatherteam6/types'

/**
 * The location editor's state and the one decision it makes: what to send.
 * Pure, so it is reachable from a test with no DOM.
 *
 * **Only the rock type is edited.** A crag-wide aspect and angle were here
 * (#285) and came out: a crag has many walls, so one direction and one angle
 * describe none of them. They come back tied to the guidebook's walls. The API
 * still accepts both on `PATCH /locations/:id`.
 */
export type EditDraft = {
  rockType: RockType
}

/**
 * Whether the rock type is the research's rather than the reader's. An absent
 * `known_crag` (an older API) reads as unlocked, as on the facts card.
 */
export function rockLocked(location: Location): boolean {
  return location.known_crag !== null && location.known_crag !== undefined
}

/** The saved row, as the form shows it. A rock type nobody recorded is `unknown`, which the picker calls "Not sure". */
export function draftFrom(location: Location): EditDraft {
  return { rockType: location.rock_type ?? 'unknown' }
}

/**
 * **Only a change is sent**, and a locked rock type never is — the API would
 * accept the locked value back, but there is nothing for it to do.
 *
 * Null means nothing changed; the Save control is off.
 */
export function updateFor(location: Location, draft: EditDraft): UpdateLocationInput | null {
  if (rockLocked(location) || draft.rockType === draftFrom(location).rockType) return null
  return { rock_type: draft.rockType }
}
