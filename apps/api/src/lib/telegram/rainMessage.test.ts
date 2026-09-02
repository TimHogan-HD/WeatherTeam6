import { describe, expect, it } from 'vitest'
import type { EnsembleRunHour } from '../runs/latestRuns.js'
import {
  buildRainDay,
  daysBetween,
  describePrecip,
  EMPTY_RAIN_DAY,
  formatLastRain,
  oddsPct,
  rainTableNote,
  renderRainSpreadTable,
  renderRainTable,
} from './rainMessage.js'

const OFFSET = -25200 // UTC-7, so a UTC-bucketed day would be visibly wrong

function at(hour: number): Date {
  return new Date(Date.parse(`2026-09-04T${String(hour).padStart(2, '0')}:00:00Z`) - OFFSET * 1000)
}

function hour(over: Partial<EnsembleRunHour> & { valid_at: Date }): EnsembleRunHour {
  return {
    precip_mm_p10: null,
    precip_mm_p50: null,
    precip_mm_p90: null,
    temp_c_p10: null,
    temp_c_p50: null,
    temp_c_p90: null,
    wind_kmh_p10: null,
    wind_kmh_p50: null,
    wind_kmh_p90: null,
    precip_mm_mean: null,
    members_wet: null,
    member_count: 0,
    model_member_counts: {},
    ...over,
  }
}

describe('oddsPct', () => {
  it('is a share of the members that reported', () => {
    expect(oddsPct(hour({ valid_at: at(0), members_wet: 71, member_count: 142 }))).toBe(50)
  })

  it('withholds the odds when the wet count was never recorded', () => {
    // A row stored before the column existed. 0/143 would be a 0% chance of
    // rain that nobody computed.
    expect(oddsPct(hour({ valid_at: at(0), members_wet: null, member_count: 143 }))).toBeNull()
  })

  it('withholds the odds past the ensemble horizon', () => {
    // 0 wet of 0 members is a division by zero, and NaN renders as a gap only
    // by accident — this returns null on purpose.
    expect(oddsPct(hour({ valid_at: at(0), members_wet: 0, member_count: 0 }))).toBeNull()
  })

  it('reports a genuine zero as zero', () => {
    expect(oddsPct(hour({ valid_at: at(0), members_wet: 0, member_count: 143 }))).toBe(0)
  })
})

describe('buildRainDay', () => {
  const hours = [
    hour({ valid_at: at(13), precip_mm_mean: 0.1, members_wet: 10, member_count: 100 }),
    hour({
      valid_at: at(14),
      precip_mm_mean: 0.9,
      members_wet: 60,
      member_count: 100,
      precip_mm_p10: 0,
      precip_mm_p50: 0.5,
      precip_mm_p90: 3,
    }),
    hour({ valid_at: at(15), precip_mm_mean: 0.2, members_wet: 20, member_count: 100 }),
  ]

  it('totals a step by adding the hourly means', () => {
    // The only additive figure of the four: the mean of the members' totals is
    // the total of their hourly means. Adding p50s instead would be the median
    // of nothing, and would read as 1.5 mm here.
    const day = buildRainDay(hours, OFFSET, '2026-09-04', 3)
    expect(day.rows.find((r) => r.hour === 12)?.total_mm).toBeCloseTo(1.2, 10)
  })

  it('takes the percentiles from one hour, never summed across the step', () => {
    const row = buildRainDay(hours, OFFSET, '2026-09-04', 3).rows.find((r) => r.hour === 12)
    expect(row?.precip_mm_p90).toBe(3)
    expect(row?.precip_mm_p50).toBe(0.5)
  })

  it('picks the wettest hour of the step, not the first', () => {
    // 14:00 is the wettest by mean; the first hour of the step would report 10%.
    const row = buildRainDay(hours, OFFSET, '2026-09-04', 3).rows.find((r) => r.hour === 12)
    expect(row?.odds_pct).toBe(60)
  })

  it('counts the step after the row, matching the forecast table', () => {
    // The rain stamped 13:00–15:00 belongs to the 12:00 step. A step counted
    // from [12,15) would move it an hour earlier on one view and not the other.
    const day = buildRainDay(hours, OFFSET, '2026-09-04', 3)
    expect(day.rows.find((r) => r.hour === 15)?.total_mm).toBeNull()
  })

  it('emits a row per step even where the ensemble does not reach', () => {
    const day = buildRainDay(hours, OFFSET, '2026-09-04', 6)
    expect(day.rows).toHaveLength(4)
    expect(day.rows.find((r) => r.hour === 18)?.odds_pct).toBeNull()
  })

  it('names the wettest step of the day', () => {
    const day = buildRainDay(hours, OFFSET, '2026-09-04', 3)
    expect(day.peak_hour).toBe(12)
    expect(day.peak_odds_pct).toBe(60)
  })

  it('has no timing at all when no member is wet', () => {
    // Every hour measured, none of them wet: a peak hour of 0 at 0% would read
    // as a forecast of rain at midnight.
    const dry = [hour({ valid_at: at(13), precip_mm_mean: 0, members_wet: 0, member_count: 143 })]
    const day = buildRainDay(dry, OFFSET, '2026-09-04', 3)
    expect(day.peak_odds_pct).toBe(0)
    expect(day.peak_hour).toBeNull()
  })

  it('reports the member count as a range while models drop out', () => {
    const thinning = [
      hour({ valid_at: at(13), precip_mm_mean: 0, members_wet: 0, member_count: 143 }),
      hour({ valid_at: at(14), precip_mm_mean: 0, members_wet: 0, member_count: 92 }),
    ]
    const day = buildRainDay(thinning, OFFSET, '2026-09-04', 3)
    expect(day.member_min).toBe(92)
    expect(day.member_max).toBe(143)
  })

  it('has no member range for a day the ensemble never reached', () => {
    const day = buildRainDay([], OFFSET, '2026-09-04', 3)
    expect(day.member_min).toBeNull()
    expect(day.total_mm).toBeNull()
  })

  it('buckets by the location day, not the UTC one', () => {
    // 2026-09-05T05:00Z is 22:00 on the 4th at UTC-7. Under UTC bucketing this
    // rain would land on the wrong day entirely.
    const evening = [
      hour({
        valid_at: new Date('2026-09-05T05:00:00Z'),
        precip_mm_mean: 2,
        members_wet: 90,
        member_count: 100,
      }),
    ]
    const day = buildRainDay(evening, OFFSET, '2026-09-04', 3)
    expect(day.rows.find((r) => r.hour === 21)?.odds_pct).toBe(90)
  })
})

describe('renderRainTable', () => {
  /**
   * A day the ensemble reaches for **part** of, which is the fixture every
   * gap assertion below needs.
   *
   * `buildRainDay` emits a row per step whether or not the data reaches it, so
   * an all-empty day is now suppressed entirely — meaning a fixture built from
   * `[]` would render no table at all and every "renders a gap" assertion under
   * it would pass vacuously against `undefined`. Defect class 11, and it is how
   * these three tests were written before the suppression existed.
   *
   * The single hour at 13:00 lands in the 12:00 step at a 12 h interval; the
   * 00:00 step has nothing and is the row that must show gaps.
   */
  const partialDay = (interval: 1 | 12) =>
    buildRainDay(
      [
        hour({
          valid_at: at(13),
          precip_mm_mean: 0.9,
          members_wet: 60,
          member_count: 100,
          precip_mm_p10: 0,
          precip_mm_p50: 0.5,
          precip_mm_p90: 3,
        }),
      ],
      OFFSET,
      '2026-09-04',
      interval,
    )

  it('has no table for a day the ensemble said nothing about', () => {
    expect(renderRainTable(EMPTY_RAIN_DAY, 'imperial')).toBeNull()
    expect(renderRainSpreadTable(EMPTY_RAIN_DAY, 'imperial')).toBeNull()
  })

  it('has no table for a day past the horizon, where the rows exist but are empty', () => {
    // The case a `rows.length === 0` check misses entirely: padded rows are
    // real rows full of nulls. Drawing them put eight rows of em dashes under
    // the sentence "No forecast reaches this day yet", which contradicts it.
    const beyond = buildRainDay([], OFFSET, '2026-09-04', 3)
    expect(beyond.rows).toHaveLength(8)
    expect(renderRainTable(beyond, 'imperial')).toBeNull()
    expect(renderRainSpreadTable(beyond, 'imperial')).toBeNull()
  })

  it('renders a step the data does not reach as a gap rather than 0%', () => {
    const table = renderRainTable(partialDay(12), 'imperial')
    // Row 1 is the 00:00 step, which no hour reached.
    const empty = table?.split('\n')[1]
    expect(empty?.startsWith('00')).toBe(true)
    expect(empty).toContain('—')
    expect(empty).not.toContain('0%')
    // And the step that *was* reached still carries its real numbers, so this
    // is not passing because the whole table is blank.
    expect(table).toContain('60%')
  })

  it('heads the columns in words, with the unit it is showing', () => {
    const day = partialDay(12)
    const imperial = renderRainTable(day, 'imperial')?.split('\n')[0]
    expect(imperial).toContain('chance')
    expect(imperial).toContain('rain in')
    expect(renderRainTable(day, 'metric')?.split('\n')[0]).toContain('rain mm')
  })

  it('keeps the spread out of the default table and names it in words', () => {
    const day = partialDay(12)
    const simple = renderRainTable(day, 'imperial')?.split('\n')[0] ?? ''
    expect(simple).not.toContain('low')
    expect(simple).not.toContain('high')

    // The `⚙ More` table, headed as what the numbers mean. `p10`/`p50`/`p90`
    // are the vocabulary of the data source and never reach the screen.
    const spread = renderRainSpreadTable(day, 'imperial')?.split('\n')[0] ?? ''
    expect(spread).toContain('low')
    expect(spread).toContain('mid')
    expect(spread).toContain('high')
    expect(spread).not.toContain('p10')
    expect(spread).not.toContain('p90')
    // The percentiles themselves are in the body, not just the header.
    expect(renderRainSpreadTable(day, 'metric')).toContain('3.0')
  })

  it('stays inside a phone width in both tables', () => {
    // This assertion is what forced the spread into its own table: bolted onto
    // the first one it measured 36 characters, and `<pre>` scrolls sideways
    // rather than wrapping, so the extra columns would have gone off the edge
    // of the phone silently.
    const day = partialDay(1)
    const tables = [
      renderRainTable(day, 'imperial'),
      renderRainSpreadTable(day, 'imperial'),
      renderRainTable(day, 'metric'),
      renderRainSpreadTable(day, 'metric'),
    ]
    for (const table of tables) {
      expect(table).not.toBeNull()
      for (const line of table?.split('\n') ?? []) {
        expect(line.length).toBeLessThanOrEqual(32)
      }
    }
  })

  it('says which hour the chance describes, and explains the spread only when shown', () => {
    // The distinction is worth a sentence: a reader who takes the chance for
    // the whole step reads a 3 h window as a single hour's odds.
    expect(rainTableNote(3, false)).toContain('wettest single hour')
    expect(rainTableNote(1, false)).toContain('the hour after each row')
    // No columns for it, so no sentence about it.
    expect(rainTableNote(3, false)).not.toContain('dry, middle or wet')
    expect(rainTableNote(3, true)).toContain('dry, middle or wet')
  })
})

describe('describePrecip', () => {
  it('calls a measurable amount that rounds to nothing a trace', () => {
    expect(describePrecip(0.1, 'imperial')).toBe('a trace')
  })

  it('names the unit it converted to', () => {
    expect(describePrecip(25.4, 'imperial')).toBe('1.00 in')
    expect(describePrecip(25.4, 'metric')).toBe('25.4 mm')
  })
})

describe('formatLastRain', () => {
  it('says the lookup failed rather than reporting a dry spell', () => {
    // Issue #34, in a second place: an upstream outage that renders as "no rain
    // in 30 days" is an outage that improves the forecast.
    const line = formatLastRain(null, true, 30, '2026-09-04', 'imperial')
    expect(line).toContain('couldn’t check')
    expect(line).not.toContain('none in the past')
  })

  it('names the window when the record really is empty', () => {
    expect(formatLastRain(null, false, 30, '2026-09-04', 'imperial')).toContain('past 30 days')
  })

  it('says today for rain dated today', () => {
    // The drying model measures from the *end* of the rain day, which put a
    // negative number on screen once. Days are compared as dates here.
    const line = formatLastRain(
      { date: '2026-09-04', precip_mm: 5 },
      false,
      30,
      '2026-09-04',
      'imperial',
    )
    expect(line).toContain('today (2026-09-04)')
    expect(line).not.toMatch(/\(-\d/)
  })

  it('counts whole days back', () => {
    const line = formatLastRain(
      { date: '2026-08-31', precip_mm: 5 },
      false,
      30,
      '2026-09-04',
      'imperial',
    )
    expect(line).toContain('4 days ago')
  })

  it('says yesterday rather than 1 days ago', () => {
    expect(
      formatLastRain({ date: '2026-09-03', precip_mm: 5 }, false, 30, '2026-09-04', 'imperial'),
    ).toContain('yesterday (2026-09-03)')
  })

  it('carries the amount in the selected units', () => {
    expect(
      formatLastRain({ date: '2026-09-03', precip_mm: 25.4 }, false, 30, '2026-09-04', 'metric'),
    ).toContain('25.4 mm')
  })
})

describe('daysBetween', () => {
  it('counts across a month boundary', () => {
    expect(daysBetween('2026-08-31', '2026-09-04')).toBe(4)
  })

  it('is null for anything that is not a date', () => {
    expect(daysBetween('not-a-date', '2026-09-04')).toBeNull()
  })
})
