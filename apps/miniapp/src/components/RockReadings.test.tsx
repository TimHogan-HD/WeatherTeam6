import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FRICTION_MECHANISM, type HourlyReading, type HourlyReadings } from '@weatherteam6/types'
import { renderInRouter } from '../test/renderInRouter.js'
import { CondensationCard } from './RockReadings.js'

const NOW = Date.parse('2026-10-29T18:10:00.000Z')
const HOUR = 3_600_000

function hour(i: number, friction: HourlyReading['friction']): HourlyReading {
  return {
    valid_at: new Date(Date.parse('2026-10-29T18:00:00.000Z') + i * HOUR).toISOString(),
    rock: { level: 'dry', qualified: true },
    friction,
    score: 80,
    t_surface_c: 12,
    condensation_margin_c: 4,
  }
}

const readings = (friction: HourlyReading['friction']): HourlyReadings => ({
  model: 'gfs_seamless',
  unavailable_reason: null,
  hours: Array.from({ length: 6 }, (_, i) => hour(i, friction)),
  days: [],
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
})

describe('CondensationCard — the friction note (moved from the Overview, owner 2026-10-29)', () => {
  it('says friction is an estimate, once', () => {
    const html = renderInRouter(
      <CondensationCard readings={readings({ level: 'good', condensing: false, qualified: true })} utcOffsetSeconds={0} />,
    )
    expect(html.split(FRICTION_MECHANISM).length - 1).toBe(1)
  })

  it('says nothing about friction when no hour carries a friction reading', () => {
    expect(renderInRouter(<CondensationCard readings={readings(null)} utcOffsetSeconds={0} />)).not.toContain(FRICTION_MECHANISM)
  })
})
