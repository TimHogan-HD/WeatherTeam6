import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { TripDayForecast, TripDayLookBack } from '@weatherteam6/types'
import { TripLookBackView } from './TripLookBack.js'

const settled = <T,>(data: T) => ({ data, isPending: false, isError: false, refetch: () => {} })

const said = (recorded_at: string, lead_days: number, score: number): TripDayForecast => ({
  recorded_at,
  lead_days,
  score,
  dryness: 'dry',
  precip_mm_mean: 0,
  members_wet: 0,
  member_count: 50,
})

function view(days: TripDayLookBack[]): string {
  return renderToStaticMarkup(<TripLookBackView summary={settled(days)} trend={settled({ points: [], days: null })} />)
}

describe('TripLookBackView', () => {
  it('sets what the day turned out beside what was said first and last', () => {
    const html = view([
      {
        local_date: '2026-10-10',
        outcome: { score: 40, dryness: 'drying', rain_mm: 1.27, temp_c_max: 10, temp_c_min: 2 },
        first: said('2026-10-04T12:00:00Z', 6, 88),
        last: said('2026-10-09T12:00:00Z', 1, 61),
      },
    ])
    expect(html).toContain('Said first')
    expect(html).toContain('Dry · 88')
    expect(html).toContain('6 days out')
    expect(html).toContain('Said last')
    expect(html).toContain('Dry · 61')
    expect(html).toContain('score 40 · 0.05 in · high 50° · low 36°')
  })

  it('draws one recording once, and a day with nothing recorded as not recorded', () => {
    const once = said('2026-10-09T12:00:00Z', 1, 70)
    const html = view([
      { local_date: '2026-10-10', outcome: null, first: once, last: once },
    ])
    expect(html).toContain('Said first')
    expect(html).not.toContain('Said last')
    expect(html).toContain('Not recorded')
  })
})
