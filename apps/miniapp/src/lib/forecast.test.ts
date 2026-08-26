import { describe, expect, it, vi } from 'vitest'
import type { ForecastSnapshot, WeatherAlert } from '@weatherteam6/types'
import {
  findToday,
  forecastSourceLabel,
  formatForecastDate,
  rainfallSourceLabel,
  severeAlertEvent,
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
    expect(forecastSourceLabel([day('2026-08-25', ['nbm'])])).toBe('Open-Meteo (nbm)')
    expect(forecastSourceLabel([day('2026-08-25', ['gfs_seamless', 'ecmwf_ifs025'])])).toBe(
      'Open-Meteo (gfs_seamless, ecmwf_ifs025)',
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
      'Open-Meteo (nbm)',
    )
  })
})

describe('rainfallSourceLabel', () => {
  it('branches on the station, because the API does', () => {
    expect(rainfallSourceLabel('KLAS')).toBe('ACIS (KLAS)')
    expect(rainfallSourceLabel(null)).toBe('Open-Meteo archive')
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

  it('reports a Severe+ event for the suppression rule and ignores lesser ones', () => {
    expect(severeAlertEvent([alert('Extreme Heat Warning', 'Extreme')])).toBe('Extreme Heat Warning')
    expect(severeAlertEvent([alert('Wind Advisory', 'Moderate')])).toBeNull()
    expect(severeAlertEvent([])).toBeNull()
    expect(severeAlertEvent(undefined)).toBeNull()
  })
})
