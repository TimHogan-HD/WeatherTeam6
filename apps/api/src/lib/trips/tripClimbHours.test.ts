import { describe, expect, it } from 'vitest'
import { climbHourColumns, climbHoursFromQuery, isTripClimbHours, tripClimbHours } from './tripClimbHours.js'

describe('isTripClimbHours', () => {
  it('takes null and a valid pair', () => {
    expect(isTripClimbHours(null)).toBe(true)
    expect(isTripClimbHours({ first: 0, last: 2 })).toBe(true)
  })

  it('refuses undefined, a missing end and a two-hour span', () => {
    expect(isTripClimbHours(undefined)).toBe(false)
    expect(isTripClimbHours({ first: 8 })).toBe(false)
    expect(isTripClimbHours({ first: 8, last: 9 })).toBe(false)
  })
})

describe('climbHoursFromQuery', () => {
  it('is the Profile hours when neither param is sent', () => {
    expect(climbHoursFromQuery({})).toEqual({ ok: true, hours: null })
    expect(climbHoursFromQuery({ models: 'all' })).toEqual({ ok: true, hours: null })
  })

  it('reads both params as whole hours', () => {
    expect(climbHoursFromQuery({ climbFirst: '12', climbLast: '20' })).toEqual({
      ok: true,
      hours: { first: 12, last: 20 },
    })
  })

  it('refuses one without the other', () => {
    expect(climbHoursFromQuery({ climbFirst: '12' })).toEqual({ ok: false })
    expect(climbHoursFromQuery({ climbLast: '20' })).toEqual({ ok: false })
  })

  it('refuses a fraction, a sign, a repeated param, an hour past 23 and a short span', () => {
    expect(climbHoursFromQuery({ climbFirst: '8.5', climbLast: '18' })).toEqual({ ok: false })
    expect(climbHoursFromQuery({ climbFirst: '-1', climbLast: '18' })).toEqual({ ok: false })
    expect(climbHoursFromQuery({ climbFirst: ['8', '9'], climbLast: '18' })).toEqual({ ok: false })
    expect(climbHoursFromQuery({ climbFirst: '20', climbLast: '24' })).toEqual({ ok: false })
    expect(climbHoursFromQuery({ climbFirst: '12', climbLast: '13' })).toEqual({ ok: false })
  })
})

describe('tripClimbHours and climbHourColumns', () => {
  it('round-trip a pair, and null as two nulls', () => {
    expect(tripClimbHours(climbHourColumns({ first: 6, last: 11 }))).toEqual({ first: 6, last: 11 })
    expect(climbHourColumns(null)).toEqual({ climb_first_hour: null, climb_last_hour: null })
    expect(tripClimbHours({ climb_first_hour: null, climb_last_hour: null })).toBeNull()
  })

  it('reads hour 0 as an hour, not as unset', () => {
    expect(tripClimbHours({ climb_first_hour: 0, climb_last_hour: 5 })).toEqual({ first: 0, last: 5 })
  })
})
