import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ConditionsScore, RecentPrecip, ScoreBreakdown } from '@weatherteam6/types'
import { DryingCard, windowDays } from './DryingCard.js'

/**
 * What the card says when a figure is missing, and what it says when the window
 * is shorter than the one that was asked for.
 *
 * "No rain in the past 5 days" is a claim about a *measurement*, so the three
 * ways of not having one — in flight, failed, empty — must read differently
 * (defect class 2), and the span in it has to be the span that arrived.
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

/** `count` hourly readings ending at 2026-09-15T12:00, wet where `wet` says. */
function recent(count: number, wet: Record<number, number> = {}): RecentPrecip {
  const end = Date.UTC(2026, 8, 15, 12)
  return {
    hours: Array.from({ length: count }, (_, i) => ({
      valid_at_local: new Date(end - (count - 1 - i) * 3600_000).toISOString().slice(0, 16),
      precip_mm: wet[i] ?? 0,
    })),
    utc_offset_seconds: 0,
    from_date: '2026-09-10',
  }
}

const SETTLED = { isPending: false, isError: false }

describe('DryingCard — the three ways of not having a rain history', () => {
  it('claims nothing about rain while the query is in flight', () => {
    const html = renderToStaticMarkup(
      <DryingCard score={score()} recent={{ data: undefined, isPending: true, isError: false }} />,
    )
    expect(html).not.toContain('No rain')
    expect(html).not.toContain('Past 5 days')
    // The verdict does not wait on it — it comes from a different query.
    expect(html).toContain('Climbable in ~6h')
  })

  it('says the history could not be loaded, not that there was no rain', () => {
    const html = renderToStaticMarkup(
      <DryingCard score={score()} recent={{ data: undefined, isPending: false, isError: true }} />,
    )
    expect(html).toContain('load the rain history')
    expect(html).not.toContain('No rain')
  })

  it('only claims no rain once a window actually came back empty of it', () => {
    const html = renderToStaticMarkup(
      <DryingCard score={score()} recent={{ data: recent(121), ...SETTLED }} />,
    )
    expect(html).toContain('Past 5 days')
    expect(html).toContain('No rain')
  })
})

describe('DryingCard — the figures that replaced the chart', () => {
  it('says when it last rained in words, not as a chart caption', () => {
    const html = renderToStaticMarkup(
      <DryingCard score={score({ hours_since_rain: 21 })} recent={{ data: recent(121), ...SETTLED }} />,
    )
    expect(html).toContain('Last rain')
    expect(html).toContain('about 21 hours ago')
  })

  it('caps the last-rain figure at the sentinel rather than dating an outage', () => {
    // 720 is returned both for a genuinely dry month and for a rainfall fetch
    // that failed. Neither may read as a date a trip could be planned around.
    const html = renderToStaticMarkup(
      <DryingCard score={score({ hours_since_rain: 720 })} recent={{ data: recent(121), ...SETTLED }} />,
    )
    expect(html).toContain('over 30 days ago')
    expect(html).not.toContain('720')
  })

  it('totals the window and counts the hours it fell over', () => {
    // **The wet-hour count is what the sparkline was really for.** 12.7 mm is
    // half an inch; whether it arrived in two hours or twenty is the difference
    // between a thunderstorm and three days of drizzle, and they dry at
    // completely different rates.
    const html = renderToStaticMarkup(
      <DryingCard
        score={score()}
        recent={{ data: recent(121, { 10: 5.08, 40: 2.54, 90: 5.08 }), ...SETTLED }}
      />,
    )
    expect(html).toContain('0.50 in over 3 hours')
  })

  it('says one hour, not 1 hours', () => {
    const html = renderToStaticMarkup(
      <DryingCard score={score()} recent={{ data: recent(121, { 10: 5.08 }), ...SETTLED }} />,
    )
    expect(html).toContain('over 1 hour<')
  })

  it('names the span that arrived, not the one that was asked for', () => {
    // The route asks Open-Meteo for five days and the server trims the forecast
    // tail off whatever it gets. "Past 5 days" over three hours of readings is
    // the wrong sentence about the right silence.
    const short = renderToStaticMarkup(
      <DryingCard score={score()} recent={{ data: recent(4), ...SETTLED }} />,
    )
    expect(short).toContain('This window')
    expect(short).not.toContain('5 days')
  })

  it('renders nothing about drying when there is no breakdown to read it from', () => {
    // A score row with no breakdown is the shape a withheld score arrives in.
    // "Climbable now" from a missing `hours_remaining` is a recommendation
    // nothing measured.
    const html = renderToStaticMarkup(
      <DryingCard score={null} recent={{ data: recent(121), ...SETTLED }} />,
    )
    expect(html).not.toContain('Climbable')
    expect(html).not.toContain('Last rain')
  })

  it('says climbable now only when no drying hours remain', () => {
    const wet = renderToStaticMarkup(
      <DryingCard score={score({ hours_remaining: 6 })} recent={{ data: recent(121), ...SETTLED }} />,
    )
    expect(wet).toContain('Climbable in ~6h')
    expect(wet).toContain('sandstone still drying')

    const dry = renderToStaticMarkup(
      <DryingCard score={score({ hours_remaining: 0 })} recent={{ data: recent(121), ...SETTLED }} />,
    )
    expect(dry).toContain('Climbable now')
    expect(dry).not.toContain('still drying')
  })
})

describe('windowDays', () => {
  it('measures the span that came back', () => {
    expect(windowDays(recent(121).hours)).toBe(5)
    expect(windowDays(recent(73).hours)).toBe(3)
  })

  it('has no span for a window too short to have one', () => {
    expect(windowDays(recent(1).hours)).toBeNull()
    expect(windowDays([])).toBeNull()
  })

  it('has no span when a timestamp cannot be read', () => {
    const hours = [...recent(121).hours]
    hours[0] = { valid_at_local: 'not a time', precip_mm: 0 }
    expect(windowDays(hours)).toBeNull()
  })
})

describe('DryingCard — a rock type nobody entered', () => {
  it('does not name "unknown" as the rock that is drying', () => {
    // **Found in production.** `unknown` is the column's default and means
    // nobody entered a rock type — an absent value wearing a word, which
    // rendered as "unknown still drying": a broken sentence about a real rock.
    const html = renderToStaticMarkup(
      <DryingCard
        score={score({ rock_type: 'unknown' })}
        recent={{ data: recent(121), ...SETTLED }}
      />,
    )
    expect(html).toContain('still drying')
    expect(html).not.toContain('unknown')
  })

  it('still names a rock type that was entered', () => {
    const html = renderToStaticMarkup(
      <DryingCard
        score={score({ rock_type: 'sandstone' })}
        recent={{ data: recent(121), ...SETTLED }}
      />,
    )
    expect(html).toContain('sandstone still drying')
  })
})
