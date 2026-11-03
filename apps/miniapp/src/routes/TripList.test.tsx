import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Trip } from '@weatherteam6/types'
import { TripSections } from './Trips.js'

const trip = (id: string, startDate: string, endDate: string): Trip => ({
  id,
  userId: 'u',
  name: `Trip ${id}`,
  startDate,
  endDate,
  notes: null,
  climbHours: null,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: null,
  locations: [],
})

const render = (trips: Trip[]) =>
  renderToStaticMarkup(<TripSections trips={trips} today="2026-11-03" onNew={() => {}} onOpen={() => {}} />)

describe('TripSections', () => {
  it('folds ended trips under a closed Past trips section, after the coming ones', () => {
    const html = render([trip('old', '2026-09-01', '2026-09-03'), trip('next', '2026-11-20', '2026-11-22')])
    expect(html).toMatch(/<details class="wt6-why"(?![^>]*open)/)
    expect(html).toContain('Past trips (1)')
    expect(html.indexOf('Trip next')).toBeLessThan(html.indexOf('<details'))
    expect(html.indexOf('Trip old')).toBeGreaterThan(html.indexOf('<details'))
  })

  it('draws no Past trips section when nothing has ended', () => {
    expect(render([trip('next', '2026-11-20', '2026-11-22')])).not.toContain('<details')
  })

  it('still offers a new trip when every trip has ended', () => {
    const html = render([trip('old', '2026-09-01', '2026-09-03')])
    expect(html).toContain('No trips coming up.')
    expect(html).toContain('Plan a trip')
    expect(html).toContain('Past trips (1)')
  })
})
