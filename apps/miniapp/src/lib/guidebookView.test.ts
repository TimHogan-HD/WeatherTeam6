import { describe, expect, it } from 'vitest'
import type { ForecastSnapshot, HourlyReading, ReadingsDay } from '@weatherteam6/types'
import { WALL_WEEK_DAYS, mountainProjectHref, mountainProjectUrl, wallWeek } from './guidebookView.js'

describe('mountainProjectUrl', () => {
  it('links a numeric id and draws no link otherwise', () => {
    expect(mountainProjectUrl('105825372', 'route')).toBe('https://www.mountainproject.com/route/105825372')
    expect(mountainProjectUrl(null, 'route')).toBeNull()
    expect(mountainProjectUrl('../evil', 'route')).toBeNull()
  })
})

describe('wallWeek', () => {
  const row = (forecast_date: string, over: Partial<ForecastSnapshot> = {}) =>
    ({ forecast_date, temp_c_min: 8, temp_c_max: 19, score: 12, ...over }) as ForecastSnapshot
  const reading = (score: number): HourlyReading => ({
    valid_at: '2026-09-28T18:00:00Z',
    rock: { level: 'dry', qualified: true },
    friction: { level: 'great', condensing: false, qualified: true },
    score,
    t_surface_c: 18,
    condensation_margin_c: 6,
  })
  const day = (local_date: string, score: number): ReadingsDay => ({ local_date, window: null, best: reading(score) })
  const readings = (days: ReadingsDay[]) => ({ days, utcOffsetSeconds: 0 })
  // Nine days, out of order, starting the day before today.
  const forecast = ['2026-09-29', '2026-09-27', '2026-09-28', '2026-10-01', '2026-09-30', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'].map((d) => row(d))

  it('starts at today, in date order, and stops at seven days', () => {
    const out = wallWeek(forecast, '2026-09-28', null)
    expect(out.map((d) => d.local_date)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
    expect(WALL_WEEK_DAYS).toBe(7)
  })

  it('scores each day from the readings joined on its date, never the forecast row’s own', () => {
    const out = wallWeek(forecast, '2026-09-28', readings([day('2026-09-30', 70), day('2026-09-28', 88)]))
    expect(out.slice(0, 3).map((d) => d.score)).toEqual([88, null, 70])
    expect(out.some((d) => d.score === 12)).toBe(false)
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
