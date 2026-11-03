import { describe, expect, it, vi } from 'vitest'
import { GAUGE_MAX_KM, fetchGaugeDays, gaugeDays, gaugeUrl, nearestGauge } from './asosGauge.js'

/** IEM's `onlycomma` body for `station,valid,p01i`: one routine report per hour at :55, UTC. */
function csv(from: string, hours: number, value: (i: number, at: Date) => string | null): string {
  const lines = ['station,valid,p01i']
  const start = Date.parse(`${from}:55:00Z`)
  for (let i = 0; i < hours; i++) {
    const at = new Date(start + i * 3_600_000)
    const v = value(i, at)
    if (v === null) continue
    lines.push(`DLL,${at.toISOString().slice(0, 16).replace('T', ' ')},${v}`)
  }
  return lines.join('\n')
}

describe('gaugeDays', () => {
  it('sums a complete UTC day, an hour ending at midnight belonging to the day before', () => {
    // Reports 2026-10-03 23:55 .. 2026-10-05 00:55 UTC cover hours ending 10-04 00:00 .. 10-05 01:00.
    const body = csv('2026-10-03T23', 26, (_, at) => {
      // 0.10 in in the hour ending 10-04 00:00 (10-03's last hour), 0.02 in the hour ending 10-04 12:00.
      const end = at.getUTCHours() + 1
      if (at.toISOString().startsWith('2026-10-03T23')) return '0.10'
      if (at.toISOString().startsWith('2026-10-04') && end === 12) return '0.02'
      return '0.00'
    })
    const [day] = gaugeDays(body, 'Etc/UTC', ['2026-10-04'])
    expect(day).toEqual({ local_date: '2026-10-04', rain_mm: 0.51, hours_reported: 24, hours_expected: 24 })
  })

  it('withholds the total when any hour of the day is unreported or missing, and says how short it was', () => {
    const gap = csv('2026-10-03T23', 26, (i) => (i === 10 ? null : '0.00'))
    expect(gaugeDays(gap, 'Etc/UTC', ['2026-10-04'])[0]).toMatchObject({ rain_mm: null, hours_reported: 23, hours_expected: 24 })
    const missing = csv('2026-10-03T23', 26, (i) => (i === 10 ? 'M' : '0.00'))
    expect(gaugeDays(missing, 'Etc/UTC', ['2026-10-04'])[0]?.rain_mm).toBeNull()
  })

  it('reads a trace as nothing, not a measured amount', () => {
    const body = csv('2026-10-03T23', 26, (i) => (i === 5 ? 'T' : '0.00'))
    expect(gaugeDays(body, 'Etc/UTC', ['2026-10-04'])[0]?.rain_mm).toBe(0)
  })

  it('cuts days at the station’s local midnight', () => {
    // Chicago is UTC-5 in October: 10-04 local runs 05:00Z..05:00Z next day.
    // Rain only in the hour ending 05:00Z on 10-04, which is local 10-03's last hour.
    const body = csv('2026-10-03T00', 72, (_, at) => (at.toISOString().startsWith('2026-10-04T04') ? '0.50' : '0.00'))
    const [oct3, oct4] = gaugeDays(body, 'America/Chicago', ['2026-10-03', '2026-10-04'])
    expect(oct3?.rain_mm).toBe(12.7)
    expect(oct4?.rain_mm).toBe(0)
  })

  it('expects 25 hours on the day the clocks go back, so 24 reports are not a whole day', () => {
    // 2026-11-01 in Chicago is 25 hours long: 05:00Z on 11-01 to 06:00Z on 11-02.
    const all = csv('2026-10-31T23', 40, () => '0.00')
    expect(gaugeDays(all, 'America/Chicago', ['2026-11-01'])[0]).toMatchObject({ rain_mm: 0, hours_expected: 25, hours_reported: 25 })
    // Drop the hour ending 06:00Z on 11-02, the day's 25th.
    const short = csv('2026-10-31T23', 40, (_, at) => (at.toISOString().startsWith('2026-11-02T05') ? null : '0.00'))
    expect(gaugeDays(short, 'America/Chicago', ['2026-11-01'])[0]).toMatchObject({ rain_mm: null, hours_reported: 24 })
  })

  it('takes the first report with a value when an hour has two', () => {
    const body = ['station,valid,p01i', 'DLL,2026-10-04 11:50,M', 'DLL,2026-10-04 11:55,0.20', 'DLL,2026-10-04 11:57,0.90'].join('\n')
    const [day] = gaugeDays(body, 'Etc/UTC', ['2026-10-04'])
    expect(day?.hours_reported).toBe(1)
    expect(day?.rain_mm).toBeNull()
  })

  it('reads an empty archive as a day with nothing reported, never a dry one', () => {
    expect(gaugeDays('station,valid,p01i\n', 'Etc/UTC', ['2026-10-04'])[0]).toEqual({
      local_date: '2026-10-04',
      rain_mm: null,
      hours_reported: 0,
      hours_expected: 24,
    })
  })
})

describe('nearestGauge', () => {
  const stations: [string, number, number, string][] = [
    ['FAR', 44.6, -92.0, 'America/Chicago'],
    ['RGK', 44.59, -92.49, 'America/Chicago'],
    ['NEAR', 44.6, -92.45, 'America/Chicago'],
  ]

  it('skips a gauge known to read zero through rain, even when it is the closest', () => {
    // Red Wing's own airport, RGK, is under 1 km away here.
    expect(nearestGauge(44.59, -92.495, stations)).toMatchObject({ station: 'NEAR', tz: 'America/Chicago' })
  })

  it('has no gauge past GAUGE_MAX_KM', () => {
    expect(nearestGauge(45.0, -93.0, stations)).toBeNull()
    expect(GAUGE_MAX_KM).toBe(25)
  })

  it('finds a real station in the committed snapshot, and none abroad', () => {
    // Devil's Lake WI and Baraboo-Wisconsin Dells airport (DLL), ~10 km apart.
    const g = nearestGauge(43.42, -89.73)
    expect(g?.station).toBe('DLL')
    expect(g?.distance_km).toBeGreaterThan(5)
    expect(g?.distance_km).toBeLessThan(15)
    expect(nearestGauge(46.0, 7.7)).toBeNull()
  })
})

describe('fetchGaugeDays', () => {
  it('asks for a day either side of the dates and throws on a failed request', async () => {
    expect(gaugeUrl('DLL', '2026-10-03', '2026-10-06')).toContain('year1=2026&month1=10&day1=3&year2=2026&month2=10&day2=6')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 404 }))
    await expect(fetchGaugeDays({ station: 'DLL', tz: 'Etc/UTC', distance_km: 9 }, ['2026-10-04', '2026-10-05'])).rejects.toThrow('404')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('day1=3&year2=2026&month2=10&day2=7')
    fetchMock.mockRestore()
  })
})
