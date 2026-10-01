import { describe, it, expect } from 'vitest'
import { forecastWindow, toWindowedForecast } from './forecastWindow.js'
import type { ForecastSnapshot } from '@weatherteam6/types'

const TODAY = '2026-08-25'

function snapshot(date: string): ForecastSnapshot {
  return {
    id: `x:${date}`,
    location_id: 'x',
    captured_at: `${TODAY}T00:00:00.000Z`,
    forecast_date: date,
    precip_mm_p10: 0,
    precip_mm_p50: 0,
    precip_mm_p90: 0,
    temp_c_min: 10,
    temp_c_max: 20,
    wind_kmh_max: 5,
    humidity_pct: 40,
    model_sources: ['gfs_seamless'],
    created_at: `${TODAY}T00:00:00.000Z`,
  }
}

describe('forecastWindow', () => {
  // The state machine in .claude/rules/architecture.md: >14 days is
  // climatological only, 7-14 low confidence, <7 the full decision window.
  it('labels today and the next six days as the decision window', () => {
    expect(forecastWindow('2026-08-25', TODAY)).toBe('decision')
    expect(forecastWindow('2026-08-31', TODAY)).toBe('decision')
  })

  it('labels day 7 through day 14 as early', () => {
    expect(forecastWindow('2026-09-01', TODAY)).toBe('early')
    expect(forecastWindow('2026-09-08', TODAY)).toBe('early')
  })

  it('labels day 15 and beyond as pre', () => {
    expect(forecastWindow('2026-09-09', TODAY)).toBe('pre')
    expect(forecastWindow('2026-12-01', TODAY)).toBe('pre')
  })

  it('treats a past date as the decision window', () => {
    expect(forecastWindow('2026-08-20', TODAY)).toBe('decision')
  })

  it('is unaffected by a month boundary', () => {
    expect(forecastWindow('2026-09-01', '2026-08-25')).toBe('early')
    expect(forecastWindow('2027-01-01', '2026-12-31')).toBe('decision')
  })
})

describe('toWindowedForecast', () => {
  it('drops past days, sorts ascending, and labels each one', () => {
    const result = toWindowedForecast(
      [snapshot('2026-09-09'), snapshot('2026-08-20'), snapshot('2026-08-25'), snapshot('2026-09-01')],
      TODAY,
    )
    expect(result.map((s) => s.forecast_date)).toEqual(['2026-08-25', '2026-09-01', '2026-09-09'])
    expect(result.map((s) => s.window)).toEqual(['decision', 'early', 'pre'])
  })

  it('returns [] for an empty forecast', () => {
    expect(toWindowedForecast([], TODAY)).toEqual([])
  })

  it('does not mutate the input', () => {
    const input = [snapshot('2026-08-25')]
    toWindowedForecast(input, TODAY)
    expect(input[0]?.window).toBeUndefined()
  })
})
