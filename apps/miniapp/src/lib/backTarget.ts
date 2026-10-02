/**
 * Where "back" goes, as data rather than as three copies of an `if`.
 *
 * Until Phase 2 of `docs/handoffs/leave-telegram-v1.md` this was Telegram's
 * `BackButton`, registered per route by `useBackButton`. There is no
 * `BackButton` in an ordinary browser, so the in-app arrow that
 * `miniapp-design-v1.md` §2 and §8 forbade is now required — but the per-route
 * table in §2 is unchanged and is what this encodes:
 *
 * | Route | Back |
 * | --- | --- |
 * | `/` list | hidden |
 * | `/add` search | `/` |
 * | `/add` save form | the search or browse level it was picked from, intact |
 * | `/add` save form opened from the map | `/map` |
 * | `/add` browsing a state | one level up; the state list returns to the search |
 * | `/feedback` | the location it was opened from, else `/` |
 * | `/location/:id/edit` | that location |
 * | `/trips/new`, `/trips/:tripId` | `/trips` |
 * | `/trips/:tripId/crag/:locationId` | that trip |
 *
 * A saved location has no back control since the bottom bar arrived (owner,
 * 2026-09-30): its Conditions tab returns to the list, and a tab change is
 * state inside the route, so the old Hourly-to-Daily step is the Daily tab.
 *
 * The add save form is not a navigation at all: it is state inside `/add`, and
 * sending it to a URL discards the search the user can see on screen. That is
 * why this returns an *action* rather than a path — a function returning
 * `string | null` cannot express it.
 *
 * Pure on purpose. `vitest.config.ts` is `environment: 'node'` with no DOM and
 * components are checked with `renderToStaticMarkup`, so each decision is
 * reachable by a test only if it is separable from the click that triggers it.
 */

import type { DetailTab } from '../components/DetailView.js'

/** Which screen the user is looking at, including the in-route state back must see. */
export type BackContext =
  | { route: 'list' }
  | { route: 'add'; confirming: boolean; browsing: boolean; fromMap: boolean }
  | { route: 'feedback'; fromLocationId: string | null }
  | { route: 'wall'; locationId: string }
  | { route: 'climb'; locationId: string; wallId: string }
  | { route: 'edit'; locationId: string }
  | { route: 'tripNew' }
  | { route: 'trip' }
  | { route: 'tripCrag'; tripId: string }

/**
 * `null` means no back affordance at all — the list is the root, and the app
 * has nowhere above it to go. It is not "go to `/`"; rendering a control that
 * navigates to the screen already showing is the second-affordance bug §2
 * describes, just with the destination wrong instead of the count.
 */
export type Navigate = { kind: 'navigate'; to: string }
export type AddBack = Navigate | { kind: 'closeSaveForm' } | { kind: 'browseUp' }

export type BackAction = null | AddBack

/**
 * Overloaded so each route is handed **only the actions it can receive**, and
 * the `if`/`switch` at the call site is therefore exhaustive without saying so.
 *
 * The single-signature version returned the whole union, so a route's dispatch
 * ended in an `if` that silently did nothing for any kind it did not know
 * about. Adding a fourth action would have compiled everywhere and produced a
 * back control that looks ordinary and does not respond — the failure class
 * this repo keeps finding, where correct-looking code says nothing at all. With
 * these signatures it is a type error in the route that has not been updated.
 */
export function backTarget(context: { route: 'list' }): null
export function backTarget(context: { route: 'add'; confirming: boolean; browsing: boolean; fromMap: boolean }): AddBack
export function backTarget(context: { route: 'feedback'; fromLocationId: string | null }): Navigate
export function backTarget(context: { route: 'wall'; locationId: string }): Navigate
export function backTarget(context: { route: 'climb'; locationId: string; wallId: string }): Navigate
export function backTarget(context: { route: 'edit'; locationId: string }): Navigate
export function backTarget(context: { route: 'tripNew' }): Navigate
export function backTarget(context: { route: 'trip' }): Navigate
export function backTarget(context: { route: 'tripCrag'; tripId: string }): Navigate
export function backTarget(context: BackContext): BackAction {
  switch (context.route) {
    case 'list':
      return null
    case 'add':
      // A point long-pressed on the map opened the form directly, with no
      // search behind it to return to.
      if (context.confirming && context.fromMap) return { kind: 'navigate', to: '/map' }
      // The save form closes first, onto the browse level it was picked from.
      if (context.confirming) return { kind: 'closeSaveForm' }
      return context.browsing ? { kind: 'browseUp' } : { kind: 'navigate', to: '/' }
    case 'feedback':
      // Opened from a crag's "Check this forecast", back returns to that crag
      // rather than dropping the reader at the list.
      return { kind: 'navigate', to: context.fromLocationId === null ? '/' : `/location/${context.fromLocationId}` }
    // The guidebook screens each step out one level: a route to its wall, a
    // wall to the Crag tab it was opened from — not to Overview, which would
    // lose the reader's place in the crag.
    case 'wall':
      return { kind: 'navigate', to: cragTabPath(context.locationId) }
    case 'climb':
      return { kind: 'navigate', to: wallPath(context.locationId, context.wallId) }
    case 'edit':
      return { kind: 'navigate', to: `/location/${context.locationId}` }
    case 'tripNew':
    case 'trip':
      return { kind: 'navigate', to: '/trips' }
    // One crag of a several-crag trip steps back to the trip's grid, not the list.
    case 'tripCrag':
      return { kind: 'navigate', to: tripPath(context.tripId) }
  }
}

export const tripPath = (tripId: string): string => `/trips/${tripId}`
export const tripCragPath = (tripId: string, locationId: string): string => `${tripPath(tripId)}/crag/${locationId}`
export const NEW_TRIP_PATH = '/trips/new'

/** A crag's Hourly tab, opened on one day. */
export const hourlyDayPath = (locationId: string, localDate: string): string =>
  `${detailTabPath(locationId, 'hourly')}&date=${localDate}`

/**
 * The guidebook's URLs, spelled once. The wall and route screens are real
 * routes rather than states inside `/location/:id`, so a route can be shared
 * or reloaded. The Crag tab is `?tab=crag`, which the detail screen reads as
 * its opening tab.
 */
export const cragTabPath = (locationId: string): string => detailTabPath(locationId, 'crag')
export const wallPath = (locationId: string, wallId: string): string =>
  `/location/${locationId}/wall/${wallId}`
export const climbPath = (locationId: string, wallId: string, routeId: string): string =>
  `${wallPath(locationId, wallId)}/route/${routeId}`
export const editPath = (locationId: string): string => `/location/${locationId}/edit`
export const detailTabPath = (locationId: string, tab: DetailTab): string => `/location/${locationId}?tab=${tab}`
