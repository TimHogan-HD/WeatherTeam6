import { modelName, type ConditionsReadings } from '@weatherteam6/types'

/**
 * Pull-to-refresh on the Conditions list: the decisions, kept pure so they are
 * tested here and the gesture in `usePullToRefresh` only moves things.
 */

/** How far the list can be pulled, however far the finger goes. */
export const PULL_MAX_PX = 96
/** Release past this and the list refreshes. */
export const PULL_ARM_PX = 64
/** Where the list rests while it refreshes. */
export const PULL_HOLD_PX = 56
/** "Refreshing…" stays at least this long, so it reads rather than flickers. */
export const PULL_MIN_REFRESH_MS = 500
/** How long the outcome stays before the list springs back. */
export const PULL_OUTCOME_MS = 900

export type PullPhase =
  | { kind: 'idle' }
  | { kind: 'pulling'; offset: number }
  | { kind: 'refreshing' }
  | { kind: 'settled'; ok: boolean }

/** The finger's travel, resisted: it gives easily at first and stops at `PULL_MAX_PX`. */
export function pullOffset(fingerPx: number): number {
  if (fingerPx <= 0) return 0
  return PULL_MAX_PX * (1 - Math.exp(-fingerPx / 140))
}

export function pullDisplacement(phase: PullPhase): number {
  switch (phase.kind) {
    case 'idle':
      return 0
    case 'pulling':
      return phase.offset
    case 'refreshing':
    case 'settled':
      return PULL_HOLD_PX
  }
}

export function pullMessage(phase: PullPhase): string | null {
  switch (phase.kind) {
    case 'idle':
      return null
    case 'pulling':
      return phase.offset >= PULL_ARM_PX ? 'Release to refresh' : 'Pull to refresh'
    case 'refreshing':
      return 'Refreshing…'
    case 'settled':
      return phase.ok ? 'Up to date' : 'Couldn’t refresh'
  }
}

/**
 * How fresh the scores on the list are: `Scores from GFS · forecast checked 4 min ago`.
 * The model and the age are separate claims: `checked_at` is the oldest check of
 * every run behind a response (the ensemble's too), not GFS's own, so it is
 * worded as the crag header words it, never as "GFS checked". The **oldest**
 * check across the cards bounds what the reader is looking at. A
 * card that has readings but no check time (an older API) makes the whole line
 * unknown, so it is withheld rather than claimed from the other cards.
 */
export function scoresFreshness(
  readings: readonly (ConditionsReadings | null | undefined)[],
  now: number,
): string | null {
  const scored = readings.flatMap((r) =>
    r != null && r.model !== null ? [{ model: r.model, checkedAt: r.checked_at }] : [],
  )
  if (scored.length === 0) return null

  let oldest = Infinity
  for (const r of scored) {
    const at = r.checkedAt == null ? NaN : Date.parse(r.checkedAt)
    if (!Number.isFinite(at)) return null
    oldest = Math.min(oldest, at)
  }

  const minutes = Math.floor((now - oldest) / 60_000)
  if (minutes < 0) return null
  const age = minutes < 1 ? 'just now' : minutes < 60 ? `${minutes} min ago` : `${Math.floor(minutes / 60)} h ago`

  const models = new Set(scored.map((r) => modelName(r.model)))
  return models.size === 1 ? `Scores from ${[...models][0]} · forecast checked ${age}` : `Forecast checked ${age}`
}
