import { soilStationFor, type NoaaGaugeDay, type RainGaugeReadings } from '@weatherteam6/types'
import { FETCH_BUDGET_MS } from './openMeteo.js'
import { fetchGaugeDays, nearestGauge, type Gauge, type GaugeDay } from './asosGauge.js'
import { fetchVolunteerReports, nearestVolunteerGauges, shiftDate, type VolunteerGauge, type VolunteerReport } from './cocorahsGauge.js'
import { localDateAt, withGaugeDays, withVolunteerGauges } from '../trips/tripSummary.js'
import { fetchHourlyRain, logUscrnFailure, noaaDays, type HourlyRain } from './uscrn.js'

/**
 * A crag's rain gauges over its last complete days, for the Precip tab (#479):
 * the airport and volunteer gauges an ended trip's look back shows
 * (`recordTripDays`), read live instead of from the trip tables.
 *
 * **Six days, today left out.** The Precip tab's history is today and the six
 * days before it; an airport day is not over until midnight and a volunteer
 * reads tomorrow morning for today, so today would only ever print "not every
 * hour reported" or nothing.
 *
 * **IEM load per view**: at most one ASOS request (the whole span at once) and
 * one `daily.json` per volunteer candidate per month the span touches, so 1 to
 * 7 requests, all in parallel under one shared deadline. A crag outside the
 * US has no gauge in reach and makes none. The client asks only while the
 * Precip tab is open and keeps an answer for an hour.
 */

/** The complete local days shown, newest yesterday. */
export const GAUGE_PAST_DAYS = 6

export type GaugeFetchers = {
  airport: (gauge: Gauge, dates: readonly string[], deadline: number) => Promise<GaugeDay[]>
  volunteer: (station: string, dates: readonly string[], deadline: number) => Promise<VolunteerReport[]>
  noaa: typeof fetchHourlyRain
}

const LIVE: GaugeFetchers = { airport: fetchGaugeDays, volunteer: fetchVolunteerReports, noaa: fetchHourlyRain }

/** The crag's last `GAUGE_PAST_DAYS` complete local days, oldest first. */
export function gaugeDates(now: Date, tz: string | null, lon: number): string[] {
  const today = localDateAt(now, tz, lon)
  return Array.from({ length: GAUGE_PAST_DAYS }, (_, i) => shiftDate(today, i - GAUGE_PAST_DAYS))
}

/**
 * Read every kind of gauge for a crag: airport, volunteer, and the NOAA
 * climate station of a crag in `SOIL_STATIONS` (#589). Never throws for an upstream failure:
 * a failed read is counted on the result, so the screen says the gauge did
 * not answer instead of showing a dry week (defect class 2).
 */
export async function rainGaugeReadings(
  lat: number,
  lon: number,
  now: Date,
  knownCrag: string | null = null,
  fetchers: GaugeFetchers = LIVE,
): Promise<RainGaugeReadings> {
  const airport = nearestGauge(lat, lon)
  const volunteers: VolunteerGauge[] = nearestVolunteerGauges(lat, lon)
  const dates = gaugeDates(now, airport?.tz ?? null, lon)
  const deadline = now.getTime() + FETCH_BUDGET_MS

  const noaa = soilStationFor(knownCrag)
  // From the station's midnight before the first date: its hours, bucketed onto its own days.
  const noaaFrom = Date.parse(`${dates[0] ?? ''}T00:00:00Z`) - 15 * 3_600_000

  const [airportRead, volunteerReads, noaaRead] = await Promise.all([
    Promise.allSettled(airport === null ? [] : [fetchers.airport(airport, dates, deadline)]),
    Promise.allSettled(volunteers.map((g) => fetchers.volunteer(g.station, dates, deadline))),
    Promise.allSettled(noaa === null ? [] : [fetchers.noaa(noaa, noaaFrom, now.getTime(), deadline)]),
  ])

  const airportDays = airportRead[0]?.status === 'fulfilled' ? airportRead[0].value : null
  const reports = volunteerReads.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
  const failed = volunteerReads.filter((r) => r.status === 'rejected').length
  const noaaHours: HourlyRain[] | null = noaaRead[0]?.status === 'fulfilled' ? noaaRead[0].value : null
  if (noaa !== null && noaaRead[0]?.status === 'rejected') logUscrnFailure('rain', noaa.wban, noaaRead[0].reason)
  const noaaByDate: Map<string, NoaaGaugeDay> =
    noaa === null || noaaHours === null ? new Map() : noaaDays(noaaHours, dates, noaa.tz, noaa.lon)

  const days = withVolunteerGauges(
    withGaugeDays(
      dates.map((local_date) => ({ local_date })),
      // A failed read joins nothing: every day then has no gauge, and `answered` says why.
      airport === null || airportDays === null ? null : airport,
      airport === null || airportDays === null ? [] : airportDays.map((d) => ({ station: airport.station, ...d })),
    ),
    volunteers,
    reports,
  )

  return {
    airport: airport === null ? null : { station: airport.station, distance_km: airport.distance_km, answered: airportDays !== null },
    volunteer: { stations: volunteers.length, failed },
    noaa:
      noaa === null
        ? null
        : { station: noaa.wban, name: noaa.name, distance_km: noaa.distance_km, answered: noaaHours !== null },
    // A failed read joins nothing: every day then has no NOAA figure, and `answered` says why.
    days: days.map((d) => ({ ...d, noaa_gauge: noaaByDate.get(d.local_date) ?? null })),
  }
}
