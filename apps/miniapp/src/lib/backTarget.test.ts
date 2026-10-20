import { describe, expect, it } from 'vitest'
import { backTarget, OPENED_FROM_MAP, openedFromMap } from './backTarget.js'

describe('backTarget', () => {
  it('has no back affordance on the list', () => {
    expect(backTarget({ route: 'list' })).toBeNull()
  })

  it('leaves the add flow for the list from the search step', () => {
    expect(backTarget({ route: 'add', confirming: false, browsing: false, fromMap: false, forTrip: null })).toEqual({ kind: 'navigate', to: '/' })
  })

  it('steps up one browse level rather than leaving the add flow', () => {
    expect(backTarget({ route: 'add', confirming: false, browsing: true, fromMap: false, forTrip: null })).toEqual({ kind: 'browseUp' })
  })

  it('closes a save form picked while browsing onto that level, not up past it', () => {
    expect(backTarget({ route: 'add', confirming: true, browsing: true, fromMap: false, forTrip: null })).toEqual({ kind: 'closeSaveForm' })
  })

  /**
   * §2: the save form is a step *inside* `/add`, not a sibling. Returning a
   * navigation here would land on a freshly mounted search screen with the
   * query and results gone — the failure the per-route table was written to
   * prevent, and one that looks like an ordinary back press until you notice
   * the typing is missing.
   */
  it('returns the add save form to its own search rather than navigating', () => {
    expect(backTarget({ route: 'add', confirming: true, browsing: false, fromMap: false, forTrip: null })).toEqual({ kind: 'closeSaveForm' })
  })

  /**
   * A form the map opened has no search behind it: closing it onto an empty
   * search would strand the reader on a screen they never chose.
   */
  it('returns a save form opened from the map to the map', () => {
    expect(backTarget({ route: 'add', confirming: true, browsing: false, fromMap: true, forTrip: null })).toEqual({
      kind: 'navigate',
      to: '/map',
    })
  })

  /** Opened from a trip's "Add a crag", the search returns to that trip's form, not the list. */
  it('returns the search to the trip it was opened from', () => {
    expect(backTarget({ route: 'add', confirming: false, browsing: false, fromMap: false, forTrip: '/trips/new' })).toEqual({
      kind: 'navigate',
      to: '/trips/new',
    })
    expect(backTarget({ route: 'add', confirming: true, browsing: false, fromMap: false, forTrip: '/trips/new' })).toEqual({
      kind: 'closeSaveForm',
    })
    expect(backTarget({ route: 'add', confirming: false, browsing: true, fromMap: false, forTrip: '/trips/new' })).toEqual({
      kind: 'browseUp',
    })
  })

  it('leaves the search for the list once the map’s form is closed', () => {
    expect(backTarget({ route: 'add', confirming: false, browsing: false, fromMap: true, forTrip: null })).toEqual({
      kind: 'navigate',
      to: '/',
    })
  })

  /**
   * Every context that is not the list yields a control to render, and only the
   * list yields nothing. A screen with a back button that resolves to no action
   * is a control that looks ordinary and does not respond.
   */
  it('gives every non-root context a back action', () => {
    const actions = [
      backTarget({ route: 'add', confirming: false, browsing: false, fromMap: false, forTrip: null }),
      backTarget({ route: 'add', confirming: true, browsing: false, fromMap: false, forTrip: null }),
      backTarget({ route: 'add', confirming: false, browsing: true, fromMap: false, forTrip: null }),
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

  it('returns a trip and the new-trip form to the trips list, and one crag of a trip to that trip', () => {
    expect(backTarget({ route: 'trip' })).toEqual({ kind: 'navigate', to: '/trips' })
    expect(backTarget({ route: 'tripNew' })).toEqual({ kind: 'navigate', to: '/trips' })
    expect(backTarget({ route: 'tripCrag', tripId: 't1' })).toEqual({ kind: 'navigate', to: '/trips/t1' })
  })

  it('returns the trip editor to its trip, not the list', () => {
    expect(backTarget({ route: 'tripEdit', tripId: 't1' })).toEqual({ kind: 'navigate', to: '/trips/t1' })
  })
})

describe('backTarget — a saved location, its app bar away', () => {
  it('returns to the map when a pin opened it', () => {
    expect(backTarget({ route: 'location', fromMap: openedFromMap({ ...OPENED_FROM_MAP }) })).toEqual({
      kind: 'navigate',
      to: '/map',
    })
  })

  it('returns to the list from anywhere else, including a reload with no state', () => {
    for (const state of [null, undefined, {}, { from: 'list' }, 'map']) {
      expect(backTarget({ route: 'location', fromMap: openedFromMap(state) })).toEqual({ kind: 'navigate', to: '/' })
    }
  })
})

