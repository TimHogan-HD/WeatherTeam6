import { describe, expect, it } from 'vitest'
import type { ForecastSnapshot, WeatherAlert } from '@weatherteam6/types'
import {
  findToday,
  forecastSourceLabel,
  formatForecastDate,
  rainfallSourceLabel,
  severeAlertEvent,
  sortBySeverity,
  todayUtcIso,
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

describe('todayUtcIso', () => {
  it('uses the UTC date, matching how the API buckets its days', () => {
    // Late evening in Las Vegas is already the next day in UTC. The client must
    // agree with the API's definition or it looks for a row that is not there —
    // the underlying wrongness for the user is tracked as §10.5.
    expect(todayUtcIso(new Date('2026-08-25T23:30:00.000Z'))).toBe('2026-08-25')
    expect(todayUtcIso(new Date('2026-08-26T00:30:00.000Z'))).toBe('2026-08-26')
  })
})

describe('findToday', () => {
  const now = new Date('2026-08-25T12:00:00.000Z')

  it('finds the row whose forecast_date is today', () => {
    const rows = [day('2026-08-25'), day('2026-08-26')]
    expect(findToday(rows, now)?.forecast_date).toBe('2026-08-25')
  })

  it('returns null when the feed starts at tomorrow, rather than the first row', () => {
    // Returning rows[0] here would relabel tomorrow's numbers as today's, which
    // is a factual error, not a fallback.
    const rows = [day('2026-08-26'), day('2026-08-27')]
    expect(findToday(rows, now)).toBeNull()
  })

  it('returns null for undefined and empty data', () => {
    expect(findToday(undefined, now)).toBeNull()
    expect(findToday([], now)).toBeNull()
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
