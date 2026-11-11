import { describe, expect, it, vi } from 'vitest'
import type { ForecastSnapshot, WeatherAlert } from '@weatherteam6/types'
import {
  ALERTS_CHECK_STALE_MS,
  alertParagraphs,
  alertUntil,
  alertsUnchecked,
  findToday,
  forecastSourceLabel,
  formatForecastDate,
  sortBySeverity,
} from './forecast.js'

function day(date: string, models: string[] | null = null): ForecastSnapshot {
  return {
    id: `snap-${date}`,
    location_id: 'loc',
    captured_at: `${date}T00:00:00.000Z`,
    forecast_date: date,
    precip_mm_p10: null,
    precip_mm_p50: null,
    precip_mm_p90: null,
    temp_c_min: null,
    temp_c_max: null,
    wind_kmh_max: null,
    humidity_pct: null,
    model_sources: models,
    created_at: `${date}T00:00:00.000Z`,
  }
}

function alert(event: string, severity: string): WeatherAlert {
  return {
    id: `${event}-${severity}`,
    location_id: 'loc',
    nws_alert_id: 'nws',
    event,
    severity,
    certainty: 'Likely',
    headline: null,
    description: null,
    effective: null,
    expires: null,
    created_at: '2026-08-25T00:00:00.000Z',
  }
}

describe('findToday', () => {
  /** A row as the API now sends it, with the server's is_today decision. */
  function flagged(date: string, isToday: boolean): ForecastSnapshot {
    return { ...day(date), is_today: isToday }
  }

  it('takes the row the server flagged, whatever the client clock says', () => {
    const rows = [flagged('2026-08-25', true), flagged('2026-08-26', false)]
    expect(findToday(rows)?.forecast_date).toBe('2026-08-25')
  })

  it('trusts the flag over the date — this is the whole point of #33', () => {
    // Las Vegas at 18:00 local on the 25th is already the 26th in UTC. The old
    // client compared against its own UTC date and picked the 26th: tomorrow's
    // high, rendered as today's. The server says otherwise and wins.
    const rows = [flagged('2026-08-25', true), flagged('2026-08-26', false)]
    const realNow = new Date('2026-08-26T01:00:00.000Z')
    vi.setSystemTime(realNow)
    expect(findToday(rows)?.forecast_date).toBe('2026-08-25')
    vi.useRealTimers()
  })

  it('returns null when the feed starts at tomorrow, rather than the first row', () => {
    // Returning rows[0] here would relabel tomorrow's numbers as today's, which
    // is a factual error, not a fallback.
    const rows = [flagged('2026-08-26', false), flagged('2026-08-27', false)]
    expect(findToday(rows)).toBeNull()
  })

  it('falls back to the UTC date when no row carries the flag at all', () => {
    // A response cached from before #33 shipped. A missing flag is unknown, not
    // false — treating it as false would blank the hero for every such feed.
    vi.setSystemTime(new Date('2026-08-25T12:00:00.000Z'))
    const rows = [day('2026-08-25'), day('2026-08-26')]
    expect(findToday(rows)?.forecast_date).toBe('2026-08-25')
    vi.useRealTimers()
  })

  it('returns null for undefined and empty data', () => {
    expect(findToday(undefined)).toBeNull()
    expect(findToday([])).toBeNull()
  })
})

describe('formatForecastDate', () => {
  it('formats in UTC so the label matches the bucket it came from', () => {
    // A local-timezone render of 2026-08-25 west of Greenwich shows Aug 24.
    expect(formatForecastDate('2026-08-25')).toBe('Tue, Aug 25')
    expect(formatForecastDate('2026-01-01')).toBe('Thu, Jan 1')
  })

  it('passes an unparseable value through rather than rendering Invalid Date', () => {
    expect(formatForecastDate('not-a-date')).toBe('not-a-date')
  })
})

describe('forecastSourceLabel', () => {
  it('names the models the response actually reports', () => {
    expect(forecastSourceLabel([day('2026-08-25', ['nbm'])])).toBe('Open-Meteo · NBM')
    expect(forecastSourceLabel([day('2026-08-25', ['gfs_seamless', 'ecmwf_ifs025'])])).toBe(
      'Open-Meteo · GFS, ECMWF',
    )
  })

  it('names nothing rather than guessing when the response says nothing', () => {
    // Naming a source that never ran is a false attribution — the exact thing
    // the "quote data sources by name" rule exists to prevent.
    expect(forecastSourceLabel([day('2026-08-25', null)])).toBeNull()
    expect(forecastSourceLabel([day('2026-08-25', [])])).toBeNull()
    expect(forecastSourceLabel(undefined)).toBeNull()
  })

  it('skips rows with no models and reports the first that has them', () => {
    expect(forecastSourceLabel([day('2026-08-25', []), day('2026-08-26', ['nbm'])])).toBe(
      'Open-Meteo · NBM',
    )
  })
})

describe('alert ranking', () => {
  it('sorts Severe and Extreme ahead of the rest', () => {
    const sorted = sortBySeverity([
      alert('Wind Advisory', 'Moderate'),
      alert('Extreme Heat Warning', 'Extreme'),
    ])
    expect(sorted[0]?.event).toBe('Extreme Heat Warning')
  })
})

describe('alertsUnchecked', () => {
  const now = Date.parse('2026-11-03T18:00:00Z')

  it('says nothing for an older API that sends no stamp', () => {
    expect(alertsUnchecked(undefined, now)).toBe(false)
  })

  it('is unchecked for a place NWS was never asked about', () => {
    expect(alertsUnchecked(null, now)).toBe(true)
  })

  it('is checked up to the limit and unchecked just past it', () => {
    expect(alertsUnchecked(new Date(now - ALERTS_CHECK_STALE_MS).toISOString(), now)).toBe(false)
    expect(alertsUnchecked(new Date(now - ALERTS_CHECK_STALE_MS - 1000).toISOString(), now)).toBe(true)
  })

  it('reads an unparseable stamp as unchecked, never as fresh', () => {
    expect(alertsUnchecked('not a date', now)).toBe(true)
  })
})

describe('alertUntil', () => {
  const CDT = -5 * 3600
  // 2026-07-10 15:00 local.
  const now = Date.parse('2026-07-10T20:00:00Z')

  it('names the hour alone for an end later the same local day', () => {
    expect(alertUntil('2026-07-11T02:00:00Z', CDT, now)).toBe('Until 9 PM')
  })

  it('reads the day on the crag\'s clock, not UTC: 11:30 PM local is still today though UTC is tomorrow', () => {
    expect(alertUntil('2026-07-11T04:30:00Z', CDT, now)).toBe('Until 11:30 PM')
    expect(alertUntil('2026-07-11T05:00:00Z', CDT, now)).toBe('Until Sat 12 AM')
  })

  it('names the weekday inside a week and the date beyond it', () => {
    expect(alertUntil('2026-07-12T23:00:00Z', CDT, now)).toBe('Until Sun 6 PM')
    expect(alertUntil('2026-07-20T23:00:00Z', CDT, now)).toBe('Until Jul 20, 6 PM')
  })

  it('says an end already behind now ended, never a past "until"', () => {
    expect(alertUntil('2026-07-10T19:00:00Z', CDT, now)).toBe('Ended 2 PM')
  })

  it('withholds the line with no end, no crag offset, or an unreadable time', () => {
    expect(alertUntil(null, CDT, now)).toBeNull()
    expect(alertUntil(undefined, CDT, now)).toBeNull()
    expect(alertUntil('2026-07-11T02:00:00Z', null, now)).toBeNull()
    expect(alertUntil('2026-07-11T02:00:00Z', Number.NaN, now)).toBeNull()
    expect(alertUntil('not a time', CDT, now)).toBeNull()
  })
})

describe('alertParagraphs', () => {
  it('joins NWS\'s hard wraps and keeps its blank-line breaks', () => {
    expect(alertParagraphs('* WHAT...Heavy\nrain.\n\n* WHEN...Until\r\nmidnight.\n \n')).toEqual([
      '* WHAT...Heavy rain.',
      '* WHEN...Until midnight.',
    ])
  })

  it('is empty for a missing or blank field', () => {
    expect(alertParagraphs(null)).toEqual([])
    expect(alertParagraphs(undefined)).toEqual([])
    expect(alertParagraphs(' \n\n ')).toEqual([])
  })
})
