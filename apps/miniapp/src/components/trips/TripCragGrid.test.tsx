import { describe, expect, it } from 'vitest'
import type { HourlyReading, ReadingsDay } from '@weatherteam6/types'
import { renderInRouter } from '../../test/renderInRouter.js'
import type { DayReadings } from '../../lib/overview.js'
import { TripCragGrid, type GridCrag } from './TripCragGrid.js'

const DATES = ['2026-10-08', '2026-10-09']
const LEGEND = 'Dashed: not scored yet.'

function reading(score: number): HourlyReading {
  return {
    valid_at: '2026-10-08T18:00:00Z',
    rock: { level: 'dry', qualified: true },
    friction: { level: 'great', condensing: false, qualified: true },
    score,
    t_surface_c: 12,
    condensation_margin_c: 4,
  }
}

function readings(dates: readonly string[]): DayReadings {
  const days: ReadingsDay[] = dates.map((local_date) => ({ local_date, window: null, best: reading(90) }))
  return { days, utcOffsetSeconds: -18000 }
}

function crag(id: string, scored: readonly string[]): GridCrag {
  return { locationId: id, name: id, outlook: undefined, readings: readings(scored), isCrag: true, scoresFailed: null }
}

function grid(crags: readonly GridCrag[]): string {
  return renderInRouter(<TripCragGrid dates={DATES} today="2026-10-02" crags={crags} onOpenCrag={() => {}} />)
}

describe('TripCragGrid — the dashed legend', () => {
  it('is absent when every cell is scored, so it never explains a mark that is not there', () => {
    // check:ui 2026-11-23: two crags, every day scored, and the legend still read "Dashed: not scored yet."
    expect(grid([crag('a', DATES), crag('b', DATES)])).not.toContain(LEGEND)
  })

  it('shows when any one cell, on any crag, is unscored', () => {
    expect(grid([crag('a', DATES), crag('b', DATES.slice(0, 1))])).toContain(LEGEND)
  })
})
