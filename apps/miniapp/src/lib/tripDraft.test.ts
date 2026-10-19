import { describe, expect, it } from 'vitest'
import { forTripFromState, tripDraftFromState, withCrag, type TripDraft } from './tripDraft.js'

const draft: TripDraft = { name: 'Creek week', start: '2026-11-01', end: '2026-11-07', locationIds: ['a'] }
const EDIT = '/trips/3f2a9c1e-0000-4000-8000-000000000001/edit'

describe('forTripFromState', () => {
  it('reads what the trip form sends, for a new trip and for an edit', () => {
    expect(forTripFromState({ forTrip: { returnTo: '/trips/new', draft } })).toEqual({ returnTo: '/trips/new', draft })
    expect(forTripFromState({ forTrip: { returnTo: EDIT, draft } })?.returnTo).toBe(EDIT)
  })

  it('answers null for no state, as after a reload', () => {
    expect(forTripFromState(null)).toBeNull()
    expect(forTripFromState(undefined)).toBeNull()
    expect(forTripFromState({})).toBeNull()
  })

  it('refuses a return path that is not a trip form', () => {
    for (const returnTo of ['/', '/trips', 'https://example.com', '//example.com/trips/new', '/trips/new/../x']) {
      expect(forTripFromState({ forTrip: { returnTo, draft } }), returnTo).toBeNull()
    }
  })

  it('refuses a draft of the wrong shape', () => {
    expect(forTripFromState({ forTrip: { returnTo: '/trips/new', draft: { ...draft, locationIds: [1] } } })).toBeNull()
    expect(forTripFromState({ forTrip: { returnTo: '/trips/new', draft: { ...draft, end: null } } })).toBeNull()
  })
})

describe('tripDraftFromState', () => {
  it('reads the draft brought home, and nothing else', () => {
    expect(tripDraftFromState({ tripDraft: draft })).toEqual(draft)
    expect(tripDraftFromState({ forTrip: { returnTo: '/trips/new', draft } })).toBeNull()
    expect(tripDraftFromState(null)).toBeNull()
  })
})

describe('withCrag', () => {
  it('ticks the new crag after the ones already picked', () => {
    expect(withCrag(draft, 'b').locationIds).toEqual(['a', 'b'])
  })

  it('never ticks one twice', () => {
    expect(withCrag(draft, 'a').locationIds).toEqual(['a'])
  })
})
