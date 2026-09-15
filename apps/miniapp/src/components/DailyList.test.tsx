import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ForecastSnapshot } from '@weatherteam6/types'
import type { HourlySample, HourlySeries } from '@weatherteam6/types'
import {
  DailyList,
  dayRainChance,
  rowFigures,
  rowSpan,
  rowSpread,
  sharedDomain,
} from './DailyList.js'

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
 * **Matched on `background:`, which is the bar's and only the bar's.** The band
 * behind it is now the same height and shape — that is the point of it — so
 * geometry cannot tell them apart any more. The bar takes a flat fill or a
 * gradient through `background`; the band takes `backgroundColor`, which React
 * serialises as `background-color`. Matched as a **pair** rather than on width
 * alone, too: a tappable row is a `bareButton` carrying its own `width:100%`,
 * and matching that reported six marks for three days.
 */
function barPlacements(html: string): { left: number; width: number }[] {
  return [...html.matchAll(/left:([0-9.]+)%;width:([0-9.]+)%;background:/g)].map((m) => ({
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

  it('anchors rain at zero, so a dry day is a short bar and not a full one', () => {
    const days = [day(DATES[0], { precip_mm_p50: 0.2 }), day(DATES[1], { precip_mm_p50: 8 })]
    expect(sharedDomain(days, 'rain')).toEqual({ min: 0, max: 8 })
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
    // The row keeps its weekday and its track; only the bar is gone.
    expect(html).toContain('>Mon<')
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
    // Three metric chips plus the two tappable rows.
    expect(html.match(/<button/g)?.length).toBe(5)
    expect(html).toContain('Days without an hour-by-hour forecast can&#x27;t be opened.')
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
    expect(html).not.toContain('can&#x27;t be opened')
  })

  it('renders no row as a button when there is no hourly data at all', () => {
    // The `/add` preview. A row that looks tappable and does nothing is worse
    // than a row that does not.
    const html = render(
      <DailyList days={week} metric="temperature" onMetricChange={() => {}} showScoreMetric />,
    )
    expect(html.match(/<button/g)?.length).toBe(3)
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
    // Read the row **value cells** specifically. A bare `not.toContain('>0<')`
    // over the whole markup now catches the axis labels' "0", which is the left
    // end of the 0-100 scale and entirely correct — an assertion that fails on
    // a right answer is worse than no assertion.
    // The score sits at the bar's start and its word at the end, so a day
    // with no score is a dash and an empty end rather than a zero-length bar.
    expect(rowFigureText(html)).toEqual(['—', '', '72', 'Mostly dry'])
  })
})

/** The figure at each end of each row's bar, in order: start, end, start, end. */
function rowFigureText(html: string): string[] {
  return [...html.matchAll(/text-align:(?:right|left)[^>]*>([^<]*)</g)].map((m) => m[1] ?? '')
}

/** The tick labels under the rows, in order. */
function axisLabels(html: string): string[] {
  const axis = html.slice(html.indexOf('position:relative;height:12px'))
  return [...axis.matchAll(/position:absolute;left:[^"]*">([^<]*)</g)].map((m) => m[1] ?? '')
}

describe('DailyList — the shared scale is stated, not implied', () => {
  it('labels the ruler where it is actually ruled, in the metric’s own unit', () => {
    // Seven bars at seven widths are only a comparison if something says they
    // share a ruler — and the ends of it alone leave everything in between to
    // be guessed at, which is what the three-part note under the rows did.
    const html = render(
      <DailyList
        days={[
          day(DATES[0], { temp_c_min: 0, temp_c_max: 5 }),
          day(DATES[1], { temp_c_min: 30, temp_c_max: 35 }),
        ]}
        metric="temperature"
        onMetricChange={() => {}}
        showScoreMetric
      />,
    )
    // Round degrees Fahrenheit, not round Celsius: 10 °C is round and 50°F is
    // the number on screen. The domain is 32-95°F, so a 20° step is what fits.
    const ticks = axisLabels(html)
    expect(ticks).toEqual(['40°F', '60°F', '80°F'])
  })

  it('labels each tick at its own position on the track, not at even thirds', () => {
    const html = render(
      <DailyList
        days={[day(DATES[0], { temp_c_min: 0, temp_c_max: 5 }), day(DATES[1], { temp_c_min: 30, temp_c_max: 35 })]}
        metric="temperature"
        onMetricChange={() => {}}
        showScoreMetric
      />,
    )
    // 32-95°F across the track: 40°F is (40-32)/63 of the way along. Evenly
    // spacing three labels would put it at 0%, which is a whole bar adrift and
    // stays adrift in the same direction for every week.
    const lefts = [...html.matchAll(/position:absolute;left:([0-9.]+)%;transform/g)].map((m) =>
      Number(m[1]),
    )
    expect(lefts).toContain(((40 - 32) / (95 - 32)) * 100)
  })

  it('states the score scale as the fixed 0-100 it is', () => {
    const html = render(
      <DailyList
        days={[day(DATES[0], { score: 20 })]}
        metric="score"
        onMetricChange={() => {}}
        showScoreMetric
      />,
    )
    expect(axisLabels(html)).toEqual(['0', '50', '100'])
  })

  it('does not promise a band on the score metric, which has no ensemble', () => {
    // A conditions score is not an ensemble of anything. Its uncertainty is
    // `confidence`, and a legend offering "where 8 in 10 runs land" beside it
    // would describe a spread nothing computed.
    const html = render(
      <DailyList
        days={[day(DATES[0], { score: 20, confidence: 'low' })]}
        metric="score"
        onMetricChange={() => {}}
        showScoreMetric
      />,
    )
    expect(html).not.toContain('8 in 10')
    expect(html).toContain('low')
  })

  it('paints the temperature bar from the day’s low to its high', () => {
    // One colour for a day that ran 0 °C to 35 °C would pick an end and call it
    // the day. The gradient is the swing.
    const html = render(
      <DailyList
        days={[day(DATES[0], { temp_c_min: 0, temp_c_max: 35 })]}
        metric="temperature"
        onMetricChange={() => {}}
        showScoreMetric
      />,
    )
    expect(html).toContain('linear-gradient(90deg')
  })

  it('does not gradient a magnitude bar, which has only one value', () => {
    const html = render(
      <DailyList
        days={[day(DATES[0], { precip_mm_p50: 4 })]}
        metric="rain"
        onMetricChange={() => {}}
        showScoreMetric
      />,
    )
    expect(html).not.toContain('linear-gradient')
  })
})

/** An hourly run whose members disagree by `spreadC` either side of 15 °C. */
function hourly(spreadByDate: Record<string, number>): HourlySeries {
  const hours: HourlySample[] = []
  for (const [local_date, spread] of Object.entries(spreadByDate)) {
    for (let i = 0; i < 24; i++) {
      hours.push({
        valid_at: `${local_date}T${String(i).padStart(2, '0')}:00:00.000Z`,
        local_date,
        temp_c: null,
        dewpoint_c: null,
        humidity_pct: null,
        precip_mm: null,
        wind_kmh: null,
        wind_gust_kmh: null,
        wind_dir_deg: null,
        cloud_pct: null,
        pressure_hpa: null,
        temp_c_p10: 15 - spread,
        temp_c_p50: 15,
        temp_c_p90: 15 + spread,
        wind_kmh_p10: null,
        wind_kmh_p50: null,
        wind_kmh_p90: null,
        precip_mm_mean: null,
        precip_mm_p10: null,
        precip_mm_p90: null,
        precip_chance_pct: null,
        member_count: 143,
      })
    }
  }
  return {
    location_id: 'loc',
    utc_offset_seconds: 0,
    fetched_at: '2026-09-14T00:00:00.000Z',
    model: 'gfs_seamless',
    unavailable_models: [],
    hours,
    days: [],
  }
}

/** The band placements only — `background-color`, as against the bar's `background`. */
function bandPlacements(html: string): { left: number; width: number }[] {
  return [...html.matchAll(/left:([0-9.]+)%;width:([0-9.]+)%;background-color:/g)].map((m) => ({
    left: Number(m[1]),
    width: Number(m[2]),
  }))
}

describe('rowSpread — the band is the only thing on a row that changes with lead time', () => {
  const hours = hourly({ [DATES[0]]: 1, [DATES[3]]: 6 }).hours

  it('widens for a day further out, from the run the screen already has', () => {
    const near = rowSpread(day(DATES[0]), 'temperature', hours)
    const far = rowSpread(day(DATES[3]), 'temperature', hours)
    expect(near).toEqual({ from: 14, to: 16 })
    expect(far).toEqual({ from: 9, to: 21 })
  })

  it('has no band for a day the run does not reach, rather than a narrow one', () => {
    // A missing band and a band of zero width are opposite claims: "we don't
    // know" against "every run agrees exactly".
    expect(rowSpread(day(DATES[5]), 'temperature', hours)).toBeNull()
  })

  it('reads rain from the row itself, and needs both ends of it', () => {
    expect(rowSpread(day(DATES[0]), 'rain', hours)).toEqual({ from: 0, to: 4 })
    expect(rowSpread(day(DATES[0], { precip_mm_p90: null }), 'rain', hours)).toBeNull()
  })

  it('has no band for the score, which is not an ensemble of anything', () => {
    expect(rowSpread(day(DATES[0], { score: 60 }), 'score', hours)).toBeNull()
  })
})

describe('DailyList — the spread on screen', () => {
  it('draws a wider band for a day further out, on the shared scale', () => {
    const html = render(
      <DailyList
        days={[day(DATES[0]), day(DATES[3])]}
        metric="temperature"
        onMetricChange={() => {}}
        showScoreMetric
        hourly={hourly({ [DATES[0]]: 1, [DATES[3]]: 6 })}
      />,
    )
    const bands = bandPlacements(html)
    expect(bands).toHaveLength(2)
    expect(bands[1]!.width).toBeGreaterThan(bands[0]!.width * 2)
  })

  it('keeps the whole band inside the scale it is drawn against', () => {
    // 9-21 °C is wider than the rows' own 10-20 medians. A domain measured from
    // the medians alone would run the band off both ends of every track —
    // silently, because these are plain divs that do not clip.
    const days = [day(DATES[0])]
    const hours = hourly({ [DATES[0]]: 6 }).hours
    expect(sharedDomain(days, 'temperature', hours)).toEqual({ min: 9, max: 21 })

    const bands = bandPlacements(
      render(
        <DailyList
          days={days}
          metric="temperature"
          onMetricChange={() => {}}
          showScoreMetric
          hourly={hourly({ [DATES[0]]: 6 })}
        />,
      ),
    )
    expect(bands[0]).toEqual({ left: 0, width: 100 })
  })

  it('draws no band at all when the hourly run has not arrived', () => {
    // The `/add` preview, and the window before the slowest query on the screen
    // settles. A band drawn from nothing would be the narrowest on the page.
    const html = render(
      <DailyList days={[day(DATES[0])]} metric="temperature" onMetricChange={() => {}} showScoreMetric />,
    )
    expect(bandPlacements(html)).toHaveLength(0)
  })
})

describe('rowFigures — a figure at each end of the bar', () => {
  const hours = hourly({ [DATES[0]]: 1 }).hours

  it('puts the day’s low at the bar’s start and its high at the end', () => {
    // The bar then spans the distance the two figures name, instead of floating
    // beside a pair of them. This is the reference app's arrangement.
    const figures = rowFigures(day(DATES[0], { temp_c_min: 10, temp_c_max: 20 }), 'temperature', hours)
    expect(figures).toEqual({ start: '50°F', end: '68°F' })
  })

  it('pairs the rain chance with the amount, because neither says it alone', () => {
    // 0.01 in at a 60% chance is a drizzle that is fairly likely; the same
    // amount at 5% is one run out of twenty. The bar draws the second figure.
    const wet = hourly({ [DATES[0]]: 1 })
    const withChance = wet.hours.map((h, i) => ({ ...h, precip_chance_pct: i === 5 ? 60 : 10 }))
    const figures = rowFigures(day(DATES[0], { precip_mm_p50: 1 }), 'rain', withChance)
    expect(figures).toEqual({ start: '60%', end: '0.04 in' })
  })

  it('has no chance to show when no hour carries a wet count', () => {
    // `precip_chance_pct` is null for an hour no member reached, and "0%" there
    // is a confidence nobody computed.
    expect(rowFigures(day(DATES[0]), 'rain', hours).start).toBeNull()
  })

  it('pairs the score with the word the same bands give it', () => {
    expect(rowFigures(day(DATES[0], { score: 85 }), 'score', hours)).toEqual({
      start: '85',
      end: 'Dry, settled',
    })
  })

  it('writes a dash for a score that is absent or withheld, never a zero', () => {
    expect(rowFigures(day(DATES[0], { score: null }), 'score', hours).start).toBe('—')
    expect(rowFigures(day(DATES[0]), 'score', hours).start).toBe('—')
  })
})

describe('dayRainChance', () => {
  it('takes the day’s likeliest hour, and only that day’s hours', () => {
    const mixed = [
      ...hourly({ [DATES[0]]: 1 }).hours.map((h, i) => ({
        ...h,
        precip_chance_pct: i === 3 ? 45 : 10,
      })),
      ...hourly({ [DATES[1]]: 1 }).hours.map((h) => ({ ...h, precip_chance_pct: 90 })),
    ]
    expect(dayRainChance(mixed, DATES[0])).toBe(45)
    expect(dayRainChance(mixed, DATES[1])).toBe(90)
  })

  it('is null when nothing on that day carries a wet count', () => {
    expect(dayRainChance(hourly({ [DATES[0]]: 1 }).hours, DATES[0])).toBeNull()
    expect(dayRainChance([], DATES[0])).toBeNull()
  })
})
