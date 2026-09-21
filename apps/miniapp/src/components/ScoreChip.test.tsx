import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ScoreChip } from './ScoreChip.js'

/**
 * The chip's three states.
 *
 * It exists because the same chip is drawn in two places; before it was
 * extracted the one in the now-line took its colour from `goodTint` whatever
 * the number was, so a 34 rendered lime.
 *
 * **Suppression is no longer tested here, because it no longer lives here.**
 * `summarizeReadings` decides whether there is a number to draw — it is the
 * thing that also decides the words, and two copies of that rule could only
 * disagree. What is left is a renderer, and these are its states.
 */

describe('ScoreChip', () => {
  it('colours a mixed day amber and a settled day lime', () => {
    // The rungs are `SCORE_BANDS`, so the colour ladder is the one the rest of
    // the app draws scores against.
    const mixed = renderToStaticMarkup(<ScoreChip score={45} />)
    const settled = renderToStaticMarkup(<ScoreChip score={85} />)
    expect(mixed).toContain('246,173,85')
    expect(settled).toContain('184,245,66')
    expect(mixed).not.toContain('184,245,66')
  })

  it('colours a bad day red rather than tinting every score lime', () => {
    const poor = renderToStaticMarkup(<ScoreChip score={20} />)
    expect(poor).toContain('252,129,129')
    expect(poor).toContain('>20<')
  })

  it('draws a real zero rather than treating it as nothing to say', () => {
    // 0 is a score and it means the wall is wet or running with condensation.
    // Falling through to the empty branch would hide the worst day there is.
    const html = renderToStaticMarkup(<ScoreChip score={0} />)
    expect(html).toContain('>0<')
  })

  it('says why a reading was withheld rather than drawing it as a bad one', () => {
    // `null` with a reason means the model could not read this spot. A 0 there
    // — or an omitted chip — reads as "conditions are as bad as they get".
    const html = renderToStaticMarkup(
      <ScoreChip score={null} unavailableReason="insufficient_history" />,
    )
    expect(html).not.toContain('>0<')
    expect(html).toContain('Not enough recent weather')
  })

  it('says nothing for a null score with no reason', () => {
    // Suppressed by an alert, outside the window, or an alerts query still in
    // flight. The caller passes null for all three and there is nothing to say.
    expect(renderToStaticMarkup(<ScoreChip score={null} />)).toBe('')
  })

  it('treats an absent score as no score, not as a zero', () => {
    // A response from before a field existed arrives with it missing rather
    // than null, and `undefined` passes every `=== null` guard.
    expect(renderToStaticMarkup(<ScoreChip score={undefined} />)).toBe('')
  })
})
