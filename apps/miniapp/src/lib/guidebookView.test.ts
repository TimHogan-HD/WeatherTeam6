import { describe, expect, it } from 'vitest'
import type { GuidebookWall, HourlySeries, ReadingsDay } from '@weatherteam6/types'
import { mountainProjectHref, mountainProjectUrl, wallMarkers, weekRows } from './guidebookView.js'

const wall = (id: string, lat: number | null, lon: number | null): GuidebookWall => ({
  id,
  name: id,
  lat,
  lon,
  mp_id: null,
  routes: [],
  ordered: false,
})

describe('wallMarkers', () => {
  it('numbers dots in list order and skips a wall with no point without renumbering the rest', () => {
    const m = wallMarkers([wall('a', 44.5, -92.53), wall('b', null, null), wall('c', 44.5, -92.52)])
    expect(m.map((d) => [d.id, d.number])).toEqual([
      ['a', 1],
      ['c', 3],
    ])
  })

  it('spans west to east on one scale, with north at the top', () => {
    const [w, e, n] = wallMarkers([wall('w', 44.5, -92.53), wall('e', 44.5, -92.52), wall('n', 44.503, -92.525)])
    expect(w?.x).toBeLessThan(e?.x ?? 0)
    expect(n?.y).toBeLessThan(w?.y ?? 0)
    for (const d of [w, e, n]) {
      expect(d?.x).toBeGreaterThanOrEqual(0)
      expect(d?.x).toBeLessThanOrEqual(1)
    }
  })

  it('centres walls that share one point rather than dividing by zero, without stacking them', () => {
    const [a, b] = wallMarkers([wall('a', 44.5, -92.5), wall('b', 44.5, -92.5)])
    expect(a).toMatchObject({ x: 0.5, y: 0.5 })
    expect(b?.x).toBe(0.5)
    expect(b?.y).not.toBe(0.5)
    expect(Number.isFinite(b?.y)).toBe(true)
  })
})

describe('mountainProjectUrl', () => {
  it('links a numeric id and draws no link otherwise', () => {
    expect(mountainProjectUrl('105825372', 'route')).toBe('https://www.mountainproject.com/route/105825372')
    expect(mountainProjectUrl(null, 'route')).toBeNull()
    expect(mountainProjectUrl('../evil', 'route')).toBeNull()
  })
})

describe('weekRows', () => {
  const day = (local_date: string, over: Partial<ReadingsDay> = {}): ReadingsDay => ({
    local_date,
    window: null,
    best: null,
    ...over,
  })
  const series = (days: ReadingsDay[]) =>
    ({ utc_offset_seconds: 0, readings: { model: 'gfs_seamless', unavailable_reason: null, hours: [], days } }) as unknown as HourlySeries

  it('starts at today and drops the tail of a run already past', () => {
    const rows = weekRows(series([day('2026-09-27'), day('2026-09-28'), day('2026-09-29')]), '2026-09-28')
    expect(rows.map((r) => r.title)).toEqual(['Today', 'Tue'])
  })

  it('says None for a day with no window and leaves an unread rock without a word', () => {
    const [row] = weekRows(series([day('2026-09-28')]), '2026-09-28')
    expect(row?.hours).toBe('None')
    expect(row?.rockLabel).toBeNull()
  })

  it('is empty, not a crash, when the response carries no readings', () => {
    expect(weekRows({ utc_offset_seconds: 0 } as unknown as HourlySeries, '2026-09-28')).toEqual([])
  })
})

describe('wallMarkers — overlap', () => {
  it('moves a dot that would sit on another, and leaves a clear one alone', () => {
    const [a, b, c] = wallMarkers([wall('a', 44.5, -92.53), wall('b', 44.5, -92.5299), wall('c', 44.5, -92.52)])
    expect(Math.abs((a?.y ?? 0) - (b?.y ?? 0))).toBeGreaterThan(0.1)
    expect(c?.y).toBe(a?.y)
  })
})

describe('mountainProjectHref', () => {
  const web = 'https://www.mountainproject.com/route/105825372'
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36'
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'

  it('asks Android for the MP app by package, falling back to the same web page', () => {
    const href = mountainProjectHref(web, android)
    expect(href.startsWith('intent://www.mountainproject.com/route/105825372#Intent;')).toBe(true)
    expect(href).toContain('scheme=https;')
    expect(href).toContain('package=com.mountainproject.android;')
    expect(href).toContain(`S.browser_fallback_url=${encodeURIComponent(web)};`)
    expect(href.endsWith(';end')).toBe(true)
  })

  it('leaves iOS and desktop on the plain web link, which nothing there can hand to the app', () => {
    expect(mountainProjectHref(web, iphone)).toBe(web)
    expect(mountainProjectHref(web, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(web)
  })
})
