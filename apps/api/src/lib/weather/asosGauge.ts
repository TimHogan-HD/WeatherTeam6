import { ASOS_STATIONS } from './asosStations.js'
import { fetchWithRetry } from './openMeteo.js'

/**
 * Measured rain from the nearest airport gauge (IEM's ASOS archive, keyless):
 * the one observation a trip day's look back has, beside the model's own
 * analysis (`trip_day_outcomes`).
 *
 * **A gauge is a point.** Convective rain varies over a few kilometres, so a
 * gauge 20 km away can read dry through a crag's storm or wet through its dry
 * day. The distance travels with every reading, and `compare:trip-lead` can
 * cut on it. Past `GAUGE_MAX_KM` there is no gauge at all.
 */

/** Farthest gauge that may stand for a crag, km. */
export const GAUGE_MAX_KM = 25

/**
 * Gauges measured reading zero through real rain (`compare:rain-spread`,
 * 2026-07-03 to 09-30): 2, 5 and 0 mm where co-op and volunteer gauges 2-8 km
 * away read 189-219, 177-208 and 33-59 mm. A stuck gauge says "dry", which
 * inflates, so they never stand for a crag.
 */
export const STUCK_GAUGES: ReadonlySet<string> = new Set(['RGK', 'TWM', 'BJC'])

type StationRow = (typeof ASOS_STATIONS)[number]

export type Gauge = { station: string; tz: string; distance_km: number }

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180
  const dLat = (lat2 - lat1) * rad
  const dLon = (lon2 - lon1) * rad
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(a))
}

/** The nearest usable gauge within `GAUGE_MAX_KM`, or null (every crag outside the US). */
export function nearestGauge(lat: number, lon: number, stations: readonly StationRow[] = ASOS_STATIONS): Gauge | null {
  let best: Gauge | null = null
  for (const [station, sLat, sLon, tz] of stations) {
    if (STUCK_GAUGES.has(station)) continue
    // A cheap box first: a degree of latitude is 111 km.
    if (Math.abs(sLat - lat) > 0.5) continue
    const d = haversineKm(lat, lon, sLat, sLon)
    if (d <= GAUGE_MAX_KM && (best === null || d < best.distance_km)) {
      best = { station, tz, distance_km: Math.round(d * 10) / 10 }
    }
  }
  return best
}

/** One gauge day. `rain_mm` is null unless every hour of the day reported. */
export type GaugeDay = {
  local_date: string
  rain_mm: number | null
  hours_reported: number
  hours_expected: number
}

const HOUR_MS = 3_600_000

function localDate(ms: number, tz: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms)
}

/**
 * Sum IEM's `onlycomma` hourly rain (`p01i`, inches) into the station's local
 * days. A routine report at :5x covers the hour ending at the next :00, and an
 * hour belongs to the day it ends in, so the hour ending at local midnight is
 * the day before's.
 *
 * **A day with any hour unreported has no total** (`rain_mm` null, the counts
 * say how short it was): the missing hour may be the one it rained in, and a
 * short total reads drier than the day was. A trace (`T`) is below the
 * smallest measurable amount and adds nothing. Pure, for the tests.
 */
export function gaugeDays(csv: string, tz: string, dates: readonly string[]): GaugeDay[] {
  const byHour = new Map<number, number | null>()
  for (const line of csv.trim().split('\n').slice(1)) {
    const [, valid, p01i] = line.split(',')
    if (!valid || p01i === undefined) continue
    const at = Date.parse(`${valid.trim().replace(' ', 'T')}:00Z`)
    if (!Number.isFinite(at)) continue
    const end = Math.floor(at / HOUR_MS) * HOUR_MS + HOUR_MS
    const raw = p01i.trim()
    const mm = raw === 'M' || raw === '' ? null : raw === 'T' ? 0 : Number(raw) * 25.4
    const value = mm === null || !Number.isFinite(mm) ? null : mm
    // Two routine reports in one hour (a :50 and a :55): the first with a value stands.
    if (byHour.get(end) == null) byHour.set(end, value)
  }

  const wanted = new Set(dates)
  const days = new Map<string, GaugeDay & { sum: number }>()
  for (const d of dates) days.set(d, { local_date: d, rain_mm: null, hours_reported: 0, hours_expected: 0, sum: 0 })
  // Every hour-end that could fall in one of the dates, a day either side for any offset.
  const sorted = [...wanted].sort()
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (first === undefined || last === undefined) return []
  const from = Date.parse(`${first}T00:00:00Z`) - 86_400_000
  const to = Date.parse(`${last}T00:00:00Z`) + 2 * 86_400_000
  for (let end = from + HOUR_MS; end <= to; end += HOUR_MS) {
    const day = days.get(localDate(end - 1, tz))
    if (day === undefined) continue
    day.hours_expected += 1
    const mm = byHour.get(end)
    if (mm == null) continue
    day.hours_reported += 1
    day.sum += mm
  }
  return dates.map((d) => {
    const { sum, ...day } = days.get(d) as GaugeDay & { sum: number }
    const complete = day.hours_expected > 0 && day.hours_reported === day.hours_expected
    return { ...day, rain_mm: complete ? Math.round(sum * 100) / 100 : null }
  })
}

/** The URL for one station's routine hourly rain over a UTC span, as `gaugeDays` reads it. */
export function gaugeUrl(station: string, fromUtc: string, toUtc: string): string {
  const part = (ymd: string, n: 1 | 2) => {
    const [y, m, d] = ymd.split('-').map(Number)
    return `year${n}=${y}&month${n}=${m}&day${n}=${d}`
  }
  return (
    `https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=${encodeURIComponent(station)}&data=p01i` +
    `&${part(fromUtc, 1)}&${part(toUtc, 2)}&tz=Etc/UTC&format=onlycomma&missing=M&trace=T&report_type=3`
  )
}

/**
 * Fetch and sum one gauge's days. Throws on a failed request: the caller
 * decides that a failure writes nothing, never a dry day.
 */
export async function fetchGaugeDays(gauge: Gauge, dates: readonly string[]): Promise<GaugeDay[]> {
  const sorted = [...dates].sort()
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  if (first === undefined || last === undefined) return []
  // IEM's end day is exclusive; a day either side covers any local offset.
  const shift = (ymd: string, days: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
  const res = await fetchWithRetry(gaugeUrl(gauge.station, shift(first, -1), shift(last, 2)))
  if (!res.ok) throw new Error(`IEM ASOS ${res.status} for ${gauge.station}`)
  return gaugeDays(await res.text(), gauge.tz, dates)
}
