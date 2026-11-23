import { describe, expect, it } from 'vitest'
import { parseUsageEvent, USAGE_SCREEN_MAX } from './usage.js'

describe('parseUsageEvent', () => {
  it('accepts a route pattern, with or without a crag tab', () => {
    expect(parseUsageEvent({ screen: '/', tab: null })).toEqual({ screen: '/', tab: null })
    expect(parseUsageEvent({ screen: '/trips/:id/edit' })).toEqual({ screen: '/trips/:id/edit', tab: null })
    expect(parseUsageEvent({ screen: '/location/:id', tab: 'precip' })).toEqual({ screen: '/location/:id', tab: 'precip' })
  })

  it('refuses an address that carries an id, a query or a hash', () => {
    expect(parseUsageEvent({ screen: '/location/3f2a9c1e-0000-4000-8000-000000000001', tab: null })).toBeNull()
    expect(parseUsageEvent({ screen: '/location/:id?tab=rock', tab: null })).toBeNull()
    expect(parseUsageEvent({ screen: '/join#abc', tab: null })).toBeNull()
    expect(parseUsageEvent({ screen: 'trips', tab: null })).toBeNull()
    expect(parseUsageEvent({ screen: '', tab: null })).toBeNull()
  })

  it('refuses a tab the crag screen does not have, and a screen over the cap', () => {
    expect(parseUsageEvent({ screen: '/location/:id', tab: 'radar' })).toBeNull()
    expect(parseUsageEvent({ screen: '/' + 'a'.repeat(USAGE_SCREEN_MAX), tab: null })).toBeNull()
    expect(parseUsageEvent({ screen: '/' + 'a'.repeat(USAGE_SCREEN_MAX - 1), tab: null })).not.toBeNull()
  })

  it('refuses a body that is not an object', () => {
    expect(parseUsageEvent(null)).toBeNull()
    expect(parseUsageEvent('/')).toBeNull()
    expect(parseUsageEvent({ tab: 'overview' })).toBeNull()
  })
})
