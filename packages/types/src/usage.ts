/**
 * **The usage log** (owner, 2026-11-23): which screens and crag tabs each
 * account opens, and when, to see what the app's screens are actually used
 * for before the next redesign. Temporary by design: `docs/usage-log.md`
 * lists every file it touches and how to remove it.
 *
 * A screen is named by its route pattern (`/location/:id/wall/:id`), never the
 * address: no ids, no query, no hash (`/join#<code>` carries an invite code).
 */
import { isDetailTab, type DetailTabKey } from './preferences.js'

export type UsageEventInput = {
  screen: string
  /** The crag screen's open tab; null on every other screen. */
  tab: DetailTabKey | null
}

/** Longer than any route in the app; a cap, not a format. */
export const USAGE_SCREEN_MAX = 64

const SCREEN_PATTERN = /^\/$|^(\/([a-z]+|:id))+$/

/** The body of `POST /usage`, or null if it is not one. */
export function parseUsageEvent(v: unknown): UsageEventInput | null {
  if (typeof v !== 'object' || v === null) return null
  const { screen, tab } = v as Record<string, unknown>
  if (typeof screen !== 'string' || screen.length > USAGE_SCREEN_MAX || !SCREEN_PATTERN.test(screen)) return null
  if (tab === null || tab === undefined) return { screen, tab: null }
  return isDetailTab(tab) ? { screen, tab } : null
}
