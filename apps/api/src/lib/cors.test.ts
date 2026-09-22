import { describe, expect, it } from 'vitest'
import { DEFAULT_ALLOWED_ORIGINS, allowedOriginPatterns, originAllowed } from './cors.js'

describe('originAllowed', () => {
  const patterns = ['https://weatherteam6.vercel.app', 'http://localhost:5173']

  it('allows an exact match and nothing adjacent to it', () => {
    expect(originAllowed('https://weatherteam6.vercel.app', patterns)).toBe(true)
    // Scheme, host and port each have to match exactly — these are the three
    // near-misses a substring check would let through.
    expect(originAllowed('http://weatherteam6.vercel.app', patterns)).toBe(false)
    expect(originAllowed('https://weatherteam6.vercel.app.evil.com', patterns)).toBe(false)
    expect(originAllowed('https://evil-weatherteam6.vercel.app', patterns)).toBe(false)
    expect(originAllowed('http://localhost:5174', patterns)).toBe(false)
  })

  it('rejects an empty origin and an empty pattern list', () => {
    expect(originAllowed('', patterns)).toBe(false)
    expect(originAllowed('https://weatherteam6.vercel.app', [])).toBe(false)
  })

  describe('a single `*` standing for one host label', () => {
    const wildcard = ['https://*.vercel.app']

    it('matches one label', () => {
      expect(originAllowed('https://weatherteam6-abc123.vercel.app', wildcard)).toBe(true)
      expect(originAllowed('https://a.vercel.app', wildcard)).toBe(true)
    })

    it('does not match a deeper subdomain', () => {
      expect(originAllowed('https://a.b.vercel.app', wildcard)).toBe(false)
    })

    it('does not match an empty label', () => {
      expect(originAllowed('https://.vercel.app', wildcard)).toBe(false)
      expect(originAllowed('https://vercel.app', wildcard)).toBe(false)
    })

    it('is not satisfied by a path or a userinfo section', () => {
      // The two shapes that turn a naive "startsWith and endsWith" into an open
      // door. Both end with `.vercel.app` and begin with `https://`.
      expect(originAllowed('https://evil.com/x.vercel.app', wildcard)).toBe(false)
      expect(originAllowed('https://evil.com@x.vercel.app', wildcard)).toBe(false)
      expect(originAllowed('https://evil.com#x.vercel.app', wildcard)).toBe(false)
      expect(originAllowed('https://evil.com?x.vercel.app', wildcard)).toBe(false)
      expect(originAllowed('https://evil.com:8080.vercel.app', wildcard)).toBe(false)
    })

    it('does not let a wildcard in one entry widen another', () => {
      expect(originAllowed('https://anything.example.com', ['https://*.vercel.app'])).toBe(false)
    })
  })
})

describe('allowedOriginPatterns', () => {
  it('falls back to the defaults when the variable is unset', () => {
    expect(allowedOriginPatterns(undefined)).toEqual(DEFAULT_ALLOWED_ORIGINS)
  })

  it('falls back to the defaults for an empty or whitespace-only value', () => {
    // A misconfigured variable must not silently block every browser — that is
    // the harder of the two failures to diagnose from a CORS error in a console.
    expect(allowedOriginPatterns('')).toEqual(DEFAULT_ALLOWED_ORIGINS)
    expect(allowedOriginPatterns('   ')).toEqual(DEFAULT_ALLOWED_ORIGINS)
    expect(allowedOriginPatterns(' , , ')).toEqual(DEFAULT_ALLOWED_ORIGINS)
  })

  it('replaces the defaults outright rather than adding to them', () => {
    const parsed = allowedOriginPatterns('https://example.com')
    expect(parsed).toEqual(['https://example.com'])
    expect(parsed).not.toContain('https://weatherteam6.vercel.app')
  })

  it('splits on commas and trims each entry', () => {
    expect(allowedOriginPatterns(' https://a.com , https://b.com ')).toEqual([
      'https://a.com',
      'https://b.com',
    ])
  })
})
