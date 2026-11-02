import { logger } from '../logger.js'
import { fetchWithRetry } from './openMeteo.js'
import { readMrmsPoints, type LatLon } from './mrmsGrib.js'

/**
 * NOAA MRMS hourly rain, gauge-corrected: MultiSensor QPE 01H **Pass2**, 1 km,
 * CONUS, on AWS Open Data. Each file is the rain of the hour that ENDS at its
 * stamp, and lands about an hour after that. The drying clock reads it through
 * `radarChecked` (owner, 2026-11-02; measured by `compare:mrms`, #452).
 *
 * Pass2 over Pass1 (about 16 minutes) and radar-only (about 3 minutes): the
 * gauge correction is what makes light rain trustworthy, and rock takes hours
 * to dry, so an hour's wait costs little. "Raining now" is `mrmsRate.ts`.
 */
const BUCKET = 'https://noaa-mrms-pds.s3.amazonaws.com'
const PRODUCT = 'CONUS/MultiSensor_QPE_01H_Pass2_00.00'
const HOUR_MS = 3_600_000

/**
 * The MRMS CONUS grid's outer cell centres: 7000 x 3500 at 0.01°. Probed on a
 * Pass2 file, 2026-11-02: a point 0.01° inside each edge read a value and a
 * point 0.01° outside read none. A place outside it gets no radar and keeps
 * the models' median.
 */
export const MRMS_CONUS = { north: 54.995, south: 20.005, west: -129.995, east: -60.005 } as const

export function inMrmsGrid(p: LatLon): boolean {
  return p.lat <= MRMS_CONUS.north && p.lat >= MRMS_CONUS.south && p.lon >= MRMS_CONUS.west && p.lon <= MRMS_CONUS.east
}

/** `20261102-190000` for 2026-11-02T19:00Z. */
function stampOf(t: Date): string {
  const iso = t.toISOString()
  return `${iso.slice(0, 10).replaceAll('-', '')}-${iso.slice(11, 13)}0000`
}

export function qpeKeyFor(t: Date): string {
  const stamp = stampOf(t)
  return `${PRODUCT}/${stamp.slice(0, 8)}/MRMS_MultiSensor_QPE_01H_Pass2_00.00_${stamp}.grib2.gz`
}

const KEY_HOUR = /_(\d{4})(\d{2})(\d{2})-(\d{2})0000\.grib2\.gz$/

/** The hour a key's file ends at, in epoch ms, or null for anything else. */
export function qpeHourOfKey(key: string): number | null {
  const m = KEY_HOUR.exec(key)
  if (!m) return null
  const t = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:00:00Z`)
  return Number.isFinite(t) ? t : null
}

/**
 * The hours between `from` and `to` (inclusive, epoch ms on the hour) whose
 * file is published, or **null when any day's listing failed** — so a failed
 * listing is never read as "nothing published". Files are filed by UTC day;
 * a day holds 24, well under the listing's 1000.
 */
export async function publishedQpeHours(from: number, to: number): Promise<Set<number> | null> {
  const days = new Set<string>()
  for (let t = from; t <= to; t += HOUR_MS) days.add(stampOf(new Date(t)).slice(0, 8))
  days.add(stampOf(new Date(to)).slice(0, 8))
  try {
    const lists = await Promise.all(
      [...days].map(async (day) => {
        const res = await fetchWithRetry(`${BUCKET}/?list-type=2&prefix=${encodeURIComponent(`${PRODUCT}/${day}/`)}`, 3)
        if (!res.ok) {
          logger.warn({ statusCode: res.status }, '[mrmsQpe] listing non-ok')
          return null
        }
        return [...(await res.text()).matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) => qpeHourOfKey(m[1]!))
      }),
    )
    if (lists.some((l) => l === null)) return null
    return new Set(lists.flatMap((l) => l!).filter((t): t is number => t !== null && t >= from && t <= to))
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, '[mrmsQpe] listing failed after retries')
    return null
  }
}

/**
 * Millimetres at each point for the hour ending at `hourEnd`, or **null when
 * the file could not be fetched or read** — never a row of zeros. Within the
 * array, null is a point radar had no value for (MRMS writes a negative).
 */
export async function fetchQpeHour(hourEnd: Date, points: readonly LatLon[]): Promise<(number | null)[] | null> {
  try {
    const res = await fetchWithRetry(`${BUCKET}/${qpeKeyFor(hourEnd)}`, 3)
    if (!res.ok) {
      logger.warn({ statusCode: res.status }, '[mrmsQpe] file non-ok')
      return null
    }
    return readMrmsPoints(Buffer.from(await res.arrayBuffer()), points).map((v) =>
      v === null || v < 0 ? null : Math.round(v * 100) / 100,
    )
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, '[mrmsQpe] file unreadable')
    return null
  }
}
