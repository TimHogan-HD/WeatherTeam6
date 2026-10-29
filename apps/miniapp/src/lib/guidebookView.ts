import {
  type ForecastSnapshot,
  type Guidebook,
  type GuidebookRoute,
  type GuidebookWall,
  type RouteKind,
} from '@weatherteam6/types'
import { scoredDays, type DayReadings, type NextDay } from './overview.js'

/**
 * The guidebook screens' decisions, apart from their layout so a node test can
 * reach them (`vitest.config.ts` has no DOM).
 */

/** The kinds a wall's filter offers, in a fixed order, only those it has. */
export const FILTER_KINDS: readonly RouteKind[] = ['sport', 'trad', 'tr', 'boulder']

export type KindFilter = 'all' | RouteKind

export function filterByKind(routes: readonly GuidebookRoute[], kind: KindFilter): GuidebookRoute[] {
  return kind === 'all' ? [...routes] : routes.filter((r) => r.kinds.includes(kind))
}

/** A wall and its 1-based place on the crag, or null when the id is not one of its walls. */
export function findWall(
  guide: Guidebook,
  wallId: string,
): { wall: GuidebookWall; number: number } | null {
  const i = guide.walls.findIndex((w) => w.id === wallId)
  const wall = guide.walls[i]
  return wall === undefined ? null : { wall, number: i + 1 }
}

/**
 * The Mountain Project page OpenBeta imported this route or area from. Null
 * when there is no id — and **no link is drawn then**, rather than a search
 * that might land on a different route of the same name.
 */
export function mountainProjectUrl(mpId: string | null, kind: 'route' | 'area'): string | null {
  if (mpId === null || !/^\d+$/.test(mpId)) return null
  return `https://www.mountainproject.com/${kind}/${mpId}`
}

/** Mountain Project's Android package, as its own `assetlinks.json` names it. */
const MP_ANDROID_PACKAGE = 'com.mountainproject.android'

/**
 * The link to draw for a Mountain Project page on this device — **the app when
 * it is installed, the web page when it is not.**
 *
 * - **Android** gets an `intent:` URL naming the app's package, with the web
 *   page as `browser_fallback_url`. A plain https link does not reach the app:
 *   measured 2026-09-29, Brave opened it in its own in-app tab without offering
 *   it to the installed app, though MP publishes verified app links.
 * - **iOS and everything else** get the plain https URL. MP's
 *   `apple-app-site-association` is `{}`, so no link can open its iPhone app,
 *   and a guessed custom scheme would fail with nothing to fall back to.
 */
export function mountainProjectHref(webUrl: string, userAgent: string): string {
  if (!/\bAndroid\b/i.test(userAgent)) return webUrl
  const u = new URL(webUrl)
  return (
    `intent://${u.host}${u.pathname}#Intent;scheme=https;package=${MP_ANDROID_PACKAGE};` +
    `S.browser_fallback_url=${encodeURIComponent(webUrl)};end`
  )
}

export const openBetaClimbUrl = (id: string): string => `https://openbeta.io/climbs/${id}`

/** How many days a wall's week reaches. */
export const WALL_WEEK_DAYS = 7

/**
 * A wall's week: up to seven days from today, each scored through
 * `scoredDays` — the Daily tab's join on the date, so a
 * day cannot wear a different number here. **The crag's reading**: no wall has
 * one of its own. A day before today is dropped: the forecast's first local day
 * can be the tail of one already past.
 */
export function wallWeek(
  forecast: readonly ForecastSnapshot[],
  todayDate: string,
  readings: DayReadings | null,
): NextDay[] {
  const rows = [...forecast]
    .filter((r) => r.forecast_date >= todayDate)
    .sort((a, b) => a.forecast_date.localeCompare(b.forecast_date))
    .slice(0, WALL_WEEK_DAYS)
  return scoredDays(rows, readings)
}
