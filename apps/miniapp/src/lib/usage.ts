import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import type { DetailTabKey, UsageEventInput } from '@weatherteam6/types'
import { apiPost } from './api.js'
import { insightsRoute } from './speedInsights.js'

/**
 * **The usage log** (owner, 2026-11-23; `docs/usage-log.md`, which also says
 * how to remove it): each screen and crag tab the reader opens goes to
 * `POST /usage`, named by its route pattern with no ids, query or hash.
 *
 * **No account** (owner, 2026-11-23): each report carries `VISIT`, a random id
 * made when the app loads and kept only in memory, so a reload starts a new
 * one and nothing ties two visits, or a visit, to a person.
 *
 * Fire and forget: a failed report is dropped, never retried, and never shown.
 * The reader's screen must not depend on it.
 */
const VISIT = crypto.randomUUID()

/** The routes `LocationDetail` draws, whose report carries the open tab and comes from there. */
export function reportsItsOwnTab(screen: string): boolean {
  return screen === '/location/:id' || screen.startsWith('/location/:id/wall/')
}

function report(screen: string, tab: DetailTabKey | null): void {
  // An automated browser (the nightly `check:ui` run, Playwright) is not a reader,
  // and without an account its rows could not be told apart and removed.
  if (navigator.webdriver) return
  const event: UsageEventInput = { visit: VISIT, screen, tab }
  apiPost<null>('/usage', event).catch(() => undefined)
}

/** Every signed-in screen except the crag screen, which reports through `useTabUsage`. */
export function useScreenUsage(pathname: string): void {
  const screen = insightsRoute(pathname)
  useEffect(() => {
    if (!reportsItsOwnTab(screen)) report(screen, null)
  }, [screen])
}

/**
 * Whether the crag screen's open tab is the one the reader will see, rather than
 * a stand-in while its inputs load. The location decides which tabs exist (a
 * city has no Rock or Crag), and with no tab asked for in the address or
 * picked, the saved preference decides the opening one. Until both are in,
 * the screen draws Overview, which may never have been the reader's tab.
 */
export function openingTabSettled(input: {
  locationLoaded: boolean
  /** A wall screen, a picked tab or `?tab=`: the preference plays no part. */
  tabChosen: boolean
  preferencesLoaded: boolean
}): boolean {
  return input.locationLoaded && (input.tabChosen || input.preferencesLoaded)
}

/**
 * The crag screen: once its opening tab settles, and again each time the tab
 * changes. `null` is a tab not yet settled, which reports nothing.
 */
export function useTabUsage(tab: DetailTabKey | null): void {
  const screen = insightsRoute(useLocation().pathname)
  useEffect(() => {
    if (tab !== null) report(screen, tab)
  }, [screen, tab])
}
