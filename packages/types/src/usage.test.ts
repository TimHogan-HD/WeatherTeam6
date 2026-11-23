import { describe, expect, it } from 'vitest'
import { parseUsageEvent, USAGE_SCREEN_MAX } from './usage.js'

const VISIT = '0b9f6a52-3c1d-4e7a-9f20-6d8e5c4b3a21'

describe('parseUsageEvent', () => {
  it('accepts a route pattern, with or without a crag tab', () => {
    expect(parseUsageEvent({ visit: VISIT, screen: '/', tab: null })).toEqual({ visit: VISIT, screen: '/', tab: null })
    expect(parseUsageEvent({ visit: VISIT, screen: '/trips/:id/edit' })).toEqual({ visit: VISIT, screen: '/trips/:id/edit', tab: null })
    expect(parseUsageEvent({ visit: VISIT, screen: '/location/:id', tab: 'precip' })).toEqual({
      visit: VISIT,
      screen: '/location/:id',
      tab: 'precip',
    })
  })

  it('refuses an address that carries an id, a query or a hash', () => {
    for (const screen of ['/location/3f2a9c1e-0000-4000-8000-000000000001', '/location/:id?tab=rock', '/join#abc', 'trips', '']) {
      expect(parseUsageEvent({ visit: VISIT, screen, tab: null }), screen).toBeNull()
    }
  })

  it('refuses a missing or malformed visit id', () => {
    expect(parseUsageEvent({ screen: '/', tab: null })).toBeNull()
    expect(parseUsageEvent({ visit: 'tim', screen: '/', tab: null })).toBeNull()
    // A v1 uuid is time-and-host based; the app only ever sends random (v4) ones.
    expect(parseUsageEvent({ visit: '0b9f6a52-3c1d-1e7a-9f20-6d8e5c4b3a21', screen: '/', tab: null })).toBeNull()
    expect(parseUsageEvent({ visit: VISIT.toUpperCase(), screen: '/', tab: null })).toBeNull()
  })

  it('refuses a tab the crag screen does not have, and a screen over the cap', () => {
    expect(parseUsageEvent({ visit: VISIT, screen: '/location/:id', tab: 'radar' })).toBeNull()
    expect(parseUsageEvent({ visit: VISIT, screen: '/' + 'a'.repeat(USAGE_SCREEN_MAX), tab: null })).toBeNull()
    expect(parseUsageEvent({ visit: VISIT, screen: '/' + 'a'.repeat(USAGE_SCREEN_MAX - 1), tab: null })).not.toBeNull()
  })

  it('refuses a body that is not an object', () => {
    expect(parseUsageEvent(null)).toBeNull()
    expect(parseUsageEvent('/')).toBeNull()
  })
})
