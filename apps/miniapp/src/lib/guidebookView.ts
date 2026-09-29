import {
  ROCK_LABELS,
  windowValue,
  type Guidebook,
  type GuidebookRoute,
  type GuidebookWall,
  type HourlySeries,
  type RockLevel,
  type RouteKind,
} from '@weatherteam6/types'
import { shortDay } from './overview.js'

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

/** One day of "Climb it this week": its good hours and how dry the rock reads. */
export type WeekRow = { local_date: string; title: string; hours: string; rock: RockLevel | null; rockLabel: string | null }

/**
 * The days the readings reach, from today. **The good hours are the crag's**,
 * the same `window` the Daily tab reads, and the dryness is the day's
 * representative hour — never recomputed here. A day before today is dropped:
 * the run's first local day is routinely the tail of one already past.
 */
export function weekRows(series: HourlySeries, todayDate: string): WeekRow[] {
  const days = series.readings?.days ?? []
  return days
    .filter((d) => d.local_date >= todayDate)
    .map((d) => {
      const rock = d.best?.rock?.level ?? null
      return {
        local_date: d.local_date,
        title: shortDay(d.local_date, todayDate),
        hours: windowValue(d.window, series.utc_offset_seconds),
        rock,
        rockLabel: rock === null ? null : ROCK_LABELS[rock],
      }
    })
}
