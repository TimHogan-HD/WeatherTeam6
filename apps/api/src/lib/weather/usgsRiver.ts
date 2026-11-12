import { logger } from '../logger.js'
import { fetchWithRetry } from './openMeteo.js'
import { RIVER_HISTORY_DAYS, type RiverPoint } from '@weatherteam6/types'

/**
 * Gage height (USGS parameter 00065, ft) from USGS's Water Data OGC API,
 * keyless. Not the legacy `waterservices.usgs.gov`, which USGS retires in
 * February 2027.
 *
 * Observations are 15-minute and post with a lag of an hour or two; the
 * caller judges staleness (`riverState`), this file only reports what came.
 */
const ITEMS_URL = 'https://api.waterdata.usgs.gov/ogcapi/v0/collections/continuous/items'
const GAGE_HEIGHT = '00065'

/**
 * How far back a reading's points reach: the Gauges card's 15-day chart (#589).
 * The change line still reads about a day of it (`riverChangeFt`).
 */
export const RIVER_WINDOW_MS = RIVER_HISTORY_DAYS * 24 * 3_600_000

const HOUR_MS = 3_600_000

/**
 * A request-time fetch: short, so a slow USGS holds up only this card and
 * never the function's 60 s.
 */
const RIVER_BUDGET_MS = 15_000

/** The items URL for one site's gage height between two instants. */
export function riverItemsUrl(site: string, fromMs: number, toMs: number): string {
  const params = new URLSearchParams({
    f: 'json',
    monitoring_location_id: site,
    parameter_code: GAGE_HEIGHT,
    time: `${new Date(fromMs).toISOString()}/${new Date(toMs).toISOString()}`,
    properties: 'time,value,unit_of_measure',
    skipGeometry: 'true',
    // 15 days of 15-minute points is about 1,440 (1,436 at 05336700 on
    // 2026-11-12). A site reporting every 5 minutes would overflow it and could
    // lose its newest points, which reads as stale (a gap), never a wrong height.
    limit: '2000',
  })
  return `${ITEMS_URL}?${params.toString()}`
}

/**
 * The response's observations in feet, oldest first. A point with no time, a
 * value that is not a finite number, or a unit other than feet is dropped,
 * never read as zero. Pure, for the tests.
 */
export function parseRiverPoints(body: unknown): RiverPoint[] {
  if (typeof body !== 'object' || body === null) return []
  const features = (body as { features?: unknown }).features
  if (!Array.isArray(features)) return []
  const points: { ms: number; point: RiverPoint }[] = []
  for (const f of features) {
    const p = (f as { properties?: unknown } | null)?.properties
    if (typeof p !== 'object' || p === null) continue
    const { time, value, unit_of_measure } = p as Record<string, unknown>
    if (typeof time !== 'string') continue
    const ms = Date.parse(time)
    if (!Number.isFinite(ms)) continue
    if (unit_of_measure !== 'ft') continue
    // USGS sends values as strings; an empty string must not become 0.
    if (typeof value !== 'string' && typeof value !== 'number') continue
    if (typeof value === 'string' && value.trim() === '') continue
    const height = Number(value)
    if (!Number.isFinite(height)) continue
    points.push({ ms, point: { at: new Date(ms).toISOString(), height_ft: height } })
  }
  points.sort((a, b) => a.ms - b.ms)
  return points.map((p) => p.point)
}

/**
 * The last observation in each clock hour, oldest first: 15 days of 15-minute
 * points is ~1,400, and the card draws hours. The newest observation is the
 * last of its hour, so it is always kept and `riverState` reads it as it came.
 * Expects `points` oldest first, as `parseRiverPoints` returns them.
 */
export function thinToHourly(points: readonly RiverPoint[]): RiverPoint[] {
  const out: RiverPoint[] = []
  let lastHour: number | null = null
  for (const p of points) {
    const hour = Math.floor(Date.parse(p.at) / HOUR_MS)
    if (hour === lastHour) out[out.length - 1] = p
    else out.push(p)
    lastHour = hour
  }
  return out
}

/**
 * The last `RIVER_WINDOW_MS` of gage height at `site`. **Empty when USGS did not
 * answer**, which the card shows as a gap, never as a low river.
 */
export async function fetchRiverPoints(site: string, nowMs: number = Date.now()): Promise<RiverPoint[]> {
  let res: Response
  try {
    res = await fetchWithRetry(riverItemsUrl(site, nowMs - RIVER_WINDOW_MS, nowMs), 3, undefined, Date.now() + RIVER_BUDGET_MS)
  } catch (err) {
    logger.warn({ site, err: err instanceof Error ? err.message : String(err) }, '[usgsRiver] fetch failed after retries')
    return []
  }
  if (!res.ok) {
    logger.warn({ site, statusCode: res.status }, '[usgsRiver] non-ok response')
    return []
  }
  try {
    return thinToHourly(parseRiverPoints(await res.json()))
  } catch (err) {
    logger.warn({ site, err: err instanceof Error ? err.message : String(err) }, '[usgsRiver] unreadable body')
    return []
  }
}
