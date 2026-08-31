/**
 * The payload a panel button carries back: `<verb>:<stateId>` or
 * `<verb>:<stateId>:<field>=<value>`.
 *
 * **Pure** — no database, no env, no Express — so the encoding can be tested
 * directly, and so the route module stays a dispatcher.
 *
 * Telegram's ceiling is **64 bytes**, and it is bytes, not characters: a button
 * label is UTF-8 and so is this. Everything past the ceiling is rejected with a
 * 400 for the whole message, so `encodeAction` returns `null` and the row
 * builder drops the button — the *omit, never approximate* rule `alertKeyboard`
 * already follows. A button that cannot be built correctly costs one control; a
 * malformed one costs the entire panel.
 *
 * The state id does the heavy lifting. A panel has a view, a model, an interval,
 * a day offset, a column set, units and a mode; none of that fits in 64 bytes,
 * so the button names the row and the single field it changes, and `panelState`
 * reads back the rest.
 */

/** Telegram's documented `callback_data` limit, in bytes. */
export const CALLBACK_DATA_MAX_BYTES = 64

/** Matches the id `panelState.ts` generates: 8 lowercase hex characters. */
const STATE_ID_RE = /^[0-9a-f]{8}$/

/** Short, lowercase, no separators — the separators are what frame the payload. */
const VERB_RE = /^[a-z]{1,8}$/

const FIELD_RE = /^[a-z_]{1,12}$/

/**
 * Deliberately excludes `:` and `=`. A value carrying either would decode into a
 * different action than the one encoded, and the widest value this needs to
 * carry is a uuid — hex plus dashes.
 */
const VALUE_RE = /^[A-Za-z0-9_.-]{1,36}$/

export type CallbackAction = {
  readonly verb: string
  readonly stateId: string
  /** `null` for a verb that changes nothing but the render, e.g. `refresh`. */
  readonly field: string | null
  readonly value: string | null
}

/**
 * The wire form of an action, or `null` when it cannot be produced correctly —
 * an id that is not a state id, a value carrying a separator, or a payload over
 * the byte ceiling.
 */
export function encodeAction(
  verb: string,
  stateId: string,
  field?: string,
  value?: string,
): string | null {
  if (!VERB_RE.test(verb)) return null
  if (!STATE_ID_RE.test(stateId)) return null

  let data: string
  if (field === undefined && value === undefined) {
    data = `${verb}:${stateId}`
  } else {
    // Half a pair is a caller bug, not a defaultable case: `field` with no
    // `value` would encode `f=` and decode back to an empty string, which reads
    // as a real selection of nothing.
    if (field === undefined || value === undefined) return null
    if (!FIELD_RE.test(field)) return null
    if (!VALUE_RE.test(value)) return null
    data = `${verb}:${stateId}:${field}=${value}`
  }

  // Bytes, not `.length`. Every character above is ASCII today, so the two agree;
  // measuring bytes is what keeps that true if a value ever carries a place name.
  if (Buffer.byteLength(data, 'utf8') > CALLBACK_DATA_MAX_BYTES) return null
  return data
}

/**
 * Parse a payload that arrived from Telegram, or `null` if it is not one this
 * build produces.
 *
 * Everything here is attacker-shaped input in the general case and
 * deploy-shaped input in practice: a button tapped after a redeploy carries a
 * verb this build may no longer know. `null` means the caller says "expired"
 * rather than guessing at what was meant.
 */
export function decodeAction(data: string): CallbackAction | null {
  if (Buffer.byteLength(data, 'utf8') > CALLBACK_DATA_MAX_BYTES) return null

  const parts = data.split(':')
  if (parts.length !== 2 && parts.length !== 3) return null

  const [verb, stateId, pair] = parts
  if (verb === undefined || stateId === undefined) return null
  if (!VERB_RE.test(verb)) return null
  if (!STATE_ID_RE.test(stateId)) return null

  if (pair === undefined) return { verb, stateId, field: null, value: null }

  const eq = pair.indexOf('=')
  if (eq < 0) return null
  const field = pair.slice(0, eq)
  const value = pair.slice(eq + 1)
  if (!FIELD_RE.test(field)) return null
  if (!VALUE_RE.test(value)) return null

  return { verb, stateId, field, value }
}
