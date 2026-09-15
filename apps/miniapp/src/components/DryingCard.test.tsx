import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ConditionsScore, RecentPrecip, ScoreBreakdown } from '@weatherteam6/types'
import { DryingCard, dayTicks } from './DryingCard.js'

/**
 * What the card says when a number is missing, and what it says when one is
 * present but small.
 *
 * Both halves have a history here. "No rain in the past 5 days" is a claim
 * about a *measurement*, so the three ways of not having one — in flight,
 * failed, empty — must read differently (defect class 2); and a sparkline
 * scaled to its own peak puts a real hour of drizzle a fraction of a pixel
 * high beside a thunderstorm, which is the same class from the other end.
 */

function breakdown(over: Partial<ScoreBreakdown['drying']> = {}): ScoreBreakdown {
  return {
    drying: {
      score: 30,
      hours_since_rain: 18,
      hours_remaining: 6,
      rock_type: 'sandstone',
      modifiers: { angle: 0, wind: 0, humidity: 0 },
      ...over,
    },
    rain: { score: 20, forecast_72h_mm: 0 },
    wind: { score: 15, max_kmh: 10 },
    temp: { score: 12, temp_c: 18 },
    humidity: { score: 8, pct: 40 },
    total: 85,
    confidence: 'high',
    computed_at: '2026-09-15T12:00:00Z',
  }
}

function score(over: Partial<ScoreBreakdown['drying']> = {}): ConditionsScore {
  return {
    id: 's1',
    location_id: 'l1',
    forecast_date: '2026-09-15',
    score: 85,
    confidence: 'high',
    component_drying_time: 30,
    component_upcoming_rain: 20,
    component_wind: 15,
    component_temp: 12,
    component_humidity: 8,
    score_breakdown: breakdown(over),
    computed_at: '2026-09-15T12:00:00Z',
    created_at: '2026-09-15T12:00:00Z',
  }
}

function recent(precip: number[]): RecentPrecip {
  return {
    hours: precip.map((precip_mm, i) => ({
      valid_at_local: `2026-09-1${1 + Math.floor(i / 24)}T${String(i % 24).padStart(2, '0')}:00`,
      precip_mm,
    })),
    utc_offset_seconds: 0,
    from_date: '2026-09-11',
  }
}

const SETTLED = { isPending: false, isError: false }

describe('DryingCard — the three ways of not having a rain history', () => {
  it('holds the chart’s space while the query is in flight, and claims nothing', () => {
    const html = renderToStaticMarkup(
      <DryingCard score={score()} recent={{ data: undefined, isPending: true, isError: false }} />,
    )
    expect(html).not.toContain('No rain')
    expect(html).not.toContain('Recent rain')
    // The reserved height is the branch. Without it the card is short, then
    // grows by 40px under the reader's thumb the moment the fetch lands — and
    // an empty fragment would pass every assertion above.
    // 56px of bars + 12px of axis + the 2px gap between them.
    expect(html).toContain('height:70px')
  })

  it('says the history could not be loaded, not that there was no rain', () => {
    const html = renderToStaticMarkup(
      <DryingCard score={score()} recent={{ data: undefined, isPending: false, isError: true }} />,
    )
    expect(html).toContain('load the rain history')
    expect(html).not.toContain('No rain in the past')
  })

  it('only claims no rain once a window actually came back empty of it', () => {
    const html = renderToStaticMarkup(
      <DryingCard score={score()} recent={{ data: recent(new Array(121).fill(0)), ...SETTLED }} />,
    )
    expect(html).toContain('No rain in the past 5 days')
    expect(html).toContain('Recent rain · past 5 days')
  })

  it('claims only the span it got, when the series is shorter than the request', () => {
    // The route asks for five days; Open-Meteo returns what it has and the
    // server trims the forecast tail off that. "No rain in the past 5 days"
    // over three hours of data is the wrong sentence about the right silence.
    const html = renderToStaticMarkup(
      <DryingCard score={score()} recent={{ data: recent([0, 0, 0]), ...SETTLED }} />,
    )
    expect(html).toContain('No rain in this window')
    expect(html).not.toContain('5 days')
  })
})

describe('DryingCard — the figures', () => {
  it('totals the whole window, not the wettest hour', () => {
    // 12.7 mm is exactly half an inch. A peak-hour total would print 0.20 in.
    const html = renderToStaticMarkup(
      <DryingCard score={score()} recent={{ data: recent([5.08, 2.54, 5.08]), ...SETTLED }} />,
    )
    expect(html).toContain('0.50 in')
  })

  it('draws a measured hour of drizzle beside a downpour rather than losing it', () => {
    // 0.1 mm against a 40 mm peak is a seventh of a pixel at the chart's
    // height. The floor is
    // what keeps "it rained a little on Friday" on the screen at all.
    const html = renderToStaticMarkup(
      <DryingCard score={score()} recent={{ data: recent([40, 0.1]), ...SETTLED }} />,
    )
    // Matched on the bar's own style rule, not on every `height` in the
    // markup — the type tokens carry line heights of their own.
    const bars = [...html.matchAll(/flex:1;min-width:0;height:([0-9.]+)px/g)].map((m) =>
      Number(m[1]),
    )
    expect(bars).toEqual([56, 2])
  })

  it('renders nothing about drying when there is no breakdown to read it from', () => {
    // A score row with no breakdown is the shape a withheld score arrives in.
    // "Climbable now" derived from a missing `hours_remaining` would be a
    // recommendation nothing measured.
    const html = renderToStaticMarkup(
      <DryingCard score={null} recent={{ data: recent([0]), ...SETTLED }} />,
    )
    expect(html).not.toContain('Climbable')
    expect(html).not.toContain('no rain in')
  })

  it('says climbable now only when no drying hours remain', () => {
    const wet = renderToStaticMarkup(
      <DryingCard score={score({ hours_remaining: 6 })} recent={{ data: recent([1]), ...SETTLED }} />,
    )
    expect(wet).toContain('in ~6h')
    expect(wet).toContain('sandstone still drying')

    const dry = renderToStaticMarkup(
      <DryingCard score={score({ hours_remaining: 0 })} recent={{ data: recent([1]), ...SETTLED }} />,
    )
    expect(dry).toContain('now')
    expect(dry).not.toContain('still drying')
  })

  it('caps hours-since-rain at the sentinel rather than printing 720h', () => {
    // 720 is returned both for a genuinely dry month and for a swallowed
    // rainfall fetch; neither may read as a precise measurement.
    const html = renderToStaticMarkup(
      <DryingCard score={score({ hours_since_rain: 720 })} recent={{ data: recent([0]), ...SETTLED }} />,
    )
    expect(html).toContain('30+ days')
    expect(html).not.toContain('720')
  })
})

describe('dayTicks — the time axis under the rain history', () => {
  /** `count` hourly samples ending at 2026-09-15T12:00 local. */
  function window(count: number): RecentPrecip['hours'] {
    const end = Date.UTC(2026, 8, 15, 12)
    return Array.from({ length: count }, (_, i) => ({
      valid_at_local: new Date(end - (count - 1 - i) * 3600_000).toISOString().slice(0, 16),
      precip_mm: 0,
    }))
  }

  it('labels each whole day back from the newest measured hour, oldest first', () => {
    // 121 hours is five whole days plus the endpoint, which is what a
    // `past_days=5` window trimmed to the current hour actually looks like.
    expect(dayTicks(window(121)).map((t) => t.label)).toEqual(['5d', '4d', '3d', '2d', '1d', 'now'])
  })

  it('labels what came back, not what was requested', () => {
    // A short upstream series must not be captioned as five days. Three days of
    // hours get three day marks, and the left edge is 3d.
    expect(dayTicks(window(73)).map((t) => t.label)).toEqual(['3d', '2d', '1d', 'now'])
  })

  it('places each mark at its own bar, not at an even division of the axis', () => {
    // With 121 bars, "1d" sits over the sample 24 hours back — bar 96 of 121 —
    // and `now` is hard against the right edge. Spacing the six labels evenly
    // would put 1d at 80%, four bars adrift, and would stay wrong in the same
    // direction for every window whose length is not a multiple of 24.
    const ticks = dayTicks(window(121))
    const byLabel = Object.fromEntries(ticks.map((t) => [t.label, t.pct]))
    expect(byLabel['1d']).toBeCloseTo(((96 + 0.5) / 121) * 100, 6)
    expect(byLabel['5d']).toBeCloseTo((0.5 / 121) * 100, 6)
    expect(byLabel['now']).toBe(100)
  })

  it('draws no axis for a window too short to have one', () => {
    expect(dayTicks(window(1))).toEqual([])
    expect(dayTicks([])).toEqual([])
  })

  it('ignores a timestamp it cannot read rather than placing a NaN', () => {
    const hours = [...window(25)]
    hours[5] = { valid_at_local: 'not a time', precip_mm: 0 }
    const ticks = dayTicks(hours)
    expect(ticks.every((t) => Number.isFinite(t.pct))).toBe(true)
    // The unreadable sample is skipped; the day mark at index 0 still lands.
    expect(ticks.map((t) => t.label)).toEqual(['1d', 'now'])
  })
})
