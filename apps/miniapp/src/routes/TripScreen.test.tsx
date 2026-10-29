import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { HourlySeries, WeatherAlert } from '@weatherteam6/types'
import { TripAlerts, dayReadingsFor } from './TripScreen.js'

// Partial fixture: only the fields `dayReadingsFor` reads.
const series = (unavailable_reason: string | null = null) =>
  ({
    utc_offset_seconds: -18000,
    readings: { model: 'gfs_seamless', unavailable_reason, hours: [], days: [] },
  }) as unknown as HourlySeries

describe('dayReadingsFor', () => {
  it('reads the days and the offset off /hourly, and nothing else', () => {
    // Owner, 2026-10-29: no alert withholds a trip day's score, so nothing about
    // alerts reaches the trip screen's readings.
    expect(dayReadingsFor({ data: series() })).toEqual({ days: [], utcOffsetSeconds: -18000 })
  })

  it('has nothing to score with while /hourly is in flight or failed, or when the model did not answer', () => {
    expect(dayReadingsFor({ data: undefined })).toBeNull()
    expect(dayReadingsFor({ data: series('model_unavailable') })).toBeNull()
  })
})

describe('TripAlerts', () => {
  const heat = {
    id: 'a1',
    event: 'Extreme Heat Warning',
    severity: 'Extreme',
    headline: 'Dangerously hot through Friday',
  } as WeatherAlert
  const crag = (id: string, alerts: WeatherAlert[]) => ({ id, name: `Crag ${id}`, alerts })

  // The score is no longer withheld under a warning, so the warning itself must be on screen.
  it('shows a crag\'s warning, unlabelled when the trip has one crag', () => {
    const html = renderToStaticMarkup(<TripAlerts crags={[crag('a', [heat])]} />)
    expect(html).toContain('Extreme Heat Warning')
    expect(html).toContain('Dangerously hot through Friday')
    expect(html).not.toContain('Crag a')
  })

  it('names the crag each warning is for on a several-crag trip, and skips the quiet ones', () => {
    const html = renderToStaticMarkup(<TripAlerts crags={[crag('a', []), crag('b', [heat])]} />)
    expect(html).toContain('Crag b')
    expect(html).not.toContain('Crag a')
  })

  it('renders nothing when no crag has a warning', () => {
    expect(renderToStaticMarkup(<TripAlerts crags={[crag('a', []), crag('b', [])]} />)).toBe('')
  })
})
