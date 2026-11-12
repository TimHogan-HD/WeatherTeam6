import { logger } from '../logger.js'
import { fetchWithRetry } from './openMeteo.js'
import type { SoilPoint, WisconetStation } from '@weatherteam6/types'
import type { HourlyRain } from './uscrn.js'

/**
 * Wisconet, the University of Wisconsin's mesonet, keyless (#589 part 3): a
 * station's hourly soil at 5 and 20 cm and its hourly rain, in one request to
 * `/api/v1/stations/{id}/measures`.
 *
 * Each row is `{ collection_time, measures: [[fieldId, value], ...] }`, the
 * time in Unix seconds at the **end** of its hour. The field ids are not
 * fixed by the request, so they are read from the response's `fieldlist` by
 * standard name. A missing hour is an absent row; a missing value is an
 * absent pair, a null, or anything out of range, and every one becomes null,
 * never 0. Soil moisture comes as a fraction, soil temperature in °F and rain
 * in inches; they are converted here, so a `SoilPoint` reads the same from
 * either network.
 */

const BASE = 'https://api.wisconet.wisc.edu/api/v1/stations'

/** A request-time fetch: short, so a slow Wisconet holds up only this card. */
export const WISCONET_BUDGET_MS = 15_000

/** The standard names asked for, by what they become. */
export const WISCONET_FIELDS = {
  vwc_5: '60min_soil_moisture_pct_avg@2in',
  temp_5_f: '60min_soil_temp_f_avg@2in',
  vwc_20: '60min_soil_moisture_pct_avg@8in',
  temp_20_f: '60min_soil_temp_f_avg@8in',
  rain_in: '60min_rain_in_tot',
} as const

type Key = keyof typeof WISCONET_FIELDS

export function measuresUrl(station: Pick<WisconetStation, 'id'>, fromMs: number, toMs: number): string {
  const q = new URLSearchParams({
    fields: Object.values(WISCONET_FIELDS).join(','),
    start_time: String(Math.floor(fromMs / 1000)),
    end_time: String(Math.ceil(toMs / 1000)),
  })
  return `${BASE}/${encodeURIComponent(station.id)}/measures?${q.toString()}`
}

export type WisconetHour = {
  endMs: number
  vwc_5: number | null
  temp_5_c: number | null
  vwc_20: number | null
  temp_20_c: number | null
  rain_mm: number | null
}

const fToC = (f: number): number => Math.round(((f - 32) * 5) / 9 * 10) / 10

/** A finite number inside a range, else null. */
function within(v: unknown, lo: number, hi: number): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null
}

/**
 * A `/measures` body as hours, oldest first. Throws on a body that is not
 * the expected shape, so a changed API reads as a failed read rather than as
 * a station with no data. Pure, for the tests.
 */
export function parseMeasures(body: unknown): WisconetHour[] {
  if (typeof body !== 'object' || body === null) throw new Error('not an object')
  const { data, fieldlist } = body as { data?: unknown; fieldlist?: unknown }
  if (!Array.isArray(data) || !Array.isArray(fieldlist)) throw new Error('no data or fieldlist')
  const idOf = new Map<number, Key>()
  for (const f of fieldlist) {
    if (typeof f !== 'object' || f === null) continue
    const { id, standard_name } = f as { id?: unknown; standard_name?: unknown }
    const key = (Object.keys(WISCONET_FIELDS) as Key[]).find((k) => WISCONET_FIELDS[k] === standard_name)
    if (typeof id === 'number' && key !== undefined) idOf.set(id, key)
  }
  const byMs = new Map<number, WisconetHour>()
  for (const row of data) {
    if (typeof row !== 'object' || row === null) continue
    const { collection_time, measures } = row as { collection_time?: unknown; measures?: unknown }
    if (typeof collection_time !== 'number' || !Number.isFinite(collection_time) || !Array.isArray(measures)) continue
    const raw: Partial<Record<Key, unknown>> = {}
    for (const m of measures) {
      if (!Array.isArray(m)) continue
      const key = typeof m[0] === 'number' ? idOf.get(m[0]) : undefined
      if (key !== undefined) raw[key] = m[1]
    }
    const t5 = within(raw.temp_5_f, -60, 160)
    const t20 = within(raw.temp_20_f, -60, 160)
    const rain = within(raw.rain_in, 0, 20)
    const endMs = collection_time * 1000
    byMs.set(endMs, {
      endMs,
      vwc_5: within(raw.vwc_5, 0, 1),
      temp_5_c: t5 === null ? null : fToC(t5),
      vwc_20: within(raw.vwc_20, 0, 1),
      temp_20_c: t20 === null ? null : fToC(t20),
      rain_mm: rain === null ? null : Math.round(rain * 25.4 * 100) / 100,
    })
  }
  return [...byMs.values()].sort((a, b) => a.endMs - b.endMs)
}

/** The station's hours from `fromMs` to `toMs`. Throws when the read fails. */
export async function fetchWisconetHours(
  station: Pick<WisconetStation, 'id'>,
  fromMs: number,
  toMs: number,
  deadline: number,
): Promise<WisconetHour[]> {
  const res = await fetchWithRetry(measuresUrl(station, fromMs, toMs), 3, undefined, deadline)
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined)
    throw new Error(`HTTP ${res.status}`)
  }
  return parseMeasures(await res.json()).filter((h) => h.endMs > fromMs && h.endMs <= toMs)
}

/** A soil percentile's place among others: the share below, ties counted half. */
function rank(v: number, sorted: readonly number[]): number {
  let below = 0
  let equal = 0
  for (const x of sorted) {
    if (x < v) below++
    else if (x === v) equal++
  }
  return (below + equal / 2) / sorted.length
}

const thawed = (c: number | null): boolean => c !== null && c > 0

/**
 * Hours as `SoilPoint`s, each depth's percentile its rank among **all** the
 * thawed hours given at that depth: the span the card says it compares with.
 * A frozen or unread hour gets no percentile, and with no thawed hour at a
 * depth there is nothing to rank against. Pure, for the tests.
 */
export function rankedSoilPoints(hours: readonly WisconetHour[]): SoilPoint[] {
  const pool = (vwc: (h: WisconetHour) => number | null, temp: (h: WisconetHour) => number | null) =>
    hours.flatMap((h) => {
      const v = vwc(h)
      return v !== null && thawed(temp(h)) ? [v] : []
    })
  const pool5 = pool((h) => h.vwc_5, (h) => h.temp_5_c)
  const pool20 = pool((h) => h.vwc_20, (h) => h.temp_20_c)
  const pct = (v: number | null, c: number | null, p: readonly number[]) =>
    v === null || !thawed(c) || p.length === 0 ? null : Math.round(rank(v, p) * 1000) / 1000
  return hours.map((h) => ({
    at: new Date(h.endMs).toISOString(),
    vwc_5: h.vwc_5,
    pct_5: pct(h.vwc_5, h.temp_5_c, pool5),
    temp_5_c: h.temp_5_c,
    vwc_20: h.vwc_20,
    pct_20: pct(h.vwc_20, h.temp_20_c, pool20),
    temp_20_c: h.temp_20_c,
  }))
}

/** The 5 cm low and high over thawed hours; nulls with none. */
export function range5(hours: readonly WisconetHour[]): { lo_5: number | null; hi_5: number | null } {
  const v = hours.flatMap((h) => (h.vwc_5 !== null && thawed(h.temp_5_c) ? [h.vwc_5] : []))
  return v.length === 0 ? { lo_5: null, hi_5: null } : { lo_5: Math.min(...v), hi_5: Math.max(...v) }
}

/** Hours as the rain `noaaDays` sums: a missing hour stays missing. */
export function wisconetRain(hours: readonly WisconetHour[]): HourlyRain[] {
  return hours.map((h) => ({ endMs: h.endMs, mm: h.rain_mm }))
}

/** Logs a failed read without the error object (`describeError`'s rule): a message only. */
export function logWisconetFailure(id: string, err: unknown): void {
  logger.warn({ station: id, err: err instanceof Error ? err.message : String(err) }, '[wisconet] read failed')
}
