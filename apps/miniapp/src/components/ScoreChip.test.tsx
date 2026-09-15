import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ForecastSnapshot } from '@weatherteam6/types'
import { ScoreChip } from './ScoreChip.js'

/**
 * The chip's three states, and the two that must never be reached.
 *
 * It exists because the same chip is now drawn in two places; before it was
 * extracted the one in the now-line took its colour from `goodTint` whatever
 * the number was, so a 34 — "Mixed" in the words directly below it — rendered
 * lime.
 */

function day(over: Partial<ForecastSnapshot> = {}): ForecastSnapshot {
  return {
    id: 's',
    location_id: 'l',
    captured_at: '2026-09-15T00:00:00.000Z',
    forecast_date: '2026-09-15',
    precip_mm_p10: null,
    precip_mm_p50: null,
    precip_mm_p90: null,
    temp_c_min: 10,
    temp_c_max: 20,
    wind_kmh_max: null,
    humidity_pct: null,
    model_sources: null,
    created_at: '2026-09-15T00:00:00.000Z',
    ...over,
  }
}

const OPEN = { severeAlertEvent: null, alertsPending: false, showScore: true }

describe('ScoreChip', () => {
  it('colours a mixed day amber and a settled day lime', () => {
    // The rungs are `SCORE_BANDS`, the same constant `stateLabel` reads, so the
    // colour and the word cannot disagree.
    const mixed = renderToStaticMarkup(<ScoreChip day={day({ score: 45 })} {...OPEN} />)
    const settled = renderToStaticMarkup(<ScoreChip day={day({ score: 85 })} {...OPEN} />)
    expect(mixed).toContain('246,173,85')
    expect(settled).toContain('184,245,66')
    expect(mixed).not.toContain('184,245,66')
  })

  it('colours a bad day red rather than tinting every score lime', () => {
    const poor = renderToStaticMarkup(<ScoreChip day={day({ score: 20 })} {...OPEN} />)
    expect(poor).toContain('252,129,129')
    expect(poor).toContain('>20<')
  })

  it('renders nothing at all while the alerts query is in flight', () => {
    // `severeAlertEvent` answers null for a pending query exactly as it does
    // for "no severe alert", so a chip that did not wait would show an
    // unsuppressed score under a warning that has not arrived — defect class 7.
    const html = renderToStaticMarkup(
      <ScoreChip day={day({ score: 85 })} severeAlertEvent={null} alertsPending showScore />,
    )
    expect(html).toBe('')
  })

  it('is dropped, not recoloured, under a severe alert', () => {
    const html = renderToStaticMarkup(
      <ScoreChip
        day={day({ score: 85 })}
        severeAlertEvent="Excessive Heat Warning"
        alertsPending={false}
        showScore
      />,
    )
    expect(html).toBe('')
  })

  it('says why a day was withheld rather than drawing it as a bad one', () => {
    // `null` with a reason means an input could not be measured. A 0 there — or
    // an omitted chip — reads as "conditions are as bad as they get".
    const html = renderToStaticMarkup(
      <ScoreChip
        day={day({ score: null, unavailable_reason: 'rainfall_unavailable' })}
        {...OPEN}
      />,
    )
    expect(html).not.toContain('>0<')
    expect(html.length).toBeGreaterThan(0)
  })

  it('says nothing for a day simply outside the scoring window', () => {
    // `null` with no reason. Nothing was withheld; there is nothing to say.
    expect(renderToStaticMarkup(<ScoreChip day={day({ score: null })} {...OPEN} />)).toBe('')
  })

  it('says nothing for a location that has no score at all', () => {
    // A city. The route omits the merge rather than sending nulls, so the
    // fields are absent — never a zero.
    expect(renderToStaticMarkup(<ScoreChip day={day()} {...OPEN} />)).toBe('')
    expect(
      renderToStaticMarkup(<ScoreChip day={day({ score: 85 })} {...OPEN} showScore={false} />),
    ).toBe('')
  })
})
