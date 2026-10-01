import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ScoreExplainer, SCORE_EXPLAINER_ID, SCORE_EXPLAINER_PATH } from './ScoreExplainer.js'

describe('ScoreExplainer', () => {
  it('quotes the reader’s own range in the heat and cold rules', () => {
    const html = renderToStaticMarkup(<ScoreExplainer rangeF={{ low: 35, high: 65 }} />)
    expect(html).toContain('your high, 65°F')
    expect(html).toContain('your low, 35°F')
  })

  it('names the range without quoting a default as the reader’s while it loads', () => {
    const html = renderToStaticMarkup(<ScoreExplainer rangeF={null} />)
    expect(html).toContain('the high end of your range')
    expect(html).not.toContain('your high, 60°F')
  })

  it('states the model’s own rules, from the pinned facts', () => {
    const html = renderToStaticMarkup(<ScoreExplainer rangeF={null} />)
    expect(html).toContain('within about 4°F of its dew point')
    expect(html).toContain('dew point of 54°F')
    expect(html).toContain('3-hour stretch between 8am and 6pm')
    expect(html).toContain('scoring 60 or more')
  })

  it('is the anchor the measurements panel links to', () => {
    const html = renderToStaticMarkup(<ScoreExplainer rangeF={null} />)
    expect(html).toContain(`id="${SCORE_EXPLAINER_ID}"`)
    expect(SCORE_EXPLAINER_PATH).toBe('/profile#score')
  })
})
