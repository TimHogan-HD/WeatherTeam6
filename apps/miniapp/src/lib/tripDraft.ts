/**
 * **A half-filled trip form, carried through `/add` and back** (owner,
 * 2026-10-19: "locations can be added from trip screen").
 *
 * The trip form's "Add a crag" opens the ordinary add flow rather than a second
 * copy of it. The form's draft rides in router state both ways: out as
 * `{ forTrip }`, so `/add` knows where back and Save return to, and home as
 * `{ tripDraft }`, with the new crag ticked on a save. Router state is
 * `unknown` — a reload or a hand-typed URL brings none, and an old entry in the
 * history can bring any shape — so each read goes through a parser that
 * answers null rather than trusting it.
 */

export type TripDraft = { name: string; start: string; end: string; locationIds: string[] }

/** What the trip form hands `/add`: where to return, and the draft to return with. */
export type ForTrip = { returnTo: string; draft: TripDraft }

const isString = (v: unknown): v is string => typeof v === 'string'

function parseDraft(v: unknown): TripDraft | null {
  if (typeof v !== 'object' || v === null) return null
  const d = v as Record<string, unknown>
  if (!isString(d.name) || !isString(d.start) || !isString(d.end)) return null
  if (!Array.isArray(d.locationIds) || !d.locationIds.every(isString)) return null
  return { name: d.name, start: d.start, end: d.end, locationIds: [...d.locationIds] }
}

/** `/add`'s router state, if a trip form opened it. */
export function forTripFromState(state: unknown): ForTrip | null {
  if (typeof state !== 'object' || state === null) return null
  const f = (state as Record<string, unknown>).forTrip
  if (typeof f !== 'object' || f === null) return null
  const { returnTo, draft } = f as Record<string, unknown>
  // Only a trip form's own path: router state is not a redirect anyone may set.
  if (!isString(returnTo) || !/^\/trips\/(new|[0-9a-f-]+\/edit)$/.test(returnTo)) return null
  const parsed = parseDraft(draft)
  return parsed === null ? null : { returnTo, draft: parsed }
}

/** A trip form's router state on its return from `/add`, if it carries a draft. */
export function tripDraftFromState(state: unknown): TripDraft | null {
  if (typeof state !== 'object' || state === null) return null
  return parseDraft((state as Record<string, unknown>).tripDraft)
}

/** The draft with a just-saved crag ticked, once. */
export function withCrag(draft: TripDraft, locationId: string): TripDraft {
  return draft.locationIds.includes(locationId) ? draft : { ...draft, locationIds: [...draft.locationIds, locationId] }
}
