import { GAUGE_MAX_KM, haversineKm } from './asosGauge.js'
import { COCORAHS_STATIONS } from './cocorahsStations.js'
import { fetchWithRetry } from './openMeteo.js'

/**
 * Measured rain from volunteer gauges (CoCoRaHS, through IEM's keyless
 * archive): a second observation for a trip day's look back, where the
 * airport gauge is far away or stuck (#463). Red Wing has no airport gauge it
 * can use; WI-PC-38, 6 km away, reported every day of October 2026.
 *
 * **One reading a day, not a calendar day.** A volunteer reads the gauge once,
 * usually around 7 am, and the report covers the 24 hours before it. It can
 * check a day's rain total; it cannot drive the drying clock. The window
 * travels with every reading and the screen prints it as it is.
 *
 * **Volunteers skip days.** A missing report is no row, never a dry day.
 */

/** The nearest stations a crag reads from: the nearest that reported on a day stands for it. */
export const VOLUNTEER_CANDIDATES = 3

/**
 * A report read at or after this local hour stands for its own date's daytime;
 * before it, the next date's report does. A 7 am reading dated the 30th covers
 * 7 am on the 29th to 7 am on the 30th, the whole of the 29th's climbing day;
 * a 6 pm reading dated the 29th covers it too. Midday splits the day either
 * way, so the split is there.
 */
export const AFTERNOON_READING_HOUR = 13

type StationRow = (typeof COCORAHS_STATIONS)[number]

export type VolunteerGauge = { station: string; distance_km: number }

/** Up to `VOLUNTEER_CANDIDATES` stations within `GAUGE_MAX_KM`, nearest first. */
export function nearestVolunteerGauges(
  lat: number,
  lon: number,
  stations: readonly StationRow[] = COCORAHS_STATIONS,
): VolunteerGauge[] {
  const near: VolunteerGauge[] = []
  for (const [station, sLat, sLon] of stations) {
    // A cheap box first: a degree of latitude is 111 km.
    if (Math.abs(sLat - lat) > 0.5) continue
    const d = haversineKm(lat, lon, sLat, sLon)
    if (d <= GAUGE_MAX_KM) near.push({ station, distance_km: Math.round(d * 10) / 10 })
  }
  return near.sort((a, b) => a.distance_km - b.distance_km).slice(0, VOLUNTEER_CANDIDATES)
}

/** One volunteer's daily report. `obs_hour` is the local hour it was read, null when IEM has none. */
export type VolunteerReport = {
  station: string
  station_name: string
  report_date: string
  obs_hour: number | null
  rain_mm: number
}

const DAY_MS = 86_400_000

export function shiftDate(ymd: string, days: number): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/**
 * The report that stands for `day`'s daytime, among one station's reports:
 * the next date's for a morning reading, the same date's for an afternoon or
 * evening one (`AFTERNOON_READING_HOUR`). A report with no reading hour has
 * no known window and stands for nothing.
 */
export function reportForDay<R extends Pick<VolunteerReport, 'report_date' | 'obs_hour'>>(
  day: string,
  reports: readonly R[],
): R | null {
  const next = shiftDate(day, 1)
  return (
    reports.find(
      (r) =>
        r.obs_hour !== null &&
        (r.obs_hour < AFTERNOON_READING_HOUR ? r.report_date === next : r.report_date === day),
    ) ?? null
  )
}

type DailyRow = { station?: unknown; name?: unknown; date?: unknown; precip?: unknown; temp_hour?: unknown }

/**
 * IEM's `daily.json` rows as reports, kept to `dates`. A row without a rain
 * figure is a day the volunteer did not report it, and is left out. A trace
 * (IEM's 0.0001 in) stays above zero, unlike an airport hour's: it is the
 * day's one figure, and says the volunteer saw rain too small to measure, so
 * `formatPrecipIn` prints `trace`, never `0 in`. Pure, for the tests.
 */
export function parseReports(body: unknown, dates: ReadonlySet<string>): VolunteerReport[] {
  const rows = (body as { data?: unknown } | null)?.data
  if (!Array.isArray(rows)) throw new Error('IEM daily: no data array')
  return (rows as DailyRow[]).flatMap((r): VolunteerReport[] => {
    if (typeof r.station !== 'string' || typeof r.date !== 'string' || !dates.has(r.date)) return []
    if (typeof r.precip !== 'number' || !Number.isFinite(r.precip) || r.precip < 0) return []
    const hour = typeof r.temp_hour === 'number' && r.temp_hour >= 0 && r.temp_hour < 24 ? Math.floor(r.temp_hour) : null
    return [
      {
        station: r.station,
        station_name: typeof r.name === 'string' && r.name.trim() !== '' ? r.name.trim() : r.station,
        report_date: r.date,
        obs_hour: hour,
        // Four places, so a trace's 0.0025 mm stays above zero.
        rain_mm: Math.round(r.precip * 25.4 * 10_000) / 10_000,
      },
    ]
  })
}

/** IEM names a CoCoRaHS network by state, which is the id's first part: `WI-PC-38` is `WI_COCORAHS`. */
export function reportUrl(station: string, year: number, month: number): string {
  const state = station.split('-')[0] ?? ''
  return (
    `https://mesonet.agron.iastate.edu/api/1/daily.json?station=${encodeURIComponent(station)}` +
    `&network=${encodeURIComponent(`${state}_COCORAHS`)}&year=${year}&month=${month}`
  )
}

/**
 * Fetch one station's reports that could stand for any of `days`: each day's
 * own date and the next. Throws on a failed request: the caller decides that
 * a failure writes nothing, never a dry day.
 */
export async function fetchVolunteerReports(station: string, days: readonly string[]): Promise<VolunteerReport[]> {
  const dates = new Set(days.flatMap((d) => [d, shiftDate(d, 1)]))
  const months = [...new Set([...dates].map((d) => d.slice(0, 7)))].sort()
  const reports: VolunteerReport[] = []
  for (const ym of months) {
    const [year, month] = ym.split('-').map(Number) as [number, number]
    const res = await fetchWithRetry(reportUrl(station, year, month))
    if (!res.ok) throw new Error(`IEM daily ${res.status} for ${station}`)
    reports.push(...parseReports(await res.json(), dates))
  }
  return reports
}
