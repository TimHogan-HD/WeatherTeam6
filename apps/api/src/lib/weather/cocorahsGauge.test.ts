import { describe, expect, it, vi } from 'vitest'
import {
  VOLUNTEER_CANDIDATES,
  fetchVolunteerReports,
  nearestVolunteerGauges,
  parseReports,
  reportForDay,
  reportUrl,
} from './cocorahsGauge.js'

/** IEM's `daily.json` row, the fields `parseReports` reads. */
const daily = (date: string, precip: number | null, temp_hour: number | null = 7, station = 'WI-PC-38') => ({
  station,
  date,
  precip,
  name: 'Hager City 1.8 WNW',
  temp_hour,
})

describe('parseReports', () => {
  const dates = new Set(['2026-10-29', '2026-10-30'])

  it('reads inches as millimetres, a trace as nothing, and keeps only the asked dates', () => {
    const reports = parseReports(
      { data: [daily('2026-10-28', 1), daily('2026-10-29', 0.0001), daily('2026-10-30', 0.42)] },
      dates,
    )
    expect(reports).toEqual([
      { station: 'WI-PC-38', station_name: 'Hager City 1.8 WNW', report_date: '2026-10-29', obs_hour: 7, rain_mm: 0 },
      { station: 'WI-PC-38', station_name: 'Hager City 1.8 WNW', report_date: '2026-10-30', obs_hour: 7, rain_mm: 10.67 },
    ])
  })

  it('leaves out a day the volunteer did not report, never a dry one', () => {
    expect(parseReports({ data: [daily('2026-10-29', null)] }, dates)).toEqual([])
  })

  it('keeps a report with no reading hour, with the hour null, and an hour like 7.5 as 7', () => {
    const [none, half] = parseReports({ data: [daily('2026-10-29', 0, null), daily('2026-10-30', 0, 7.5)] }, dates)
    expect(none?.obs_hour).toBeNull()
    expect(half?.obs_hour).toBe(7)
  })

  it('throws on a body that is not IEM’s table, so a failure never reads as no reports', () => {
    expect(() => parseReports({ error: 'nope' }, dates)).toThrow('no data array')
  })
})

describe('reportForDay', () => {
  const r = (report_date: string, obs_hour: number | null) => ({ report_date, obs_hour })

  it('takes the next date’s morning reading for a day: 7 am on the 30th covers the 29th', () => {
    expect(reportForDay('2026-10-29', [r('2026-10-29', 7), r('2026-10-30', 7)])).toEqual(r('2026-10-30', 7))
  })

  it('takes the same date’s reading when the volunteer reads in the afternoon or evening', () => {
    expect(reportForDay('2026-10-29', [r('2026-10-29', 18), r('2026-10-30', 18)])).toEqual(r('2026-10-29', 18))
    expect(reportForDay('2026-10-29', [r('2026-10-29', 12), r('2026-10-30', 12)])).toEqual(r('2026-10-30', 12))
    expect(reportForDay('2026-10-29', [r('2026-10-29', 13), r('2026-10-30', 13)])).toEqual(r('2026-10-29', 13))
  })

  it('has nothing for a skipped morning, and nothing from a report with no known hour', () => {
    expect(reportForDay('2026-10-29', [r('2026-10-29', 7)])).toBeNull()
    expect(reportForDay('2026-10-29', [r('2026-10-30', null), r('2026-10-29', null)])).toBeNull()
  })

  it('crosses a month end', () => {
    expect(reportForDay('2026-10-31', [r('2026-11-01', 7)])).toEqual(r('2026-11-01', 7))
  })
})

describe('nearestVolunteerGauges', () => {
  const stations: [string, number, number][] = [
    ['FAR', 44.8, -92.5],
    ['B', 44.6, -92.53],
    ['A', 44.6, -92.52],
    ['C', 44.62, -92.52],
    ['D', 44.65, -92.52],
  ]

  it('lists the nearest stations within reach, nearest first, at most VOLUNTEER_CANDIDATES', () => {
    const got = nearestVolunteerGauges(44.6, -92.52, stations)
    expect(got.map((g) => g.station)).toEqual(['A', 'B', 'C'])
    expect(got).toHaveLength(VOLUNTEER_CANDIDATES)
    expect(got[0]?.distance_km).toBe(0)
  })

  it('has none past 25 km', () => {
    expect(nearestVolunteerGauges(45.5, -92.52, stations)).toEqual([])
  })

  it('finds Red Wing’s gauge across the river in the committed snapshot, and none abroad', () => {
    // Barn Bluff, Red Wing MN; WI-PC-38 reported every day of October 2026 (#463).
    const got = nearestVolunteerGauges(44.566, -92.522)
    expect(got.map((g) => g.station)).toContain('WI-PC-38')
    expect(nearestVolunteerGauges(46.0, 7.7)).toEqual([])
  })
})

describe('fetchVolunteerReports', () => {
  it('names the network from the station’s state and asks each month the reports span', async () => {
    expect(reportUrl('WI-PC-38', 2026, 10)).toContain('station=WI-PC-38&network=WI_COCORAHS&year=2026&month=10')
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (url) =>
        String(url).includes('month=10')
          ? Response.json({ data: [daily('2026-10-31', 0.14)] })
          : Response.json({ data: [daily('2026-11-01', 0)] }),
      )
    const reports = await fetchVolunteerReports('WI-PC-38', ['2026-10-31'])
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(reports.map((r) => r.report_date)).toEqual(['2026-10-31', '2026-11-01'])
    fetchMock.mockRestore()
  })

  it('throws on a failed request, so the caller writes nothing', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 404 }))
    await expect(fetchVolunteerReports('WI-PC-38', ['2026-10-29'])).rejects.toThrow('404')
    fetchMock.mockRestore()
  })
})
