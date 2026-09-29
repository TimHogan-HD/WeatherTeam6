import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EM_DASH } from '@weatherteam6/types'
import { formatAccuracyFt, formatTickDate, geolocationErrorLine, localDateString, mapsHref } from './logbook.js'

describe('localDateString', () => {
  const tz = process.env['TZ']
  beforeEach(() => {
    process.env['TZ'] = 'America/Chicago'
  })
  afterEach(() => {
    process.env['TZ'] = tz
  })

  it('is the local day, not the UTC day, on a Minnesota evening', () => {
    // 21:30 in Red Wing on Sep 29 is already Sep 30 in UTC.
    const evening = Date.parse('2026-09-30T02:30:00Z')
    expect(localDateString(evening)).toBe('2026-09-29')
    expect(new Date(evening).toISOString().slice(0, 10)).toBe('2026-09-30')
  })

  it('pads the month and day', () => {
    expect(localDateString(Date.parse('2026-03-05T18:00:00Z'))).toBe('2026-03-05')
  })
})

describe('formatTickDate', () => {
  it('reads the stored day as that calendar day', () => {
    expect(formatTickDate('2026-09-29')).toMatch(/29/)
    expect(formatTickDate('2026-09-29')).not.toMatch(/28/)
  })

  it('dashes a value that is not a date', () => {
    expect(formatTickDate('yesterday')).toBe(EM_DASH)
  })
})

describe('formatAccuracyFt', () => {
  it('converts metres to whole feet', () => {
    expect(formatAccuracyFt(8)).toBe('±26 ft')
    expect(formatAccuracyFt(50)).toBe('±164 ft')
  })

  it('dashes a missing or nonsense accuracy rather than printing ±0 ft', () => {
    expect(formatAccuracyFt(null)).toBe(EM_DASH)
    expect(formatAccuracyFt(0)).toBe(EM_DASH)
    expect(formatAccuracyFt(Number.NaN)).toBe(EM_DASH)
  })
})

describe('mapsHref', () => {
  it('searches Google Maps for the point', () => {
    expect(mapsHref(44.5662, -92.5302)).toBe('https://www.google.com/maps/search/?api=1&query=44.5662,-92.5302')
  })
})

describe('geolocationErrorLine', () => {
  it('says something different for denied, unavailable and timeout', () => {
    const lines = [1, 2, 3].map(geolocationErrorLine)
    expect(new Set(lines).size).toBe(3)
    expect(lines[0]).toMatch(/denied/)
    expect(lines[2]).toMatch(/Timed out/)
  })
})
