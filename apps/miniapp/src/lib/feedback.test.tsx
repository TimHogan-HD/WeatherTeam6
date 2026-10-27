import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ConditionsReadings, Conditions, Feedback, HourlyReading } from '@weatherteam6/types'
import { feedbackLines, fromLocalInputValue, shownReading, toLocalInputValue, untilFromTimeValue, untilProblem } from './feedback.js'
import { HistoryItem } from '../routes/Feedback.js'

const NOW = '2026-09-29T18:00:00.000Z'

const reading: HourlyReading = {
  valid_at: NOW,
  rock: { level: 'dry', qualified: true },
  friction: { level: 'poor', condensing: false, qualified: true },
  score: 58,
  t_surface_c: 52,
  condensation_margin_c: 20,
}

function scored(readings: Partial<ConditionsReadings> | null = {}): Conditions {
  const base = { location_id: 'loc', forecast_date: '2026-09-29' }
  // `null` is an older API that sent no readings at all, which the type no
  // longer admits — hence the cast.
  if (readings === null) return base as unknown as Conditions
  return {
    ...base,
    readings: {
      model: 'gfs_seamless',
      unavailable_reason: null,
      utc_offset_seconds: 0,
      now: reading,
      today: null,
      ...readings,
    },
  }
}

describe('shownReading', () => {
  it('captures the words and the score the card prints, with the reading’s own hour and model', () => {
    const r = shownReading(scored(), null)
    expect(r?.valid_at).toBe(NOW)
    expect(r?.model).toBe('gfs_seamless')
    expect(r?.fields.map((f) => f.label)).toEqual(['Dryness', 'Score'])
    expect(r?.fields.find((f) => f.label === 'Score')?.value).toBe('58')
  })

  it('drops the number under a Severe+ alert, as the card does, and keeps the words', () => {
    const r = shownReading(scored(), 'Extreme Heat Warning')
    expect(r?.fields.map((f) => f.label)).toEqual(['Dryness'])
  })

  it('never carries a 0-1 factor — values are words or the score', () => {
    const r = shownReading(scored(), null)
    for (const f of r?.fields ?? []) expect(f.value).not.toMatch(/^0\.\d+$/)
  })

  it('attaches nothing when there is nothing on screen', () => {
    expect(shownReading(null, null)).toBeNull()
    expect(shownReading(undefined, null)).toBeNull()
    // An older API with no `readings` field at all.
    expect(shownReading(scored(null), null)).toBeNull()
    expect(shownReading(scored({ now: null }), null)).toBeNull()
    expect(shownReading(scored({ unavailable_reason: 'model_unavailable' }), null)).toBeNull()
  })
})

describe('datetime-local round trip', () => {
  it('reads back the minute it wrote', () => {
    const ms = new Date(2026, 8, 29, 7, 5).getTime()
    expect(toLocalInputValue(ms)).toBe('2026-09-29T07:05')
    expect(fromLocalInputValue(toLocalInputValue(ms))).toBe(ms)
  })

  it('refuses an empty or malformed value rather than reading it as now or epoch', () => {
    expect(fromLocalInputValue('')).toBeNull()
    expect(fromLocalInputValue('2026-09-29')).toBeNull()
  })
})

describe('untilFromTimeValue', () => {
  const from = new Date(2026, 8, 29, 10, 30).getTime()

  it('puts the end time on the start’s own day', () => {
    expect(untilFromTimeValue(from, '14:15')).toBe(new Date(2026, 8, 29, 14, 15).getTime())
  })

  it('refuses an end at or before the start, and an empty or malformed value', () => {
    expect(untilFromTimeValue(from, '10:30')).toBeNull()
    expect(untilFromTimeValue(from, '09:00')).toBeNull()
    expect(untilFromTimeValue(from, '')).toBeNull()
    expect(untilFromTimeValue(from, '2pm')).toBeNull()
  })
})

describe('untilProblem', () => {
  const from = new Date(2026, 8, 29, 6, 0).getTime()
  const H = 3600_000

  it('passes an empty value and a finish between the start and now', () => {
    expect(untilProblem(from, '', from + 20 * H)).toBeNull()
    expect(untilProblem(from, '14:00', from + 9 * H)).toBeNull()
  })

  it('refuses a finish later than now — the server would 400 it', () => {
    // Filled in at 14:00 with an expected 17:00 finish.
    expect(untilProblem(from, '17:00', from + 8 * H)).toMatch(/later than now/)
    // Five minutes of clock skew pass, as on the server.
    expect(untilProblem(from, '14:05', from + 8 * H)).toBeNull()
  })

  it('refuses a span past the limit and a finish before the start', () => {
    expect(untilProblem(from, '22:30', from + 18 * H)).toMatch(/within 16 hours/)
    expect(untilProblem(from, '05:00', from + 8 * H)).toMatch(/after the start/)
  })
})

describe('HistoryItem', () => {
  const check: Feedback = {
    id: 'f1',
    kind: 'forecast',
    location_id: null,
    location_name: 'Red Rock',
    message: 'Seeping <left> side',
    observed_at: NOW,
    observed_conditions: 'damp',
    verdict: 'missed',
    app_readings: { valid_at: NOW, model: 'gfs_seamless', fields: [{ label: 'Dryness', value: 'Dry' }] },
    area_id: null,
    area_name: null,
    wall: null,
    observed_until: null,
    sun_exposure: null,
    created_at: NOW,
  }

  it('says where and in how much sun, and leaves the line out when nothing was said', () => {
    const html = renderToStaticMarkup(
      <HistoryItem item={{ ...check, area_name: 'Cyclops Area', wall: 'left arete', sun_exposure: 'mostly_shade' }} />,
    )
    expect(html).toContain('Cyclops Area · left arete · Mostly shade')
    expect(feedbackLines(check).where).toBeNull()
    expect(feedbackLines({ ...check, sun_exposure: 'full_sun' }).where).toBe('Full sun')
  })

  it('reads a row from an older API, with no detail fields at all, as not said', () => {
    const { area_id: _a, area_name: _n, wall: _w, observed_until: _u, sun_exposure: _s, ...old } = check
    const lines = feedbackLines(old as Feedback)
    expect(lines.where).toBeNull()
    expect(lines.head).not.toContain('–')
  })

  it('prints the end of a climbing span after its start', () => {
    const until = new Date(Date.parse(NOW) + 3 * 3600_000).toISOString()
    expect(feedbackLines({ ...check, observed_until: until }).head).toMatch(/ – \d{1,2}:\d{2}/)
  })

  it('shows what the climber saw beside what the app said', () => {
    const html = renderToStaticMarkup(<HistoryItem item={check} />)
    expect(html).toContain('Rock: Damp · Forecast: Missed')
    expect(html).toContain('App said: Dryness: Dry')
    expect(html).toContain('Red Rock')
    expect(html).toContain('Seeping &lt;left&gt; side')
  })

  it('says a check had no reading rather than showing an empty one', () => {
    const html = renderToStaticMarkup(<HistoryItem item={{ ...check, app_readings: null }} />)
    expect(html).toContain('No app reading attached')
  })

  it('shows app feedback without a verdict line', () => {
    const html = renderToStaticMarkup(
      <HistoryItem
        item={{ ...check, kind: 'app', observed_at: null, observed_conditions: null, verdict: null, app_readings: null }}
      />,
    )
    expect(html).toContain('App feedback')
    expect(html).not.toContain('Forecast:')
    expect(html).not.toContain('No app reading')
  })

  it("names the sender first only on the owner's list", () => {
    expect(feedbackLines(check, 'kyle').head.startsWith('kyle · Forecast check · Red Rock · ')).toBe(true)
    expect(feedbackLines(check).head.startsWith('Forecast check · Red Rock · ')).toBe(true)
  })

  it('offers Done only when the item can be resolved', () => {
    expect(renderToStaticMarkup(<HistoryItem item={check} />)).not.toContain('Done')
    expect(renderToStaticMarkup(<HistoryItem item={check} onResolve={() => {}} />)).toContain('>Done<')
    const pending = renderToStaticMarkup(<HistoryItem item={check} resolving onResolve={() => {}} />)
    expect(pending).toContain('Marking…')
    expect(pending).toContain('disabled')
  })
})
