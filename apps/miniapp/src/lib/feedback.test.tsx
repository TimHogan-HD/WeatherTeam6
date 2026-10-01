import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ConditionsReadings, Conditions, Feedback, HourlyReading } from '@weatherteam6/types'
import { fromLocalInputValue, shownReading, toLocalInputValue } from './feedback.js'
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
    expect(r?.fields.map((f) => f.label)).toEqual(['Dryness', 'Friction', 'Score'])
    expect(r?.fields.find((f) => f.label === 'Score')?.value).toBe('58')
  })

  it('drops the number under a Severe+ alert, as the card does, and keeps the words', () => {
    const r = shownReading(scored(), 'Extreme Heat Warning')
    expect(r?.fields.map((f) => f.label)).toEqual(['Dryness', 'Friction'])
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
    created_at: NOW,
  }

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

  it('offers Done only when the item can be resolved', () => {
    expect(renderToStaticMarkup(<HistoryItem item={check} />)).not.toContain('Done')
    expect(renderToStaticMarkup(<HistoryItem item={check} onResolve={() => {}} />)).toContain('>Done<')
    const pending = renderToStaticMarkup(<HistoryItem item={check} resolving onResolve={() => {}} />)
    expect(pending).toContain('Marking…')
    expect(pending).toContain('disabled')
  })
})
