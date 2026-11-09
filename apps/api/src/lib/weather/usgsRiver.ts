import { logger } from '../logger.js'
import { fetchWithRetry } from './openMeteo.js'
import type { RiverPoint } from '@weatherteam6/types'

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

/** How far back a reading's points reach: a day, plus the posting lag. */
export const RIVER_WINDOW_MS = 26 * 3_600_000

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
    // 26 h of 15-minute points is 104; room for a site that reports every 5.
    limit: '500',
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
    return parseRiverPoints(await res.json())
  } catch (err) {
    logger.warn({ site, err: err instanceof Error ? err.message : String(err) }, '[usgsRiver] unreadable body')
    return []
  }
}
