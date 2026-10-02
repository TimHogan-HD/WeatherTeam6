import { describe, expect, it } from 'vitest'
import { backTarget } from './backTarget.js'

describe('backTarget', () => {
  it('has no back affordance on the list', () => {
    expect(backTarget({ route: 'list' })).toBeNull()
  })

  it('leaves the add flow for the list from the search step', () => {
    expect(backTarget({ route: 'add', confirming: false, browsing: false })).toEqual({ kind: 'navigate', to: '/' })
  })

  it('steps up one browse level rather than leaving the add flow', () => {
    expect(backTarget({ route: 'add', confirming: false, browsing: true })).toEqual({ kind: 'browseUp' })
  })

  it('closes a save form picked while browsing onto that level, not up past it', () => {
    expect(backTarget({ route: 'add', confirming: true, browsing: true })).toEqual({ kind: 'closeSaveForm' })
  })

  /**
   * §2: the save form is a step *inside* `/add`, not a sibling. Returning a
   * navigation here would land on a freshly mounted search screen with the
   * query and results gone — the failure the per-route table was written to
   * prevent, and one that looks like an ordinary back press until you notice
   * the typing is missing.
   */
  it('returns the add save form to its own search rather than navigating', () => {
    expect(backTarget({ route: 'add', confirming: true, browsing: false })).toEqual({ kind: 'closeSaveForm' })
  })

  /**
   * Every context that is not the list yields a control to render, and only the
   * list yields nothing. A screen with a back button that resolves to no action
   * is a control that looks ordinary and does not respond.
   */
  it('gives every non-root context a back action', () => {
    const actions = [
      backTarget({ route: 'add', confirming: false, browsing: false }),
      backTarget({ route: 'add', confirming: true, browsing: false }),
      backTarget({ route: 'add', confirming: false, browsing: true }),
    ]

    for (const action of actions) {
      expect(action).not.toBeNull()
      expect(typeof action.kind).toBe('string')
    }
  })

  it('returns feedback to the location it was opened from, else the list', () => {
    expect(backTarget({ route: 'feedback', fromLocationId: 'abc' })).toEqual({ kind: 'navigate', to: '/location/abc' })
    expect(backTarget({ route: 'feedback', fromLocationId: null })).toEqual({ kind: 'navigate', to: '/' })
  })

  it('returns a location editor to its location, saved or not', () => {
    expect(backTarget({ route: 'edit', locationId: 'abc' })).toEqual({ kind: 'navigate', to: '/location/abc' })
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
