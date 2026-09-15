import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ForecastSnapshot } from '@weatherteam6/types'
import { DailyList, rowSpan, sharedDomain } from './DailyList.js'

/**
 * The daily list's two load-bearing claims: the bar scale is shared by all
 * seven rows, and a row only opens a drill-down that has something in it.
 *
 * Both are things that pass every automated gate while being wrong on screen —
 * a per-row scale draws a plausible bar on every row, and a tappable day with
 * no hourly coverage opens two empty charts.
 */

const DATES = [
  '2026-09-14',
  '2026-09-15',
  '2026-09-16',
  '2026-09-17',
  '2026-09-18',
  '2026-09-19',
  '2026-09-20',
] as const

function day(date: string, over: Partial<ForecastSnapshot> = {}): ForecastSnapshot {
  return {
    id: `snap-${date}`,
    location_id: 'loc',
    captured_at: `${date}T00:00:00.000Z`,
    forecast_date: date,
    precip_mm_p10: 0,
    precip_mm_p50: 1,
    precip_mm_p90: 4,
    temp_c_min: 10,
    temp_c_max: 20,
    wind_kmh_max: 12,
    humidity_pct: 40,
    model_sources: ['gfs_seamless'],
    created_at: `${date}T00:00:00.000Z`,
    is_today: date === DATES[0],
    ...over,
  }
}

function render(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(node)
}

/**
 * Each drawn bar's placement, in order: its left edge and its width, as
 * percentages of the shared scale.
 *
 * Matched as a **pair** rather than on width alone — a tappable row is a
 * `bareButton`, which carries its own `width:100%`, and matching that too
 * reported six marks for three days.
 */
function barPlacements(html: string): { left: number; width: number }[] {
  return [...html.matchAll(/left:([\d.]+)%;width:([\d.]+)%/g)].map((m) => ({
    left: Number(m[1]),
    width: Number(m[2]),
  }))
}

describe('sharedDomain', () => {
  it('spans the whole week, so a mild day and a hot day draw different bars', () => {
    // The defect this replaces normalised each row to its own min/max, which
    // drew an identical bar on every row whatever the values were. This fixture
    // is the one that catches it: two days whose *own* ranges are the same
    // width but sit at opposite ends of the week.
    const days = [
      day(DATES[0], { temp_c_min: 0, temp_c_max: 5 }),
      day(DATES[1], { temp_c_min: 30, temp_c_max: 35 }),
    ]
    expect(sharedDomain(days, 'temperature')).toEqual({ min: 0, max: 35 })
  })

  it('anchors rain and wind at zero, so a dry day is a short bar and not a full one', () => {
    const days = [day(DATES[0], { precip_mm_p50: 0.2 }), day(DATES[1], { precip_mm_p50: 8 })]
    expect(sharedDomain(days, 'rain')).toEqual({ min: 0, max: 8 })
    expect(sharedDomain([day(DATES[0], { wind_kmh_max: 30 })], 'wind')).toEqual({
      min: 0,
      max: 30,
    })
  })

  it('keeps score on a fixed 0-100 scale rather than stretching a bad week', () => {
    // Measured, a week of 20s and 30s would put the worst day at the left edge
    // and the best at the right — 35 of 100 drawn as a full bar.
    const days = [day(DATES[0], { score: 20 }), day(DATES[1], { score: 35 })]
    expect(sharedDomain(days, 'score')).toEqual({ min: 0, max: 100 })
  })

  it('gives a week that never varies a width of its own', () => {
    const flat = [day(DATES[0]), day(DATES[1])].map((d) => ({ ...d, temp_c_min: 15, temp_c_max: 15 }))
    expect(sharedDomain(flat, 'temperature')).toEqual({ min: 14, max: 16 })
  })

  it('is null when nothing in the week has a value', () => {
    const blank = [day(DATES[0], { temp_c_min: null, temp_c_max: null })]
    expect(sharedDomain(blank, 'temperature')).toBeNull()
  })
})

describe('rowSpan', () => {
  it('needs both ends of a temperature range, or neither', () => {
    // A bar from an unknown low to a known high would read as a cold night
    // nobody forecast — `null` coerces to 0 °C, which is 32°F on screen.
    expect(rowSpan(day(DATES[0], { temp_c_min: null }), 'temperature')).toBeNull()
    expect(rowSpan(day(DATES[0], { temp_c_max: null }), 'temperature')).toBeNull()
  })

  it('draws no bar for a score of null and no bar for a score that is absent', () => {
    // Two distinct states on the wire — withheld (null with a reason) and never
    // sent (a non-climbing location) — and both mean "no bar". Never a zero
    // one: 0 is a real score meaning conditions are as bad as they get.
    expect(rowSpan(day(DATES[0], { score: null }), 'score')).toBeNull()
    expect(rowSpan(day(DATES[0]), 'score')).toBeNull()
    expect(rowSpan(day(DATES[0], { score: 0 }), 'score')).toEqual({ from: 0, to: 0 })
  })
})

describe('DailyList', () => {
  const week = DATES.map((d) => day(d))

  it('draws a different bar for each day on one shared scale', () => {
    // Three days whose own ranges are all 5 °C wide but sit at opposite ends of
    // the week. **This is the fixture that threatens the invariant**: under a
    // per-row scale each row is normalised to itself, so all three come out as
    // identical full-width bars at left 0 and the list says nothing. Under the
    // shared scale they are the same width — 5 of 35 degrees — at three
    // different places, which is the comparison the list exists for.
    const varied = [
      day(DATES[0], { temp_c_min: 0, temp_c_max: 5 }),
      day(DATES[1], { temp_c_min: 15, temp_c_max: 20 }),
      day(DATES[2], { temp_c_min: 30, temp_c_max: 35 }),
    ]
    const bars = barPlacements(
      render(
        <DailyList days={varied} metric="temperature" onMetricChange={() => {}} showScoreMetric />,
      ),
    )
    expect(bars).toHaveLength(3)
    expect(bars.map((b) => Math.round(b.width))).toEqual([14, 14, 14])
    expect(bars.map((b) => Math.round(b.left))).toEqual([0, 43, 86])
  })

  it('draws an empty track for a day with no value, rather than dropping the row', () => {
    // A row that simply loses its bar is indistinguishable from a row whose
    // value happened to be zero.
    const html = render(
      <DailyList
        days={[day(DATES[0], { temp_c_max: null, temp_c_min: null }), day(DATES[1])]}
        metric="temperature"
        onMetricChange={() => {}}
        showScoreMetric
      />,
    )
    expect(barPlacements(html)).toHaveLength(1)
    expect(html).toContain('Mon, Sep 14')
    expect(html).toContain('—')
  })

  it('makes only the days the hourly response can draw tappable', () => {
    const html = render(
      <DailyList
        days={week}
        metric="temperature"
        onMetricChange={() => {}}
        showScoreMetric
        onSelectDay={() => {}}
        drawableDates={new Set([DATES[0], DATES[1]])}
      />,
    )
    // Seven rows, two of them buttons.
    expect(html.match(/<button/g)?.length).toBe(
      // the four metric chips plus the two tappable rows
      6,
    )
    expect(html).toContain('Days without an hour-by-hour forecast can’t be opened.')
  })

  it('says nothing about untappable days when every day is tappable', () => {
    const html = render(
      <DailyList
        days={week}
        metric="temperature"
        onMetricChange={() => {}}
        showScoreMetric
        onSelectDay={() => {}}
        drawableDates={new Set(DATES)}
      />,
    )
    expect(html).not.toContain('can’t be opened')
  })

  it('renders no row as a button when there is no hourly data at all', () => {
    // The `/add` preview. A row that looks tappable and does nothing is worse
    // than a row that does not.
    const html = render(
      <DailyList days={week} metric="temperature" onMetricChange={() => {}} showScoreMetric />,
    )
    expect(html.match(/<button/g)?.length).toBe(4)
  })

  it('hides the climbing metric for a location that has no score', () => {
    const html = render(
      <DailyList
        days={week}
        metric="temperature"
        onMetricChange={() => {}}
        showScoreMetric={false}
      />,
    )
    expect(html).not.toContain('Climbing')
    expect(html).toContain('Temp')
  })

  it('writes an em dash for a day with no score, never a zero', () => {
    const html = render(
      <DailyList
        days={[day(DATES[0], { score: null }), day(DATES[1], { score: 72 })]}
        metric="score"
        onMetricChange={() => {}}
        showScoreMetric
      />,
    )
    expect(html).toContain('—')
    expect(html).toContain('>72<')
    expect(html).not.toContain('>0<')
  })
})
