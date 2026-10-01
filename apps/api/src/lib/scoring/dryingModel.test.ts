import { describe, it, expect } from 'vitest'
import { ROCK_TYPES, rockGuide, type DryingPace } from '@weatherteam6/types'
import { MAX_HOURS } from './dryingModel.js'

describe("the Rock tab's drying words agree with MAX_HOURS", () => {
  /**
   * `rockGuide` names a band — Hours, A day or two, Days — rather than keep a
   * copy of the table. This is what holds the words to the clock the score runs
   * on: move a rock's `MAX_HOURS` across a band edge and the tab's gauge must
   * move with it. The bands are `DryingPace`'s own definition.
   */
  function band(maxHours: number): DryingPace {
    if (maxHours <= 12) return 'hours'
    if (maxHours <= 48) return 'day'
    return 'days'
  }

  it.each(ROCK_TYPES.filter((r) => r !== 'unknown'))('%s', (rockType) => {
    expect(rockGuide(rockType)?.dries).toBe(band(MAX_HOURS[rockType]))
  })
})
