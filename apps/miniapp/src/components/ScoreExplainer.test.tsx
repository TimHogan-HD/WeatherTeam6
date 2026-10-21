import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ScoreExplainer, ScoreExplainerParts, SCORE_EXPLAINER_ID, SCORE_EXPLAINER_PATH } from './ScoreExplainer.js'
import { bestRun } from './ScoreExplainerCharts.js'

describe('ScoreExplainer', () => {
  it('draws the reader’s own range on the grip band', () => {
    const html = renderToStaticMarkup(<ScoreExplainer rangeF={{ low: 35, high: 65 }} />)
    expect(html).toContain('Grip is full from 35°F to 65°F')
    expect(html).toContain('>65°F<')
  })

  it('draws no grip band while the range is unknown, rather than a default as the reader’s', () => {
    const html = renderToStaticMarkup(<ScoreExplainer rangeF={null} />)
    expect(html).not.toContain('Grip is full from')
    expect(html).not.toContain('60°F<')
  })

  it('states the model’s own rules, from the pinned facts', () => {
    const html = renderToStaticMarkup(<ScoreExplainer rangeF={null} />)
    expect(html).toContain('within about 4°F of its dew point')
    expect(html).toContain('dew point over 54°F')
    expect(html).toContain('best 3 hours in a row between 8am and 6pm')
    expect(html).toContain('scoring 60 or more')
    expect(html).toContain('0.4&quot; or more needs the')
  })

  it('picks the crag’s own rock out of the drying chart, adding it when it is not an example', () => {
    const html = renderToStaticMarkup(<ScoreExplainerParts rangeF={null} rockType="quartzite" />)
    expect(html).toContain('Quartzite (here)')
    expect(html).toContain('Quartzite 1 to 6 hours')
  })

  it('names no rock as the crag’s on Profile, or for an unknown rock', () => {
    expect(renderToStaticMarkup(<ScoreExplainer rangeF={null} />)).not.toContain('(here)')
    expect(renderToStaticMarkup(<ScoreExplainerParts rangeF={null} rockType="unknown" />)).not.toContain('(here)')
  })

  it('is the anchor the measurements panel links to', () => {
    const html = renderToStaticMarkup(<ScoreExplainer rangeF={null} />)
    expect(html).toContain(`id="${SCORE_EXPLAINER_ID}"`)
    expect(SCORE_EXPLAINER_PATH).toBe('/profile#score')
  })
})

describe('bestRun', () => {
  it('takes the run whose worst hour is highest, not the run with the best hour', () => {
    // 95 sits in a run whose worst is 62; 85-92-88 is the better run.
    expect(bestRun([40, 55, 70, 85, 92, 88, 82, 95, 90, 62, 45], 3)).toEqual({ start: 3, score: 85 })
  })

  it('has no run when the day is shorter than one', () => {
    expect(bestRun([90, 90], 3)).toBeNull()
  })
})
