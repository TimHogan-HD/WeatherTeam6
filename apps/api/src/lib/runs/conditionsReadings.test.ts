import { describe, expect, it } from 'vitest'
import type { HourlyReading, HourlyReadings, HourlySeries, ReadingsDay } from '@weatherteam6/types'
import { toConditionsReadings } from './conditionsReadings.js'

const hour = (validAt: string, score: number): HourlyReading => ({
  valid_at: validAt,
  rock: { level: 'dry', qualified: true },
  friction: { level: 'good', condensing: false, qualified: true },
  score,
  t_surface_c: 18,
  condensation_margin_c: 4,
})

const day = (localDate: string): ReadingsDay => ({
  local_date: localDate,
  window: {
    from: `${localDate}T13:00:00.000Z`,
    to: `${localDate}T16:00:00.000Z`,
    hours: 4,
    min_score: 70,
    qualified: true,
  },
  best: hour(`${localDate}T15:00:00.000Z`, 88),
})

const readings = (over: Partial<HourlyReadings> = {}): HourlyReadings => ({
  model: 'gfs_seamless',
  unavailable_reason: null,
  hours: [
    hour('2026-09-21T14:00:00.000Z', 80),
    hour('2026-09-21T15:00:00.000Z', 88),
    hour('2026-09-22T15:00:00.000Z', 60),
  ],
  days: [day('2026-09-21'), day('2026-09-22')],
  ...over,
})

/** The two fields of the series this reads. `-6h` so a UTC offset would show. */
const series = (
  r: HourlyReadings = readings(),
): Pick<HourlySeries, 'readings' | 'utc_offset_seconds'> => ({
  readings: r,
  utc_offset_seconds: -6 * 3600,
})

describe('toConditionsReadings', () => {
  it('carries the model and picks the hour covering now', () => {
    const out = toConditionsReadings(
      series(),
      '2026-09-21',
      new Date('2026-09-21T15:10:00.000Z'),
    )
    expect(out.model).toBe('gfs_seamless')
    expect(out.now?.valid_at).toBe('2026-09-21T15:00:00.000Z')
    expect(out.today?.local_date).toBe('2026-09-21')
    // The clock travels with the readings. Without it a surface would format a
    // window's times against whatever offset it had to hand — issue #33.
    expect(out.utc_offset_seconds).toBe(-6 * 3600)
  })

  /**
   * The join is on `local_date`, not on position. `days[0]` is today in every
   * response the builder produces today — which is exactly why a positional
   * pick would look correct until the first window that started a day late.
   */
  it('finds today by date rather than by taking the first day', () => {
    const out = toConditionsReadings(
      series(readings({ days: [day('2026-09-20'), day('2026-09-21')] })),
      '2026-09-21',
      new Date('2026-09-21T15:00:00.000Z'),
    )
    expect(out.today?.local_date).toBe('2026-09-21')
  })

  it('reports no day rather than the wrong one when today is absent', () => {
    const out = toConditionsReadings(
      series(readings({ days: [day('2026-09-22')] })),
      '2026-09-21',
      new Date('2026-09-21T15:00:00.000Z'),
    )
    expect(out.today).toBeNull()
  })

  /**
   * A run that stops before now has nothing to say about this moment. The day's
   * best hour is right there and substituting it would put the sunniest hour of
   * a wet morning on screen as the current reading.
   */
  it('does not fall back to the day best when the run does not reach now', () => {
    const out = toConditionsReadings(
      series(),
      '2026-09-21',
      new Date('2026-09-23T15:00:00.000Z'),
    )
    expect(out.now).toBeNull()
    expect(out.today?.best?.score).toBe(88)
  })

  it('passes an unavailable reason straight through with nothing beside it', () => {
    const out = toConditionsReadings(
      series({ model: null, unavailable_reason: 'insufficient_history', hours: [], days: [] }),
      '2026-09-21',
      new Date('2026-09-21T15:00:00.000Z'),
    )
    expect(out.unavailable_reason).toBe('insufficient_history')
    expect(out.now).toBeNull()
    expect(out.today).toBeNull()
  })
})
