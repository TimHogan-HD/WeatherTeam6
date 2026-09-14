import { describe, it, expect } from 'vitest'
import { forecastWindow, toWindowedForecast } from './forecastWindow.js'
import type { ConditionsScore, ForecastSnapshot } from '@weatherteam6/types'

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

// ---------------------------------------------------------------------------
// Per-day scores (Phase 1b)
// ---------------------------------------------------------------------------

function score(date: string, over: Partial<ConditionsScore> = {}): ConditionsScore {
  return {
    id: `s:${date}`,
    location_id: 'x',
    forecast_date: date,
    score: 72,
    confidence: 'high',
    component_drying_time: 40,
    component_upcoming_rain: 20,
    component_wind: 12,
    component_temp: 8,
    component_humidity: 6,
    score_breakdown: null,
    computed_at: `${TODAY}T00:00:00.000Z`,
    created_at: `${TODAY}T00:00:00.000Z`,
    ...over,
  }
}

describe('toWindowedForecast — per-day scores', () => {
  it('attaches no score field at all when no merge is given', () => {
    // This is the whole protection for a non-climbing location: the route omits
    // the argument. If a score ever leaks onto a city it will be because someone
    // made this default to merging.
    const [row] = toWindowedForecast([snapshot(TODAY)], TODAY)
    expect(row).toBeDefined()
    expect(row && 'score' in row).toBe(false)
    expect(row && 'component_drying_time' in row).toBe(false)
  })

  it('joins on forecast_date, not array position', () => {
    // The scores arrive in a different order and are missing the first day.
    // A positional merge would put day 2's score on day 1 and be wrong on every
    // row after it, while still producing a plausible-looking response.
    const rows = toWindowedForecast(
      [snapshot('2026-08-25'), snapshot('2026-08-26'), snapshot('2026-08-27')],
      TODAY,
      { scores: [score('2026-08-27', { score: 33 }), score('2026-08-26', { score: 55 })] },
    )
    expect(rows.map((r) => r.score)).toEqual([null, 55, 33])
  })

  it('carries every component through, because suppression needs them', () => {
    // `summarizeConditions` reads these via `limitingComponent`. Shipping `score`
    // alone leaves the "a component is 0" trigger permanently unreachable.
    const [row] = toWindowedForecast([snapshot(TODAY)], TODAY, { scores: [score(TODAY)] })
    expect(row).toMatchObject({
      component_drying_time: 40,
      component_upcoming_rain: 20,
      component_wind: 12,
      component_temp: 8,
      component_humidity: 6,
      confidence: 'high',
    })
  })

  it('preserves a zeroed component rather than nulling it', () => {
    // The case the acceptance criteria previously never exercised. A 0 here is a
    // real measurement and the one that fires suppression; a null means "not
    // measured" and `limitingComponent` skips it. Collapsing the two silently
    // disables half of suppression.
    const [row] = toWindowedForecast([snapshot(TODAY)], TODAY, {
      scores: [score(TODAY, { score: 41, component_drying_time: 0 })],
    })
    expect(row?.component_drying_time).toBe(0)
    expect(row?.component_drying_time).not.toBeNull()
  })

  it('a day outside the scoring window is unscored, not withheld', () => {
    // `score: null` with NO reason. The ladder's "too far out to score" copy.
    const rows = toWindowedForecast([snapshot('2026-09-20')], TODAY, { scores: [] })
    expect(rows[0]?.score).toBeNull()
    expect(rows[0]?.unavailable_reason).toBeNull()
    expect(rows[0]?.window).toBe('pre')
  })

  it('marks every day withheld when the rainfall lookup failed', () => {
    // computeLiveForecast returns scores: [] plus a reason. Without the reason
    // these rows are indistinguishable from "beyond the window", and the reader
    // is told the wrong thing about why there is no number (issue #34).
    const rows = toWindowedForecast([snapshot('2026-08-25'), snapshot('2026-08-26')], TODAY, {
      scores: [],
      unavailableReason: 'rainfall_unavailable',
    })
    expect(rows).toHaveLength(2)
    for (const r of rows) {
      expect(r.score).toBeNull()
      expect(r.unavailable_reason).toBe('rainfall_unavailable')
    }
  })

  it('keeps a score of 0, which is a real score and not a missing one', () => {
    const [row] = toWindowedForecast([snapshot(TODAY)], TODAY, {
      scores: [score(TODAY, { score: 0, component_drying_time: 0, component_wind: 0 })],
    })
    expect(row?.score).toBe(0)
    expect(row?.unavailable_reason).toBeNull()
  })

  it('still drops past days and labels windows when merging', () => {
    const rows = toWindowedForecast(
      [snapshot('2026-08-24'), snapshot('2026-08-25')],
      TODAY,
      { scores: [score('2026-08-24', { score: 99 }), score('2026-08-25')] },
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.forecast_date).toBe('2026-08-25')
    expect(rows[0]?.window).toBe('decision')
  })
})
