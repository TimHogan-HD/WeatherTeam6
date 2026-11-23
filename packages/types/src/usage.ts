/**
 * **The usage log** (owner, 2026-11-23): which screens and crag tabs get
 * opened, and when, to see what the app's screens are actually used for
 * before the next redesign. Temporary by design: `docs/usage-log.md` lists
 * every file it touches and how to remove it.
 *
 * **No account is stored** (owner, 2026-11-23). `visit` is a random id the app
 * makes each time it opens and keeps only in memory, so one visit's events can
 * be put in order (for a rough time on each screen) without saying whose.
 *
 * A screen is named by its route pattern (`/location/:id/wall/:id`), never the
 * address: no ids, no query, no hash (`/join#<code>` carries an invite code).
 */
import { isDetailTab, type DetailTabKey } from './preferences.js'

export type UsageEventInput = {
  /** A random v4 uuid per app launch; never an account. */
  visit: string
  screen: string
  /** The crag screen's open tab; null on every other screen. */
  tab: DetailTabKey | null
}

/** Longer than any route in the app; a cap, not a format. */
export const USAGE_SCREEN_MAX = 64

const SCREEN_PATTERN = /^\/$|^(\/([a-z]+|:id))+$/
const VISIT_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

/** The body of `POST /usage`, or null if it is not one. */
export function parseUsageEvent(v: unknown): UsageEventInput | null {
  if (typeof v !== 'object' || v === null) return null
  const { visit, screen, tab } = v as Record<string, unknown>
  if (typeof visit !== 'string' || !VISIT_PATTERN.test(visit)) return null
  if (typeof screen !== 'string' || screen.length > USAGE_SCREEN_MAX || !SCREEN_PATTERN.test(screen)) return null
  if (tab === null || tab === undefined) return { visit, screen, tab: null }
  return isDetailTab(tab) ? { visit, screen, tab } : null
}
