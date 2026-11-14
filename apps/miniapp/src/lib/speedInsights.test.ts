import { describe, expect, it } from 'vitest'
import { insightsRoute, redactInsightsEvent } from './speedInsights.js'

const UUID = '3f2b8c1e-9d4a-4e7b-a1c2-0f9e8d7c6b5a'

describe('insightsRoute', () => {
  it('names the list and plain screens by their path', () => {
    expect(insightsRoute('/')).toBe('/')
    expect(insightsRoute('')).toBe('/')
    expect(insightsRoute('/map')).toBe('/map')
    expect(insightsRoute('/trips/new')).toBe('/trips/new')
  })

  it('replaces every id with :id, however deep', () => {
    expect(insightsRoute(`/location/${UUID}`)).toBe('/location/:id')
    expect(insightsRoute(`/location/${UUID}/edit`)).toBe('/location/:id/edit')
    expect(insightsRoute(`/location/${UUID}/wall/12/route/345`)).toBe('/location/:id/wall/:id/route/:id')
    expect(insightsRoute(`/trips/${UUID}/crag/${UUID}`)).toBe('/trips/:id/crag/:id')
  })

  it('ignores a trailing slash', () => {
    expect(insightsRoute(`/location/${UUID}/`)).toBe('/location/:id')
  })
})

describe('redactInsightsEvent', () => {
  it('drops the invite code in the hash', () => {
    const out = redactInsightsEvent({ type: 'vital', url: 'https://weatherteam6.vercel.app/join#secret-code' })
    expect(out).toEqual({ type: 'vital', url: 'https://weatherteam6.vercel.app/join', route: '/join' })
    expect(JSON.stringify(out)).not.toContain('secret-code')
  })

  it('drops the query and the ids', () => {
    const out = redactInsightsEvent({
      type: 'vital',
      url: `https://weatherteam6.vercel.app/location/${UUID}?tab=rock&x=1#how`,
    })
    expect(out?.url).toBe('https://weatherteam6.vercel.app/location/:id')
    expect(out?.route).toBe('/location/:id')
    expect(JSON.stringify(out)).not.toContain(UUID)
  })

  it('drops a report whose URL cannot be read rather than send it unredacted', () => {
    expect(redactInsightsEvent({ type: 'vital', url: 'not a url #secret' })).toBeNull()
  })
})
