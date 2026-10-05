import { describe, expect, it } from 'vitest'
import type { HourlyReading, PastReadingsDay } from '@weatherteam6/types'
import { OUTCOME_DAYS, tripOutcomeRows } from './tripOutcomeRows.js'

const NOW = new Date('2026-10-05T13:20:00Z')
const TODAY = '2026-10-05'

const reading = (score: number, level: 'dry' | 'drying' | 'wet'): HourlyReading => ({
  valid_at: '2026-10-04T18:00:00.000Z',
  rock: { level } as HourlyReading['rock'],
  friction: null,
  score,
  t_surface_c: null,
  condensation_margin_c: null,
  held_back_by: [],
  rock_sun_shade: null,
})

const day = (local_date: string, over: Partial<PastReadingsDay> = {}): PastReadingsDay => ({
  local_date,
  best: reading(12, 'wet'),
  rain_mm: 6.5,
  temp_c_max: 17,
  temp_c_min: 9,
  ...over,
})

const rows = (pastDays: PastReadingsDay[], ranges = [{ start: '2026-09-28', end: '2026-10-04' }]) =>
  tripOutcomeRows({ locationId: 'loc', now: NOW, today: TODAY, ranges, pastDays })

describe('tripOutcomeRows', () => {
  it('writes a trip day that is over, from the look back, at the firing’s hour', () => {
    expect(rows([day('2026-10-04')])).toEqual([
      {
        location_id: 'loc',
        local_date: '2026-10-04',
        recorded_at: new Date('2026-10-05T13:00:00Z'),
        score: 12,
        dryness: 'wet',
        rain_mm: 6.5,
        temp_c_max: 17,
        temp_c_min: 9,
      },
    ])
  })

  it(`stops rewriting a day ${OUTCOME_DAYS} days after it`, () => {
    const dates = rows(['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-04'].map((d) => day(d))).map((r) => r.local_date)
    expect(dates).toEqual(['2026-10-02', '2026-10-04'])
  })

  it('never writes today or a day outside every trip', () => {
    const out = rows([day('2026-10-04'), day(TODAY)], [{ start: '2026-10-05', end: '2026-10-06' }])
    expect(out).toEqual([])
  })

  it('keeps the figures when the rock could not be read, and writes nothing for a day with nothing', () => {
    const out = rows([
      day('2026-10-03', { best: null }),
      day('2026-10-04', { best: null, rain_mm: null, temp_c_max: null, temp_c_min: null }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ local_date: '2026-10-03', score: null, dryness: null, rain_mm: 6.5 })
  })
})
