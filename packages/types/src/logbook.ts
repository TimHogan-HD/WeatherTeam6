/**
 * The logbook — a climber's own ticks and to-dos on guidebook routes — and the
 * boulder positions climbers record from their phones.
 *
 * Routes and areas are OpenBeta's and live in the API's committed snapshot, so
 * everything here is keyed by an OpenBeta uuid rather than a row of ours.
 *
 * **Ticks and to-dos belong to one account; positions belong to every
 * account** (owner decision 2026-09-29). A position is one row per area and a
 * later recording replaces the earlier one. Who recorded it never leaves the
 * API: it is another user's id.
 */

export const TICK_STYLES = ['send', 'flash', 'onsight', 'attempt'] as const
export type TickStyle = (typeof TICK_STYLES)[number]

export const TICK_STYLE_LABEL: Record<TickStyle, string> = {
  send: 'Send',
  flash: 'Flash',
  onsight: 'Onsight',
  attempt: 'Attempt',
}

export function isTickStyle(v: unknown): v is TickStyle {
  return typeof v === 'string' && (TICK_STYLES as readonly string[]).includes(v)
}

/** Longest tick note accepted, in characters. */
export const TICK_NOTE_MAX = 1000

export type RouteTick = {
  id: string
  /** OpenBeta's climb uuid. */
  route_id: string
  /** The climber's local calendar day, `YYYY-MM-DD`. */
  ticked_on: string
  style: TickStyle
  /** Null when not entered — not zero laps. */
  laps: number | null
  note: string | null
  created_at: string
}

export type CreateTickInput = {
  route_id: string
  ticked_on: string
  style: TickStyle
  laps?: number | null
  note?: string | null
}

/** `GET /logbook` — the caller's ticks, newest day first, and the route ids on their to-do list. */
export type Logbook = {
  ticks: RouteTick[]
  todos: string[]
}

/**
 * Where a boulder actually is, recorded from a phone standing at it. **Never
 * OpenBeta's own point**, which is inherited from parent areas and was wrong on
 * the ground at Barn Bluff.
 */
export type AreaPosition = {
  lat: number
  lon: number
  /** The phone's own accuracy estimate, metres. */
  accuracy_m: number
  recorded_at: string
}

export type RecordPositionInput = {
  lat: number
  lon: number
  accuracy_m: number
}

/**
 * The roughest fix the API accepts, metres. **A judgement call, not a
 * measurement**: a fix worse than this will not find a boulder in a talus
 * field, and a rough position shared with every account is worse than none.
 */
export const POSITION_ACCURACY_MAX_M = 50
