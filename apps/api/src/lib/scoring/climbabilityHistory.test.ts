import { describe, it, expect } from 'vitest'
import { computeClimbabilityHistory, type DailyPrecip } from './climbabilityHistory.js'

describe('computeClimbabilityHistory', () => {
  it('returns empty array for empty input', () => {
    expect(computeClimbabilityHistory([], 'granite')).toEqual([])
  })

  it('counts all days climbable when no rain', () => {
    const rows: DailyPrecip[] = [
      { date: '2024-06-01', precip_mm: 0 },
      { date: '2024-06-02', precip_mm: 0 },
      { date: '2024-06-03', precip_mm: 0 },
    ]
    const result = computeClimbabilityHistory(rows, 'granite')
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ month: 6, year: 2024, climbable_days: 3, total_days: 3 })
  })

  it('granite: blocks only 1 day after rain', () => {
    // Rain on day 1 (>=2mm): day 1 and day 2 not climbable (1-day lookback window)
    // Day 3 is climbable (no rain in its 1-day window = just day 3 itself)
    const rows: DailyPrecip[] = [
      { date: '2024-06-01', precip_mm: 5 },  // rained
      { date: '2024-06-02', precip_mm: 0 },  // within 1-day window of rain → not climbable
      { date: '2024-06-03', precip_mm: 0 },  // clean → climbable
    ]
    const result = computeClimbabilityHistory(rows, 'granite')
    expect(result[0]).toMatchObject({ climbable_days: 1, total_days: 3 })
  })

  it('sandstone: blocks 3 days after rain', () => {
    // Rain on day 1: days 1, 2, 3 blocked; day 4 is climbable
    const rows: DailyPrecip[] = [
      { date: '2024-06-01', precip_mm: 5 },
      { date: '2024-06-02', precip_mm: 0 },
      { date: '2024-06-03', precip_mm: 0 },
      { date: '2024-06-04', precip_mm: 0 },
    ]
    const result = computeClimbabilityHistory(rows, 'sandstone')
    expect(result[0]).toMatchObject({ climbable_days: 1, total_days: 4 })
  })

  it('unknown rock type uses 3-day window (sandstone default)', () => {
    const rows: DailyPrecip[] = [
      { date: '2024-06-01', precip_mm: 5 },
      { date: '2024-06-02', precip_mm: 0 },
      { date: '2024-06-03', precip_mm: 0 },
      { date: '2024-06-04', precip_mm: 0 },
    ]
    const result = computeClimbabilityHistory(rows, null)
    expect(result[0]).toMatchObject({ climbable_days: 1, total_days: 4 })
  })

  it('trace rain (<2mm) does not block climbability', () => {
    const rows: DailyPrecip[] = [
      { date: '2024-06-01', precip_mm: 1.5 },
      { date: '2024-06-02', precip_mm: 0 },
    ]
    const result = computeClimbabilityHistory(rows, 'sandstone')
    expect(result[0]).toMatchObject({ climbable_days: 2, total_days: 2 })
  })

  it('groups rows into correct month/year buckets', () => {
    const rows: DailyPrecip[] = [
      { date: '2024-05-31', precip_mm: 0 },
      { date: '2024-06-01', precip_mm: 0 },
    ]
    const result = computeClimbabilityHistory(rows, 'granite')
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ month: 5, year: 2024 })
    expect(result[1]).toMatchObject({ month: 6, year: 2024 })
  })

  it('results sorted by year then month ascending', () => {
    const rows: DailyPrecip[] = [
      { date: '2023-12-01', precip_mm: 0 },
      { date: '2024-01-01', precip_mm: 0 },
    ]
    const result = computeClimbabilityHistory(rows, 'granite')
    expect(result[0]).toMatchObject({ year: 2023, month: 12 })
    expect(result[1]).toMatchObject({ year: 2024, month: 1 })
  })
})
