import { describe, expect, it } from 'vitest'
import { backTarget } from './backTarget.js'

describe('backTarget', () => {
  it('has no back affordance on the list', () => {
    expect(backTarget({ route: 'list' })).toBeNull()
  })

  it('leaves a saved location for the list from the Overview tab', () => {
    expect(backTarget({ route: 'detail', tab: 'overview' })).toEqual({ kind: 'navigate', to: '/' })
  })

  it('steps back to Overview from Daily, Rock and Crag', () => {
    for (const tab of ['daily', 'rock', 'crag'] as const) {
      expect(backTarget({ route: 'detail', tab })).toEqual({ kind: 'showTab', tab: 'overview' })
    }
  })

  /**
   * The acceptance criterion for the whole affordance. Under Telegram, back on
   * the Hourly tab closed the Mini App outright unless the tab was popped
   * first; in a browser the equivalent mistake is leaving the location. Either
   * way the user loses the screen they are reading to dismiss a tab.
   */
  it('pops the Hourly tab rather than leaving the location', () => {
    expect(backTarget({ route: 'detail', tab: 'hourly' })).toEqual({ kind: 'showTab', tab: 'daily' })
  })

  it('leaves the add flow for the list from the search step', () => {
    expect(backTarget({ route: 'add', previewing: false })).toEqual({ kind: 'navigate', to: '/' })
  })

  /**
   * §2: the preview is a step *inside* `/add`, not a sibling. Returning a
   * navigation here would land on a freshly mounted search screen with the
   * query and results gone — the failure the per-route table was written to
   * prevent, and one that looks like an ordinary back press until you notice
   * the typing is missing.
   */
  it('returns the add preview to its own search rather than navigating', () => {
    expect(backTarget({ route: 'add', previewing: true })).toEqual({ kind: 'closePreview' })
  })

  /**
   * Every context that is not the list yields a control to render, and only the
   * list yields nothing. A screen with a back button that resolves to no action
   * is a control that looks ordinary and does not respond.
   */
  it('gives every non-root context a back action', () => {
    const actions = [
      backTarget({ route: 'detail', tab: 'overview' }),
      backTarget({ route: 'detail', tab: 'daily' }),
      backTarget({ route: 'detail', tab: 'rock' }),
      backTarget({ route: 'detail', tab: 'crag' }),
      backTarget({ route: 'detail', tab: 'hourly' }),
      backTarget({ route: 'add', previewing: false }),
      backTarget({ route: 'add', previewing: true }),
    ]

    for (const action of actions) {
      expect(action).not.toBeNull()
      expect(typeof action.kind).toBe('string')
    }
  })

  /**
   * The overloads are the real guard — a route is handed only the kinds it can
   * receive, so its `switch` is exhaustive without a `never` check and a new
   * kind is a type error rather than a silent no-op. Types are erased at
   * runtime, so this asserts the same separation as a value: neither route may
   * be handed the other's in-route action.
   */
  it('never hands one route the other route in-place action', () => {
    const detail = [
      backTarget({ route: 'detail', tab: 'daily' }),
      backTarget({ route: 'detail', tab: 'hourly' }),
    ]
    const add = [
      backTarget({ route: 'add', previewing: false }),
      backTarget({ route: 'add', previewing: true }),
    ]

    expect(detail.map((a) => a.kind)).not.toContain('closePreview')
    expect(add.map((a) => a.kind)).not.toContain('showDailyTab')
  })
})

describe('backTarget — the guidebook screens', () => {
  it('returns a wall to the Crag tab it was opened from, not to Overview', () => {
    expect(backTarget({ route: 'wall', locationId: 'loc' })).toEqual({
      kind: 'navigate',
      to: '/location/loc?tab=crag',
    })
  })

  it('returns a route to its own wall', () => {
    expect(backTarget({ route: 'climb', locationId: 'loc', wallId: 'w' })).toEqual({
      kind: 'navigate',
      to: '/location/loc/wall/w',
    })
  })
})
