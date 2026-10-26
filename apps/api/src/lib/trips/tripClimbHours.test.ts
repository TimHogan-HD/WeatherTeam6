import { describe, expect, it } from 'vitest'
import {
  climbHourColumns,
  climbHoursFromQuery,
  climbHoursNeeded,
  climbHoursOn,
  daysUnderTripHours,
  isTripClimbHours,
  tripClimbHours,
} from './tripClimbHours.js'

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

describe('recording each trip date under its trip hours', () => {
  const PROFILE = { first: 8, last: 18 }
  const MORNING = { first: 6, last: 11 }
  const EVENING = { first: 14, last: 21 }
  // Two trips at one crag: mornings on the 1st-3rd, evenings on the 3rd-5th, so
  // the 3rd is covered by both and they disagree. A third follows Profile.
  const trips = [
    { start: '2026-11-01', end: '2026-11-03', climbHours: MORNING },
    { start: '2026-11-03', end: '2026-11-05', climbHours: EVENING },
    { start: '2026-11-07', end: '2026-11-07', climbHours: null },
  ]
  const dates = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']
  const series = [MORNING, EVENING, PROFILE].map((hours) => ({
    hours,
    days: dates.map((local_date) => ({ local_date, readUnder: `${hours.first}-${hours.last}` })),
  }))

  it('reads one series per distinct hours, plus Profile hours for a date two trips disagree on', () => {
    expect(climbHoursNeeded(trips, PROFILE)).toEqual([MORNING, EVENING, PROFILE])
    expect(climbHoursNeeded(trips.slice(0, 1), PROFILE)).toEqual([MORNING])
    expect(climbHoursNeeded([trips[0]!, { ...trips[1]!, start: '2026-11-04' }], PROFILE)).toEqual([MORNING, EVENING])
  })

  it("picks each date from its own trip's series, and the disagreed date from Profile's", () => {
    const picked = daysUnderTripHours(series, trips, PROFILE)
    expect(picked.map((d) => [d.local_date, d.readUnder])).toEqual([
      ['2026-11-01', '6-11'],
      ['2026-11-02', '6-11'],
      ['2026-11-03', '8-18'],
      ['2026-11-04', '14-21'],
      ['2026-11-05', '14-21'],
      ['2026-11-06', '8-18'],
      ['2026-11-07', '8-18'],
    ])
  })

  it('leaves out a date no trip covers when no Profile-hours series was read', () => {
    const own = series.slice(0, 2)
    const picked = daysUnderTripHours(own, [trips[0]!, { ...trips[1]!, start: '2026-11-04' }], PROFILE)
    expect(picked.map((d) => d.local_date)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'])
    expect(picked.find((d) => d.local_date === '2026-11-03')?.readUnder).toBe('6-11')
  })

  it('treats two trips with the same own hours as agreeing', () => {
    const same = [trips[0]!, { ...trips[1]!, climbHours: { ...MORNING } }]
    expect(climbHoursOn('2026-11-03', same, PROFILE)).toEqual(MORNING)
    expect(climbHoursNeeded(same, PROFILE)).toEqual([MORNING])
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
