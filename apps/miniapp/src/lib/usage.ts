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

/** The crag screen: once on opening, and again each time the tab changes. */
export function useTabUsage(tab: DetailTabKey): void {
  const screen = insightsRoute(useLocation().pathname)
  useEffect(() => {
    report(screen, tab)
  }, [screen, tab])
}
