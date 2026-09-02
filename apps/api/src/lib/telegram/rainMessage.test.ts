import { describe, expect, it } from 'vitest'
import type { EnsembleRunHour } from '../runs/latestRuns.js'
import {
  buildRainDay,
  daysBetween,
  describePrecip,
  EMPTY_RAIN_DAY,
  formatLastRain,
  formatLastRainAt,
  lastRainEpisode,
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
    expect(renderRainTable(EMPTY_RAIN_DAY, 'imperial', 3)).toBeNull()
    expect(renderRainSpreadTable(EMPTY_RAIN_DAY, 'imperial', 3)).toBeNull()
  })

  it('has no table for a day past the horizon, where the rows exist but are empty', () => {
    // The case a `rows.length === 0` check misses entirely: padded rows are
    // real rows full of nulls. Drawing them put eight rows of em dashes under
    // the sentence "No forecast reaches this day yet", which contradicts it.
    const beyond = buildRainDay([], OFFSET, '2026-09-04', 3)
    expect(beyond.rows).toHaveLength(8)
    expect(renderRainTable(beyond, 'imperial', 3)).toBeNull()
    expect(renderRainSpreadTable(beyond, 'imperial', 3)).toBeNull()
  })

  it('renders a step the data does not reach as a gap rather than 0%', () => {
    const table = renderRainTable(partialDay(12), 'imperial', 12)
    // Row 1 is the 00:00 step, which no hour reached.
    const empty = table?.split('\n')[1]
    expect(empty?.trimStart().startsWith('12a-12p')).toBe(true)
    expect(empty).toContain('—')
    expect(empty).not.toContain('0%')
    // And the step that *was* reached still carries its real numbers, so this
    // is not passing because the whole table is blank.
    expect(table).toContain('60%')
  })

  it('heads the columns in words, with the unit it is showing', () => {
    const day = partialDay(12)
    const imperial = renderRainTable(day, 'imperial', 12)?.split('\n')[0]
    expect(imperial).toContain('chance')
    expect(imperial).toContain('rain in')
    expect(renderRainTable(day, 'metric', 12)?.split('\n')[0]).toContain('rain mm')
  })

  it('keeps the spread out of the default table and names it in words', () => {
    const day = partialDay(12)
    const simple = renderRainTable(day, 'imperial', 12)?.split('\n')[0] ?? ''
    expect(simple).not.toContain('least')
    expect(simple).not.toContain('most')

    // The `⚙ More` table, headed as what the numbers mean and carrying the unit
    // in the header rather than in a sentence underneath. `p10`/`p50`/`p90` are
    // the vocabulary of the data source and never reach the screen.
    const spread = renderRainSpreadTable(day, 'imperial', 12)?.split('\n')[0] ?? ''
    expect(spread).toContain('least')
    expect(spread).toContain('likely')
    expect(spread).toContain('most')
    expect(spread).not.toContain('p10')
    expect(spread).not.toContain('p90')
    // The percentiles themselves are in the body, not just the header.
    expect(renderRainSpreadTable(day, 'metric', 12)).toContain('3.0')
  })

  it('stays inside a phone width in both tables', () => {
    // This assertion is what forced the spread into its own table: bolted onto
    // the first one it measured 36 characters, and `<pre>` scrolls sideways
    // rather than wrapping, so the extra columns would have gone off the edge
    // of the phone silently.
    const day = partialDay(1)
    const tables = [
      renderRainTable(day, 'imperial', 12),
      renderRainSpreadTable(day, 'imperial', 12),
      renderRainTable(day, 'metric', 12),
      renderRainSpreadTable(day, 'metric', 12),
    ]
    for (const table of tables) {
      expect(table).not.toBeNull()
      for (const line of table?.split('\n') ?? []) {
        expect(line.length).toBeLessThanOrEqual(40)
      }
    }
  })

  it('labels each row with the window it covers, so no sentence has to', () => {
    // "Each row covers the 3 h after it" was reported as confusing from a real
    // device. A range in the row label says the same thing where the reader is
    // already looking, which is why the simple note is now nothing at all.
    const rows = renderRainTable(partialDay(12), 'imperial', 12)?.split('\n') ?? []
    expect(rows[1]?.trim()).toMatch(/^12a-12p/)
    expect(rows[2]?.trim()).toMatch(/^12p-12a/)
    expect(rainTableNote(3, false)).toBeNull()
  })

  it('explains the spread only where the spread is shown', () => {
    const note = rainTableNote(3, true)
    expect(note).toContain('Least, likely and most')
    expect(note).toContain('range of amounts')
    // The vocabulary of the data source never reaches the screen.
    expect(note).not.toContain('p50')
    expect(note).not.toContain('percentile')
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

describe('lastRainEpisode', () => {
  const wet = (stamp: string, mm: number) => ({ valid_at_local: stamp, precip_mm: mm })

  it('reports the hour the rain began, not the stamp of its first wet hour', () => {
    // Open-Meteo stamps hourly precipitation at the END of the hour it fell in,
    // the same convention `buildRows` and `buildRainDay` follow. Stamps at
    // 02:00 and 03:00 are rain falling from 01:00 to 03:00 — reporting them
    // verbatim would say "2am–3am" for a shower that started at 1am and
    // understate how long the rock has been wet.
    const e = lastRainEpisode(
      [
        wet('2026-09-02T01:00', 0),
        wet('2026-09-02T02:00', 0.7),
        wet('2026-09-02T03:00', 0.4),
      ],
      0.1,
    )
    expect(e).not.toBeNull()
    expect(e?.startHour).toBe(1)
    expect(e?.endHour).toBe(3)
    expect(e?.total_mm).toBeCloseTo(1.1, 10)
    expect(e?.date).toBe('2026-09-02')
  })

  it('still spans an hour when only one stamp is wet', () => {
    const e = lastRainEpisode([wet('2026-09-02T03:00', 0.4)], 0.1)
    expect(e?.startHour).toBe(2)
    expect(e?.endHour).toBe(3)
  })

  it('wraps to the previous day rather than reporting hour -1', () => {
    // A stamp of 00:00 is rain that fell from 23:00. `(0 - 1 + 24) % 24` is the
    // guard; without it the hour is -1 and `clockLabel` refuses it.
    const e = lastRainEpisode([wet('2026-09-02T00:00', 0.5)], 0.1)
    expect(e?.startHour).toBe(23)
    expect(e?.endHour).toBe(0)
  })

  it('does not merge two showers separated by a dry hour', () => {
    const e = lastRainEpisode(
      [wet('2026-09-02T01:00', 2), wet('2026-09-02T02:00', 0), wet('2026-09-02T03:00', 0.4)],
      0.1,
    )
    // Only the 03:00 stamp, so 2am–3am — not 12am–3am across the dry hour.
    expect(e?.startHour).toBe(2)
    expect(e?.total_mm).toBeCloseTo(0.4, 10)
  })

  it('does not merge across a gap in the series', () => {
    // Unmeasured hours are dropped before this runs, so array adjacency is not
    // time adjacency. 03:00 and 06:00 sit side by side in the array and are
    // three hours apart in fact.
    const e = lastRainEpisode([wet('2026-09-02T03:00', 2), wet('2026-09-02T06:00', 0.4)], 0.1)
    expect(e?.startHour).toBe(5)
    expect(e?.endHour).toBe(6)
    expect(e?.total_mm).toBeCloseTo(0.4, 10)
  })

  it('is null for a window with nothing over the threshold', () => {
    // A trace is not rain. Returning an episode here would put a clock time on
    // a shower that never happened.
    expect(lastRainEpisode([wet('2026-09-02T03:00', 0.05)], 0.1)).toBeNull()
    expect(lastRainEpisode([], 0.1)).toBeNull()
  })
})

describe('formatLastRainAt', () => {
  const clock = (h: number) => (h === 0 ? 'midnight' : h === 12 ? 'noon' : h < 12 ? `${h}am` : `${h - 12}pm`)

  it('gives a clock span instead of a bare day', () => {
    // "Last rain: today" was the complaint: rain that stopped at 3am and rain
    // still falling at 5pm read identically, and they are opposite answers to
    // whether the rock has had time to dry.
    const line = formatLastRainAt(
      { date: '2026-09-02', startHour: 1, endHour: 3, total_mm: 1.1 },
      '2026-09-02',
      'imperial',
      clock,
    )
    expect(line).toBe('Last rain: 1am–3am today (2026-09-02), 0.04 in.')
  })

  it('keeps the relative day for older rain', () => {
    const line = formatLastRainAt(
      { date: '2026-08-30', startHour: 14, endHour: 16, total_mm: 5 },
      '2026-09-02',
      'imperial',
      clock,
    )
    expect(line).toContain('2pm–4pm 3 days ago')
  })
})
