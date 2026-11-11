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

// 2026-07-10 15:00 at a crag on UTC-5.
const NOW = Date.parse('2026-07-10T20:00:00Z')

describe('TripAlerts', () => {
  const heat = {
    id: 'a1',
    event: 'Extreme Heat Warning',
    severity: 'Extreme',
    headline: 'Dangerously hot through Friday',
  } as WeatherAlert
  const crag = (id: string, alerts: WeatherAlert[], retry: (() => void) | null = null) => ({ id, name: `Crag ${id}`, alerts, retry })

  // The score is no longer withheld under a warning, so the warning itself must be on screen.
  it('shows a crag\'s warning, unlabelled when the trip has one crag', () => {
    const html = renderToStaticMarkup(<TripAlerts crags={[crag('a', [heat])]} now={NOW} />)
    expect(html).toContain('Extreme Heat Warning')
    expect(html).toContain('Dangerously hot through Friday')
    expect(html).not.toContain('Crag a')
  })

  it('names the crag each warning is for on a several-crag trip, and skips the quiet ones', () => {
    const html = renderToStaticMarkup(<TripAlerts crags={[crag('a', []), crag('b', [heat])]} now={NOW} />)
    expect(html).toContain('Crag b')
    expect(html).not.toContain('Crag a')
  })

  it('says a failed check failed, never reading it as no warnings', () => {
    const html = renderToStaticMarkup(<TripAlerts crags={[crag('a', [], () => {})]} now={NOW} />)
    expect(html).toContain("Couldn&#x27;t load alerts. Tap to retry.")
  })

  it('renders nothing when every check answered with no warning', () => {
    expect(renderToStaticMarkup(<TripAlerts crags={[crag('a', []), crag('b', [])]} now={NOW} />)).toBe('')
  })

  it('says a crag NWS was not asked about lately went unchecked, never reading it as no warnings', () => {
    const html = renderToStaticMarkup(
      <TripAlerts crags={[crag('a', []), { ...crag('b', []), unchecked: true }]} now={NOW} />,
    )
    expect(html).toContain('Crag b')
    expect(html).toContain('Warnings not checked recently')
    expect(html).not.toContain('Crag a')
  })

  // #482: the hazard's end on the crag's clock, and the details behind a tap.
  const flood = {
    ...heat,
    id: 'a2',
    event: 'Flash Flood Warning',
    severity: 'Severe',
    description: '* WHAT...Flash flooding.\n\n* WHERE...Goodhue\nCounty.',
    instruction: 'Turn around, don\'t drown.',
    expires: '2026-07-10T22:00:00Z',
    ends: '2026-07-11T02:00:00Z',
  } as WeatherAlert

  it('prints the end from `ends` on the crag\'s clock, and opens on a tap to the description and what to do', () => {
    const html = renderToStaticMarkup(<TripAlerts crags={[{ ...crag('a', [flood]), utcOffsetSeconds: -18000 }]} now={NOW} />)
    expect(html).toContain('Until 9 PM')
    // `expires` (5 PM local) is when the message lapses, never printed as "until".
    expect(html).not.toContain('5 PM')
    expect(html).toMatch(/<details class="wt6-alert"(?![^>]*open)/)
    expect(html).toContain('* WHERE...Goodhue County.')
    expect(html).toContain('What to do')
    expect(html).toContain('Turn around, don&#x27;t drown.')
  })

  it('withholds the end until the crag\'s offset is in, never reading it on the phone\'s clock', () => {
    const html = renderToStaticMarkup(<TripAlerts crags={[crag('a', [flood])]} now={NOW} />)
    expect(html).not.toContain('Until')
  })

  it('draws a warning with no details as a plain card, not a disclosure that opens on nothing', () => {
    const html = renderToStaticMarkup(
      <TripAlerts crags={[{ ...crag('a', [{ ...heat, description: '  \n ', instruction: null }]), utcOffsetSeconds: -18000 }]} now={NOW} />,
    )
    expect(html).not.toContain('<details')
    expect(html).toContain('Extreme Heat Warning')
  })

  it('reads an alert from an API older than #482 (no `ends`, no `instruction`) with no end line', () => {
    const html = renderToStaticMarkup(
      <TripAlerts crags={[{ ...crag('a', [{ ...heat, description: 'Hot.' }]), utcOffsetSeconds: -18000 }]} now={NOW} />,
    )
    expect(html).not.toContain('Until')
    expect(html).not.toContain('What to do')
    expect(html).toContain('Hot.')
  })
})
