import { describe, expect, it } from 'vitest'
import type { Trip } from '@weatherteam6/types'
import type { TripDraft } from '../lib/tripDraft.js'
import { tripChanges } from './Trips.js'

const trip: Trip = {
  id: 't1',
  userId: 'u1',
  name: 'Red Wing',
  startDate: '2026-10-08',
  endDate: '2026-10-10',
  notes: null,
  climbHours: null,
  createdAt: '2026-10-02T00:00:00.000Z',
  updatedAt: null,
  locations: [
    { id: 'l1', tripId: 't1', locationId: 'a', createdAt: '2026-10-02T00:00:00.000Z' },
    { id: 'l2', tripId: 't1', locationId: 'b', createdAt: '2026-10-02T00:00:00.000Z' },
  ],
}
const same: TripDraft = { name: 'Red Wing', start: '2026-10-08', end: '2026-10-10', locationIds: ['b', 'a'], climbHours: null }

describe('tripChanges', () => {
  it('sends nothing when nothing changed, crags in another order included', () => {
    expect(tripChanges(trip, same)).toEqual({})
  })

  it('sends a rename alone, so the dates and with them the trend are untouched', () => {
    expect(tripChanges(trip, { ...same, name: '  Red Wing long weekend ' })).toEqual({ name: 'Red Wing long weekend' })
  })

  it('sends only the date that moved, and the crag list whole when it differs', () => {
    expect(tripChanges(trip, { ...same, end: '2026-10-11' })).toEqual({ endDate: '2026-10-11' })
    expect(tripChanges(trip, { ...same, locationIds: ['a'] })).toEqual({ cragIds: ['a'] })
    expect(tripChanges(trip, { ...same, locationIds: ['a', 'c'] })).toEqual({ cragIds: ['a', 'c'] })
  })

  it('sends climbing hours only when they differ from the saved ones', () => {
    const own = { ...trip, climbHours: { first: 12, last: 20 } }
    expect(tripChanges(trip, { ...same, climbHours: { first: 12, last: 20 } })).toEqual({ climbHours: { first: 12, last: 20 } })
    expect(tripChanges(own, { ...same, climbHours: { first: 12, last: 20 } })).toEqual({})
    expect(tripChanges(own, { ...same, climbHours: { first: 12, last: 21 } })).toEqual({ climbHours: { first: 12, last: 21 } })
    expect(tripChanges(own, { ...same, climbHours: { first: 11, last: 20 } })).toEqual({ climbHours: { first: 11, last: 20 } })
    expect(tripChanges(own, same)).toEqual({ climbHours: null })
  })

  it('reads a trip from an API without climbHours as following Profile', () => {
    const { climbHours: _, ...older } = trip
    expect(tripChanges(older as Trip, same)).toEqual({})
  })
})
