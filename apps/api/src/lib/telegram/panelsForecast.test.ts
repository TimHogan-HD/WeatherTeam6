import { describe, expect, it } from 'vitest'
import {
  buildForecastPanel,
  buildRainPanel,
  dayLabel,
  formatAge,
  timingLine,
  type ForecastPanelInput,
  type RainPanelInput,
} from './panels.js'
import { buildRows } from './forecastTable.js'
import { EMPTY_RAIN_DAY, type RainDay } from './rainMessage.js'

/**
 * Phase 3's two panels. Kept out of `panels.test.ts` only for size — the rules
 * are the same ones, and the escaping rule in particular is opposite for text
 * and for button labels.
 */

const STATE = 'a1b2c3d4'
const NOW = new Date('2026-09-04T14:05:00Z')
const FETCHED = new Date('2026-09-04T13:51:00Z')

function forecastInput(over: Partial<ForecastPanelInput> = {}): ForecastPanelInput {
  return {
    stateId: STATE,
    locationId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    mode: 'simple',
    locationName: 'Red Rock',
    units: 'imperial',
    interval: 3,
    model: 'ncep_hrrr_conus',
    days: ['2026-09-04', '2026-09-05', '2026-09-06'],
    dayIndex: 0,
    // A row with at least one real value: an all-gap day is the "does not reach
    // this day" case, and every other assertion here needs a table on screen.
    rows: [{ hour: 12, at: null, precip_mm: 1.2 }],
    rainDay: null,
    fetchedAt: FETCHED,
    now: NOW,
    ...over,
  }
}

function rainDay(over: Partial<RainDay> = {}): RainDay {
  return {
    rows: [
      {
        hour: 0,
        odds_pct: 0,
        precip_mm_p10: 0,
        precip_mm_p50: 0,
        precip_mm_p90: 0,
        total_mm: 0,
        member_count: 143,
      },
      {
        hour: 12,
        odds_pct: 60,
        precip_mm_p10: 0,
        precip_mm_p50: 0.5,
        precip_mm_p90: 3,
        total_mm: 1.2,
        member_count: 143,
      },
    ],
    total_mm: 1.2,
    peak_odds_pct: 60,
    peak_hour: 12,
    member_min: 143,
    member_max: 143,
    ...over,
  }
}

describe('dayLabel', () => {
  it('names the weekday and the date', () => {
    expect(dayLabel('2026-09-04')).toBe('Fri 4 Sep')
  })

  it('reads the day as UTC, because the date is already the location’s own', () => {
    // These are local calendar days from a `timezone=auto` response.
    // Re-interpreting one in the server's zone shifts it back off by a day —
    // the bug issue #33 fixed.
    expect(dayLabel('2026-01-01')).toBe('Thu 1 Jan')
    expect(dayLabel('2026-12-31')).toBe('Thu 31 Dec')
  })

  it('shows an unparseable date as itself rather than as a guess', () => {
    expect(dayLabel('not-a-date')).toBe('not-a-date')
  })
})

describe('formatAge', () => {
  it('says how old a stored run is', () => {
    expect(formatAge(new Date('2026-09-04T13:51:00Z'), NOW)).toBe('14m ago')
    expect(formatAge(new Date('2026-09-04T11:30:00Z'), NOW)).toBe('2h 35m ago')
  })

  it('does not report a negative age when two clocks disagree', () => {
    // The run row is written by whichever process collected it, so a skew of
    // seconds is normal. Subtraction alone would print "-1m ago".
    expect(formatAge(new Date('2026-09-04T14:06:00Z'), NOW)).toBe('just now')
  })

  it('has no age for a run with no fetch time', () => {
    expect(formatAge(null, NOW)).toBeNull()
  })
})

describe('buildForecastPanel', () => {
  it('heads the panel with the place and the day, and nothing else', () => {
    // The header used to read `Red Rock · HRRR · 3-hourly`, which put the
    // vocabulary of the data source in the first line the reader sees. The
    // model is still named — at the foot, where the evidence goes.
    const panel = buildForecastPanel(forecastInput())
    const header = panel.text.split('\n')[0]
    expect(header).toContain('Red Rock')
    expect(header).toContain('Fri 4 Sep')
    expect(header).not.toContain('HRRR')
    expect(header).not.toContain('hourly')
  })

  it('shows only the age by default, and the attribution under More', () => {
    // Age stays because it changes what the reader does — a three-hour-old
    // panel is worth a tap of 🔄. The model name and member count do not, and
    // a footer under every default panel was furniture.
    const simple = buildForecastPanel(forecastInput())
    expect(simple.text).toContain('Updated 14m ago')
    expect(simple.text).not.toContain('HRRR model')

    const detail = buildForecastPanel(forecastInput({ mode: 'advanced' }))
    expect(detail.text).toContain('HRRR model')
    // Probe A found no run initialization time is exposed at all, so this may
    // say when it was fetched and never which run it came from.
    expect(detail.text).toContain('13:51Z')
    expect(detail.text).not.toContain('12Z run')
  })

  it('keeps the whole panel to three rows of buttons in its default state', () => {
    const panel = buildForecastPanel(forecastInput())
    expect(panel.keyboard?.inline_keyboard).toHaveLength(3)
    // No model row: six model buttons was the single biggest source of the
    // clutter, and switching models is the Mini App's job now.
    const labels = panel.keyboard?.inline_keyboard.flat().map((b) => b.text) ?? []
    expect(labels).not.toContain('GFS')
    expect(labels).not.toContain('HRRR')
  })

  it('reveals the detail tables and the settings behind one More button', () => {
    const simple = buildForecastPanel(forecastInput())
    expect(simple.keyboard?.inline_keyboard.flat().map((b) => b.text)).toContain('⚙ More')
    expect(simple.text).not.toContain('Air')

    const detail = buildForecastPanel(forecastInput({ mode: 'advanced' }))
    // Two stacked narrow tables, not one wide one — a nine-column table is 50
    // characters and `<pre>` scrolls sideways rather than wrapping.
    expect(detail.text).toContain('Air')
    expect(detail.text).toContain('Wind and rain')
    const labels = detail.keyboard?.inline_keyboard.flat().map((b) => b.text) ?? []
    expect(labels).toContain('✕ Less')
    expect(labels).toContain('• 3h')
    expect(labels).toContain('°C / mm')
  })

  it('escapes the location name in the text', () => {
    const panel = buildForecastPanel(forecastInput({ locationName: 'Bear & Cub' }))
    expect(panel.text).toContain('Bear &amp; Cub')
    expect(panel.text).not.toContain('Bear & Cub')
  })

  it('says a model does not reach the day rather than drawing a table of dashes', () => {
    // The shape the real caller produces past a model's horizon: `buildRows`
    // emits a step per row whether or not the series reaches it, so HRRR beyond
    // 54 h is eight rows of gaps, never an empty array. Testing `rows: []` alone
    // would leave this branch unreachable from production — defect class 11.
    const empty = buildRows([], -25200, '2026-09-06', 3)
    expect(empty).toHaveLength(8)

    const panel = buildForecastPanel(forecastInput({ rows: empty, dayIndex: 2 }))
    expect(panel.text).toContain('The HRRR model does not reach Sun 6 Sep')
    expect(panel.text).not.toContain('<pre>')
  })

  it('draws the table as soon as one value in the day is real', () => {
    const partial = buildRows(
      [
        {
          valid_at: new Date(Date.parse('2026-09-06T06:00:00Z') + 25200 * 1000),
          temp_c: 12,
          dewpoint_c: null,
          humidity_pct: null,
          precip_mm: null,
          wind_kmh: null,
          wind_gust_kmh: null,
          wind_dir_deg: null,
          cloud_pct: null,
          precip_prob_pct: null,
          pressure_hpa: null,
        },
      ],
      -25200,
      '2026-09-06',
      3,
    )
    const panel = buildForecastPanel(forecastInput({ rows: partial, dayIndex: 2 }))
    expect(panel.text).toContain('<pre>')
    expect(panel.text).not.toContain('does not reach')
  })

  it('never shows the blended probability column, in either mode', () => {
    // `precipitation_probability` belongs to no single model — Probe A measured
    // it running 276 h against a 54 h model and byte-identical to another
    // model's series — so a column in a table headed with one model's name
    // needed a footnote saying it was not that model's figure. The rain panel
    // answers the same question from the members themselves, which is a real
    // proportion of real forecasts, so the column and its caveat both went.
    for (const mode of ['simple', 'advanced'] as const) {
      const panel = buildForecastPanel(forecastInput({ mode }))
      expect(panel.text).not.toContain('pop')
      expect(panel.text).not.toContain('blended')
    }
  })

  it('attributes the ensemble separately from the table’s model, under More', () => {
    const withBar = buildForecastPanel(forecastInput({ rainDay: rainDay(), mode: 'advanced' }))
    // Attributed to the ensemble, not to the table's model: it comes from a
    // different fetch, and one source line naming only HRRR would credit it
    // with a number it did not produce. "forecasts", not "members" — the count
    // is what makes the percentage trustworthy and the reader should not need
    // the word to use it.
    expect(withBar.text).toContain('Rain chance from 143 forecasts')
    expect(withBar.text).toContain('HRRR model')

    // Every hour unmeasured. A row of low bars here would be a forecast of no
    // rain drawn from no members at all.
    const noMembers = rainDay({
      rows: [
        {
          hour: 0,
          odds_pct: null,
          precip_mm_p10: null,
          precip_mm_p50: null,
          precip_mm_p90: null,
          total_mm: null,
          member_count: 0,
        },
      ],
      member_min: null,
      member_max: null,
    })
    // The source line must not claim an ensemble contributed when none did.
    const bare = buildForecastPanel(forecastInput({ rainDay: noMembers, mode: 'advanced' }))
    expect(bare.text).not.toContain('Rain chance from')
  })

  it('shows a range while models drop out through the day', () => {
    const panel = buildForecastPanel(
      forecastInput({ rainDay: rainDay({ member_min: 92, member_max: 143 }), mode: 'advanced' }),
    )
    expect(panel.text).toContain('92–143 forecasts')
  })

  it('states the scale of the temperature bar wherever it draws one', () => {
    // An unlabelled bar is a shape with no meaning — the complaint that removed
    // the standalone sparkline. The scale is the *day's own* range, so without
    // this sentence the same bar means different things on different days.
    const rows = buildRows(
      [6, 12, 18].map((h) => ({
        valid_at: new Date(Date.parse(`2026-09-04T${String(h).padStart(2, '0')}:00:00Z`) + 25200000),
        temp_c: h === 6 ? 10 : h === 12 ? 20 : 30,
        dewpoint_c: null,
        humidity_pct: null,
        precip_mm: null,
        wind_kmh: null,
        wind_gust_kmh: null,
        wind_dir_deg: null,
        cloud_pct: null,
        precip_prob_pct: null,
        pressure_hpa: null,
      })),
      -25200,
      '2026-09-04',
      6,
    )
    const panel = buildForecastPanel(forecastInput({ rows }))
    expect(panel.text).toContain('Bar spans this day only')
    // 10 °C and 30 °C in Fahrenheit — the bar and its stated scale must be in
    // the units on screen, not the units the data arrived in.
    expect(panel.text).toContain('50°F')
    expect(panel.text).toContain('86°F')
  })

  it('offers the day pager without arrows past the ends', () => {
    const first = buildForecastPanel(forecastInput({ dayIndex: 0 }))
    expect(first.keyboard?.inline_keyboard[0]?.map((b) => b.text)).toEqual(['Fri 4 Sep', 'Sat ▶'])

    const last = buildForecastPanel(forecastInput({ dayIndex: 2 }))
    expect(last.keyboard?.inline_keyboard[0]?.map((b) => b.text)).toEqual(['◀ Sat', 'Sun 6 Sep'])
  })

  it('keeps the step and unit controls behind More', () => {
    const simple = buildForecastPanel(forecastInput({ mode: 'simple' }))
    const simpleLabels = simple.keyboard?.inline_keyboard.flat().map((b) => b.text) ?? []
    expect(simpleLabels).not.toContain('6h')
    expect(simpleLabels).not.toContain('°C / mm')
    expect(simpleLabels).toContain('⚙ More')
  })

  it('offers the other two views of the same location, never the one on screen', () => {
    const labels =
      buildForecastPanel(forecastInput())
        .keyboard?.inline_keyboard.flat()
        .map((b) => b.text) ?? []
    expect(labels).toContain('🧗 Now')
    expect(labels).toContain('🌧 Rain')
    expect(labels).not.toContain('⏱ Hourly')
  })
})

describe('timingLine', () => {
  it('separates a day nobody forecast from a dry one', () => {
    // These two must not read the same. "No rain expected" is a forecast; a day
    // no member reached is the absence of one, and rendering it as the former
    // is defect class 2 — a failure state that reads as success.
    //
    // The empty day is `EMPTY_RAIN_DAY`, not the shared fixture with its
    // `peak_odds_pct` nulled out: that fixture's rows carry real totals, so it
    // is a day the ensemble *did* reach and saying otherwise about it would be
    // asserting the right sentence against the wrong state.
    expect(timingLine(EMPTY_RAIN_DAY, 'imperial')).toBe('No forecast reaches this day yet.')
    expect(timingLine(rainDay({ peak_odds_pct: 0, peak_hour: null }), 'imperial')).toBe(
      'No rain expected.',
    )
  })

  it('withholds the chance for a run with amounts but no wet count', () => {
    // `members_wet` is nullable and null means unknown, not zero — a run stored
    // before that column existed. The amounts are real and are still reported;
    // the chance is not invented, and the day is not called unforecast either.
    const line = timingLine(rainDay({ peak_odds_pct: null, peak_hour: null }), 'imperial')
    expect(line).toContain('No chance-of-rain figure')
    expect(line).not.toContain('0%')
    expect(line).not.toContain('No forecast reaches')
  })

  it('reads the clock aloud and gives a plain chance and amount', () => {
    const line = timingLine(rainDay(), 'imperial')
    expect(line).toContain('noon')
    expect(line).not.toContain('12:00')
    // "60% chance", not "60% of members wet" — the same number, said the way a
    // forecast is normally said.
    expect(line).toContain('60% chance')
    expect(line).not.toContain('members')
    expect(line).toContain('0.05 in')
  })

  it('drops the amount rather than claiming there is none', () => {
    // A missing total is unknown. Saying "0.00 in" would be defect class 1 and
    // the old copy's "not available" was a phrase in the middle of a sentence.
    const line = timingLine(rainDay({ total_mm: null }), 'imperial')
    expect(line).toContain('60% chance')
    expect(line).not.toContain('Expect')
    expect(line).not.toContain('0.00')
  })
})

describe('buildRainPanel', () => {
  function rainInput(over: Partial<RainPanelInput> = {}): RainPanelInput {
    return {
      stateId: STATE,
      locationId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      mode: 'simple',
      locationName: 'Red Rock',
      units: 'imperial',
      interval: 12,
      days: ['2026-09-04', '2026-09-05'],
      dayIndex: 0,
      day: rainDay(),
      lastRain: { date: '2026-08-31', precip_mm: 12 },
      // The daily fallback by default; the hourly path is asserted separately.
      lastRainAt: null,
      lastRainFailed: false,
      rainWindowDays: 30,
      today: '2026-09-04',
      fetchedAt: FETCHED,
      now: NOW,
      ...over,
    }
  }

  it('leads with the answer, then the table', () => {
    const panel = buildRainPanel(rainInput())
    // The sentence a reader came for is above the numbers, not under them.
    const answerAt = panel.text.indexOf('Rain most likely around noon')
    const tableAt = panel.text.indexOf('<pre>')
    expect(answerAt).toBeGreaterThan(-1)
    expect(answerAt).toBeLessThan(tableAt)
    expect(panel.text).toContain('Last rain: 4 days ago (2026-08-31)')
  })

  it('says chance and rain in the default table, and no percentiles', () => {
    const panel = buildRainPanel(rainInput())
    expect(panel.text).toContain('chance')
    expect(panel.text).not.toContain('p10')
    expect(panel.text).not.toContain('p50')
    expect(panel.text).not.toContain('p90')
  })

  it('puts the spread behind More, in words rather than percentiles', () => {
    const panel = buildRainPanel(rainInput({ mode: 'advanced' }))
    // The same three numbers, headed as what they mean rather than as what they
    // are called, with the unit in the header instead of a sentence below it.
    expect(panel.text).toContain('least')
    expect(panel.text).toContain('likely')
    expect(panel.text).toContain('most')
    expect(panel.text).not.toContain('p90')
    expect(panel.text).toContain('If it rains, how much')
  })

  it('says the rainfall record failed rather than implying a dry spell', () => {
    const panel = buildRainPanel(rainInput({ lastRain: null, lastRainFailed: true }))
    expect(panel.text).toContain('couldn’t check')
    expect(panel.text).not.toContain('none in the past')
  })

  it('says there is no forecast once, rather than drawing an empty table', () => {
    const panel = buildRainPanel(rainInput({ day: EMPTY_RAIN_DAY }))
    expect(panel.text).toContain('No forecast reaches this day yet.')
    expect(panel.text).not.toContain('<pre>')
    // Once, not twice: the panel used to state it in the timing line and then
    // again where the table would have gone.
    expect(panel.text.match(/No forecast/g)).toHaveLength(1)
  })

  it('still says how old the fetch is when no forecast reaches the day', () => {
    // The count is absent, so the source line drops it — but the panel *was*
    // fetched, and "Based on no forecasts reach this day, just now" is what
    // interpolating the absent case produced before.
    const panel = buildRainPanel(rainInput({ day: EMPTY_RAIN_DAY }))
    expect(panel.text).toContain('Updated 14m ago')
    expect(panel.text).not.toContain('Based on')
  })

  it('offers the other two views of the same location', () => {
    const labels =
      buildRainPanel(rainInput())
        .keyboard?.inline_keyboard.flat()
        .map((b) => b.text) ?? []
    expect(labels).toContain('⏱ Hourly')
    expect(labels).toContain('🧗 Now')
    expect(labels).not.toContain('🌧 Rain')
  })
})
