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
    mode: 'simple',
    locationName: 'Red Rock',
    units: 'imperial',
    interval: 3,
    columnSet: 'all',
    model: 'ncep_hrrr_conus',
    days: ['2026-09-04', '2026-09-05', '2026-09-06'],
    dayIndex: 0,
    // A row with at least one real value: an all-gap day is the "does not reach
    // this day" case, and every other assertion here needs a table on screen.
    rows: [{ hour: 12, at: null, precip_mm: 1.2 }],
    modelsAvailable: ['gfs_seamless', 'ncep_hrrr_conus'],
    modelsUnavailable: [],
    probabilityIsShared: false,
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
  it('heads the panel with the model, the step and the fetch time', () => {
    const panel = buildForecastPanel(forecastInput())
    expect(panel.text).toContain('HRRR')
    expect(panel.text).toContain('3-hourly')
    // Probe A found no run initialization time is exposed at all, so this may
    // say when it was fetched and never which run it came from.
    expect(panel.text).toContain('fetched 13:51Z')
    expect(panel.text).toContain('14m ago')
    expect(panel.text).not.toContain('12Z')
  })

  it('escapes the location name in the text', () => {
    const panel = buildForecastPanel(forecastInput({ locationName: 'Bear & Cub' }))
    expect(panel.text).toContain('Bear &amp; Cub')
    expect(panel.text).not.toContain('Bear & Cub')
  })

  it('names a model that does not reach the point instead of dropping it', () => {
    // `DisabledButton` draws identically to an enabled one on both clients
    // Probe B tested, so the only honest form is a line of text.
    const panel = buildForecastPanel(
      forecastInput({ modelsUnavailable: ['ncep_hrrr_conus', 'ncep_nbm_conus'] }),
    )
    expect(panel.text).toContain('No data at this point: HRRR, NBM')
  })

  it('says a model does not reach the day rather than drawing a table of dashes', () => {
    // The shape the real caller produces past a model's horizon: `buildRows`
    // emits a step per row whether or not the series reaches it, so HRRR beyond
    // 54 h is eight rows of gaps, never an empty array. Testing `rows: []` alone
    // would leave this branch unreachable from production — defect class 11.
    const empty = buildRows([], -25200, '2026-09-06', 3)
    expect(empty).toHaveLength(8)

    const panel = buildForecastPanel(forecastInput({ rows: empty, dayIndex: 2 }))
    expect(panel.text).toContain('HRRR does not reach Sun 6 Sep')
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

  it('carries the shared-probability caveat only when it is needed', () => {
    const shared = buildForecastPanel(
      forecastInput({ columnSet: 'rain', probabilityIsShared: true }),
    )
    expect(shared.text).toContain('blended probability')

    const own = buildForecastPanel(forecastInput({ columnSet: 'rain', probabilityIsShared: false }))
    expect(own.text).not.toContain('blended probability')

    const unknown = buildForecastPanel(
      forecastInput({ columnSet: 'rain', probabilityIsShared: null }),
    )
    expect(unknown.text).toContain('blended probability')
  })

  it('draws the agreement bar only when a member reached the day', () => {
    const withBar = buildForecastPanel(forecastInput({ rainDay: rainDay() }))
    // Named as the ensemble's: the panel is headed with one deterministic
    // model and this bar is not that model's opinion.
    expect(withBar.text).toContain('Rain odds · ensemble, 143 members')

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
    expect(buildForecastPanel(forecastInput({ rainDay: noMembers })).text).not.toContain('Rain odds')
  })

  it('shows a member range while models drop out', () => {
    const panel = buildForecastPanel(
      forecastInput({ rainDay: rainDay({ member_min: 92, member_max: 143 }) }),
    )
    expect(panel.text).toContain('92–143 members')
  })

  it('offers the day pager without arrows past the ends', () => {
    const first = buildForecastPanel(forecastInput({ dayIndex: 0 }))
    expect(first.keyboard?.inline_keyboard[0]?.map((b) => b.text)).toEqual(['Fri 4 Sep', 'Sat ▶'])

    const last = buildForecastPanel(forecastInput({ dayIndex: 2 }))
    expect(last.keyboard?.inline_keyboard[0]?.map((b) => b.text)).toEqual(['◀ Sat', 'Sun 6 Sep'])
  })

  it('marks the model on screen and offers only the ones that answered', () => {
    const panel = buildForecastPanel(forecastInput())
    expect(panel.keyboard?.inline_keyboard[1]?.map((b) => b.text)).toEqual(['GFS', '• HRRR'])
  })

  it('keeps the step, column and unit controls behind Advanced', () => {
    const simple = buildForecastPanel(forecastInput({ mode: 'simple' }))
    const simpleLabels = simple.keyboard?.inline_keyboard.flat().map((b) => b.text) ?? []
    expect(simpleLabels).not.toContain('6h')
    expect(simpleLabels).not.toContain('°C / mm')
    expect(simpleLabels).toContain('⚙ Advanced')

    const advanced = buildForecastPanel(forecastInput({ mode: 'advanced' }))
    const labels = advanced.keyboard?.inline_keyboard.flat().map((b) => b.text) ?? []
    expect(labels).toContain('• 3h')
    expect(labels).toContain('• Overview')
    // The toggle names the units it switches *to*.
    expect(labels).toContain('°C / mm')
  })

  it('offers the other two views of the same location, never the one on screen', () => {
    const labels =
      buildForecastPanel(forecastInput())
        .keyboard?.inline_keyboard.flat()
        .map((b) => b.text) ?? []
    expect(labels).toContain('🧗 Conditions')
    expect(labels).toContain('🌧 Rain')
    expect(labels).not.toContain('📊 Forecast')
  })
})

describe('timingLine', () => {
  it('separates a day nobody forecast from a dry one', () => {
    expect(timingLine(rainDay({ peak_odds_pct: null, peak_hour: null }), 'imperial')).toContain(
      'No ensemble member reaches',
    )
    expect(timingLine(rainDay({ peak_odds_pct: 0, peak_hour: null }), 'imperial')).toContain(
      'No member has measurable rain',
    )
  })

  it('names the hour, the share of members and the day total', () => {
    const line = timingLine(rainDay(), 'imperial')
    expect(line).toContain('12:00')
    expect(line).toContain('60% of members wet')
    expect(line).toContain('0.05 in')
  })

  it('says the total is unavailable rather than reporting no rain', () => {
    expect(timingLine(rainDay({ total_mm: null }), 'imperial')).toContain('not available')
  })
})

describe('buildRainPanel', () => {
  function rainInput(over: Partial<RainPanelInput> = {}): RainPanelInput {
    return {
      stateId: STATE,
      mode: 'simple',
      locationName: 'Red Rock',
      units: 'imperial',
      interval: 12,
      days: ['2026-09-04', '2026-09-05'],
      dayIndex: 0,
      day: rainDay(),
      lastRain: { date: '2026-08-31', precip_mm: 12 },
      lastRainFailed: false,
      rainWindowDays: 30,
      today: '2026-09-04',
      fetchedAt: FETCHED,
      now: NOW,
      ...over,
    }
  }

  it('shows the odds table, the bar and the timing', () => {
    const panel = buildRainPanel(rainInput())
    expect(panel.text).toContain('<pre>')
    expect(panel.text).toContain('143 members')
    expect(panel.text).toContain('Wettest around 12:00')
    expect(panel.text).toContain('Last rain: 2026-08-31')
  })

  it('says the rainfall record failed rather than implying a dry spell', () => {
    const panel = buildRainPanel(rainInput({ lastRain: null, lastRainFailed: true }))
    expect(panel.text).toContain('could not be read')
    expect(panel.text).not.toContain('none recorded')
  })

  it('says there are no hours rather than drawing an empty table', () => {
    const panel = buildRainPanel(rainInput({ day: EMPTY_RAIN_DAY }))
    expect(panel.text).toContain('No ensemble hours')
    expect(panel.text).not.toContain('<pre>')
  })

  it('offers the other two views of the same location', () => {
    const labels =
      buildRainPanel(rainInput())
        .keyboard?.inline_keyboard.flat()
        .map((b) => b.text) ?? []
    expect(labels).toContain('📊 Forecast')
    expect(labels).not.toContain('🌧 Rain')
  })
})
