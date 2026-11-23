import { describe, expect, it } from 'vitest'
import { parseUsageEvent } from '@weatherteam6/types'
import { insightsRoute } from './speedInsights.js'
import { reportsItsOwnTab } from './usage.js'

const ID = '3f2a9c1e-0000-4000-8000-000000000001'

describe('reportsItsOwnTab', () => {
  it('is true exactly for the routes LocationDetail draws', () => {
    expect(reportsItsOwnTab(insightsRoute(`/location/${ID}`))).toBe(true)
    expect(reportsItsOwnTab(insightsRoute(`/location/${ID}/wall/w1`))).toBe(true)
    expect(reportsItsOwnTab(insightsRoute(`/location/${ID}/wall/w1/route/r2`))).toBe(true)
    // Edit is its own screen, reported by the shell, or it would go unrecorded.
    expect(reportsItsOwnTab(insightsRoute(`/location/${ID}/edit`))).toBe(false)
    expect(reportsItsOwnTab(insightsRoute('/'))).toBe(false)
    expect(reportsItsOwnTab(insightsRoute(`/trips/${ID}/crag/${ID}`))).toBe(false)
  })
})

describe('a reported screen', () => {
  it('passes the server’s check for every route in the app, with ids in it', () => {
    for (const path of [
      '/',
      `/location/${ID}`,
      `/location/${ID}/edit`,
      `/location/${ID}/wall/w1/route/r2`,
      '/add',
      '/feedback',
      '/map',
      '/trips',
      '/trips/new',
      `/trips/${ID}/crag/${ID}`,
      '/profile',
      '/welcome',
    ]) {
      expect(parseUsageEvent({ screen: insightsRoute(path), tab: null }), path).not.toBeNull()
    }
  })
})
