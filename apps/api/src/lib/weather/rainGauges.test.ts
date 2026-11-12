import { describe, expect, it, vi } from 'vitest'
import { GAUGE_PAST_DAYS, gaugeDates, rainGaugeReadings, type GaugeFetchers } from './rainGauges.js'
import type { GaugeDay } from './asosGauge.js'
import type { VolunteerReport } from './cocorahsGauge.js'

// Devil's Lake: DLL 11.8 km, volunteers WI-SK-26, WI-SK-36, WI-CB-5.
const DEVILS = { lat: 43.42, lon: -89.73 }
// Fontainebleau: no gauge of either kind in reach.
const ABROAD = { lat: 48.4, lon: 2.7 }
// Robinson Park, with the NOAA station Sandstone 6 W.
const ROBINSON = { lat: 46.13, lon: -92.86 }
// 2026-11-11 03:30 UTC is still the 10th in Wisconsin.
const NOW = new Date('2026-11-11T03:30:00Z')

const day = (local_date: string, rain_mm: number | null, hours_reported = 24): GaugeDay => ({
  local_date,
  rain_mm,
  hours_reported,
  hours_expected: 24,
})
const report = (station: string, report_date: string, rain_mm: number, obs_hour: number | null = 7): VolunteerReport => ({
  station,
  station_name: `${station} name`,
  report_date,
  obs_hour,
  rain_mm,
})

describe('gaugeDates', () => {
  it('is the six local days before today at the crag, oldest first, today left out', () => {
    const dates = gaugeDates(NOW, 'America/Chicago', DEVILS.lon)
    expect(dates).toHaveLength(GAUGE_PAST_DAYS)
    // The 10th is today in Chicago, though it is the 11th in UTC.
    expect(dates).toEqual(['2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09'])
  })
})

describe('rainGaugeReadings', () => {
  it('joins the airport day by date and the nearest volunteer that reported for each day', async () => {
    const fetchers: GaugeFetchers = {
      noaa: vi.fn(),
      airport: vi.fn(async () => [day('2026-11-08', 10.7), day('2026-11-09', null, 21)]),
      // WI-SK-26 skipped the 8th's report (dated the 9th); WI-SK-36 stands in for it.
      volunteer: vi.fn(async (station: string) =>
        station === 'WI-SK-26'
          ? [report('WI-SK-26', '2026-11-08', 3)]
          : station === 'WI-SK-36'
            ? [report('WI-SK-36', '2026-11-09', 9.6)]
            : [],
      ),
    }
    const out = await rainGaugeReadings(DEVILS.lat, DEVILS.lon, NOW, null, fetchers)

    expect(out.airport).toEqual({ station: 'DLL', distance_km: 11.8, answered: true })
    expect(out.volunteer).toEqual({ stations: 3, failed: 0 })
    const byDate = new Map(out.days.map((d) => [d.local_date, d]))
    expect(byDate.get('2026-11-08')?.gauge?.rain_mm).toBe(10.7)
    // A short day carries its counts and no total, never a drier one.
    expect(byDate.get('2026-11-09')?.gauge).toMatchObject({ rain_mm: null, hours_reported: 21 })
    // A day the airport sent nothing for has no gauge, not 0.
    expect(byDate.get('2026-11-04')?.gauge).toBeNull()
    // The 7th's 7 am report dated the 8th, from the nearest.
    expect(byDate.get('2026-11-07')?.volunteer_gauge).toMatchObject({ station: 'WI-SK-26', rain_mm: 3, distance_km: 6 })
    // The 8th falls to the second candidate, not to a dry day.
    expect(byDate.get('2026-11-08')?.volunteer_gauge).toMatchObject({ station: 'WI-SK-36', rain_mm: 9.6, distance_km: 7 })
    expect(byDate.get('2026-11-09')?.volunteer_gauge).toBeNull()
  })

  it('says a failed read rather than returning a dry week', async () => {
    const fetchers: GaugeFetchers = {
      noaa: vi.fn(),
      airport: vi.fn(async () => {
        throw new Error('IEM ASOS 503 for DLL')
      }),
      volunteer: vi.fn(async (station: string) => {
        if (station === 'WI-SK-26') throw new Error('IEM daily 503')
        return []
      }),
    }
    const out = await rainGaugeReadings(DEVILS.lat, DEVILS.lon, NOW, null, fetchers)

    expect(out.airport).toEqual({ station: 'DLL', distance_km: 11.8, answered: false })
    expect(out.volunteer).toEqual({ stations: 3, failed: 1 })
    expect(out.days.every((d) => d.gauge === null && d.volunteer_gauge === null)).toBe(true)
  })

  it('shares one deadline across every read', async () => {
    const deadlines: number[] = []
    const fetchers: GaugeFetchers = {
      noaa: vi.fn(),
      airport: vi.fn(async (_g, _d, deadline: number) => {
        deadlines.push(deadline)
        return []
      }),
      volunteer: vi.fn(async (_s, _d, deadline: number) => {
        deadlines.push(deadline)
        return []
      }),
    }
    await rainGaugeReadings(DEVILS.lat, DEVILS.lon, NOW, null, fetchers)
    expect(deadlines).toHaveLength(4)
    expect(new Set(deadlines).size).toBe(1)
  })

  it('calls nothing where no gauge is in reach', async () => {
    const fetchers: GaugeFetchers = { airport: vi.fn(), volunteer: vi.fn(), noaa: vi.fn() }
    const out = await rainGaugeReadings(ABROAD.lat, ABROAD.lon, NOW, null, fetchers)

    expect(out.airport).toBeNull()
    expect(out.volunteer).toEqual({ stations: 0, failed: 0 })
    expect(out.days).toHaveLength(GAUGE_PAST_DAYS)
    expect(fetchers.airport).not.toHaveBeenCalled()
    expect(fetchers.volunteer).not.toHaveBeenCalled()
    expect(fetchers.noaa).not.toHaveBeenCalled()
    expect(out.noaa).toBeNull()
  })

  it("adds the NOAA station at a crag in SOIL_STATIONS, a short day withheld", async () => {
    // Every hour from the 3rd to now at 0.5 mm, one hour of the 6th missing (Chicago days).
    const hours: { endMs: number; mm: number | null }[] = []
    for (let end = Date.UTC(2026, 10, 3, 0); end <= NOW.getTime(); end += 3_600_000) {
      if (end === Date.UTC(2026, 10, 6, 18)) continue
      hours.push({ endMs: end, mm: 0.5 })
    }
    const fetchers: GaugeFetchers = { airport: vi.fn(async () => []), volunteer: vi.fn(async () => []), noaa: vi.fn(async () => hours) }
    const out = await rainGaugeReadings(ROBINSON.lat, ROBINSON.lon, NOW, "robinson-park", fetchers)

    expect(out.noaa).toEqual({ station: "54932", name: "Sandstone 6 W", distance_km: 10.4, answered: true })
    const byDate = new Map(out.days.map((d) => [d.local_date, d.noaa_gauge]))
    expect(byDate.get("2026-11-05")).toEqual({ rain_mm: 12, hours_reported: 24, hours_expected: 24 })
    expect(byDate.get("2026-11-06")).toEqual({ rain_mm: null, hours_reported: 23, hours_expected: 24 })
  })

  it("says the NOAA read failed rather than a dry week", async () => {
    const fetchers: GaugeFetchers = {
      airport: vi.fn(async () => []),
      volunteer: vi.fn(async () => []),
      noaa: vi.fn(async () => {
        throw new Error("HTTP 200, not a partial response")
      }),
    }
    const out = await rainGaugeReadings(ROBINSON.lat, ROBINSON.lon, NOW, "robinson-park", fetchers)
    expect(out.noaa?.answered).toBe(false)
    expect(out.days.every((d) => d.noaa_gauge === null)).toBe(true)
  })
})
