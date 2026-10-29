import { describe, expect, it } from 'vitest'
import type { HourlySeries } from '@weatherteam6/types'
import { dayReadingsFor } from './TripScreen.js'

// Partial fixture: only the fields `dayReadingsFor` reads.
const series = (unavailable_reason: string | null = null) =>
  ({
    utc_offset_seconds: -18000,
    readings: { model: 'gfs_seamless', unavailable_reason, hours: [], days: [] },
  }) as unknown as HourlySeries

describe('dayReadingsFor', () => {
  it('reads the days and the offset off /hourly, and nothing else', () => {
    // Owner, 2026-10-29: no alert withholds a trip day's score, so nothing about
    // alerts reaches the trip screen's readings.
    expect(dayReadingsFor({ data: series() })).toEqual({ days: [], utcOffsetSeconds: -18000 })
  })

  it('has nothing to score with while /hourly is in flight or failed, or when the model did not answer', () => {
    expect(dayReadingsFor({ data: undefined })).toBeNull()
    expect(dayReadingsFor({ data: series('model_unavailable') })).toBeNull()
  })
})
