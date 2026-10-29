import { describe, expect, it } from 'vitest'
import type { HourlySeries, WeatherAlert } from '@weatherteam6/types'
import { dayReadingsFor } from './TripScreen.js'

// Partial fixture: only the fields `dayReadingsFor` reads.
const hourly = {
  data: {
    utc_offset_seconds: 0,
    readings: { model: 'gfs_seamless', unavailable_reason: null, hours: [], days: [] },
  } as unknown as HourlySeries,
}
const alerts = (over: Partial<{ data: readonly WeatherAlert[] | undefined; isPending: boolean; isError: boolean }>) => ({
  data: undefined,
  isPending: false,
  isError: false,
  ...over,
})

describe('dayReadingsFor', () => {
  it('scores once the alerts query has answered with no alerts', () => {
    expect(dayReadingsFor(hourly, alerts({ data: [] }))?.alertsPending).toBe(false)
  })

  it('withholds the score while the alerts query is in flight', () => {
    expect(dayReadingsFor(hourly, alerts({ isPending: true }))?.alertsPending).toBe(true)
  })

  it('withholds the score when the alerts query failed, so a failure never reads as "no alerts"', () => {
    // A failed query has no data and is not pending; before, this scored as if NWS had said all clear.
    const r = dayReadingsFor(hourly, alerts({ isError: true }))
    expect(r?.severeAlertEvent).toBeNull()
    expect(r?.alertsPending).toBe(true)
  })
})
