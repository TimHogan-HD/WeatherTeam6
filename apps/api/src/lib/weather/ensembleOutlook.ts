import type { OutlookDay } from '@weatherteam6/types'
import { logger } from '../logger.js'
import {
  ENSEMBLE_MODELS,
  ENSEMBLE_MODEL_SUFFIXES,
  ENSEMBLE_URL,
  MEASURABLE_PRECIP_MM,
  ensembleMedian,
  fetchWithRetry,
  lapseShiftC,
  localDateString,
  memberArraysFor,
  type ForecastLocation,
} from './openMeteo.js'

/** How far the outlook reaches, in local days counting today. */
export const OUTLOOK_DAYS = 16

export type Outlook = {
  utc_offset_seconds: number
  days: OutlookDay[]
  /** Every local date the response carried, reached or not. `member_precip` rows align to it. */
  dates: string[]
  /**
   * Each member's daily precipitation total, one row per member. Kept per member
   * because a trip total is a sum of each member's own days, which daily
   * percentiles cannot give.
   */
  member_precip: (number | null)[][]
}

export type ParsedOutlook = Omit<Outlook, 'utc_offset_seconds'>

type OutlookResponse = {
  elevation?: number
  utc_offset_seconds?: number
  daily?: Record<string, unknown>
}

function definedAt(arrays: (number | null)[][], i: number): number[] {
  const out: number[] = []
  for (const vals of arrays) {
    const v = vals[i]
    if (v !== null && v !== undefined) out.push(v)
  }
  return out
}

/**
 * Reduce Open-Meteo's per-member **daily** keys to one `OutlookDay` per local day.
 *
 * Each variable is read over the members that reported it on that day, because the
 * four models reach different horizons (ICON about 7.5 days, ECMWF 15). A day no
 * member reached is left out rather than written as zeros.
 *
 * `shiftC` moves the temperatures to the crag's elevation (`lapseShiftC`).
 */
export function parseOutlook(
  daily: Record<string, unknown>,
  today: string,
  shiftC = 0,
): ParsedOutlook {
  const times: unknown[] = Array.isArray(daily['time']) ? daily['time'] : []
  const keys = Object.keys(daily)
  const models = Object.entries(ENSEMBLE_MODEL_SUFFIXES).map(([model, suffix]) => ({
    model,
    precip: memberArraysFor(daily, keys, 'precipitation_sum', suffix),
    highs: memberArraysFor(daily, keys, 'temperature_2m_max', suffix),
    lows: memberArraysFor(daily, keys, 'temperature_2m_min', suffix),
  }))

  const days: OutlookDay[] = []
  for (let i = 0; i < times.length; i++) {
    const local_date: unknown = times[i]
    if (typeof local_date !== 'string' || local_date === '') continue

    const precip: number[] = []
    const highs: number[] = []
    const lows: number[] = []
    const present: string[] = []
    for (const m of models) {
      const p = definedAt(m.precip, i)
      if (p.length > 0) present.push(m.model)
      precip.push(...p)
      highs.push(...definedAt(m.highs, i))
      lows.push(...definedAt(m.lows, i))
    }
    if (precip.length === 0 && highs.length === 0 && lows.length === 0) continue

    days.push({
      local_date,
      is_today: local_date === today,
      temp_c_max: highs.length === 0 ? null : ensembleMedian(highs, 0) + shiftC,
      temp_c_min: lows.length === 0 ? null : ensembleMedian(lows, 0) + shiftC,
      precip_mm_mean: precip.length === 0 ? null : precip.reduce((a, b) => a + b, 0) / precip.length,
      members_wet: precip.length === 0 ? null : precip.filter((v) => v >= MEASURABLE_PRECIP_MM).length,
      member_count: precip.length,
      models: present,
    })
  }
  return {
    days,
    dates: times.map((t) => (typeof t === 'string' ? t : '')),
    member_precip: models.flatMap((m) => m.precip),
  }
}

/**
 * The 16-day daily outlook for a point, pooled across the four ensemble models.
 *
 * Fetched live, never stored: a daily-only response is small, and nothing reads it
 * more than once per request.
 *
 * @throws {Error} on HTTP failure or a response with no daily block.
 */
export async function fetchOutlook(location: ForecastLocation, now: Date): Promise<Outlook> {
  const url = new URL(ENSEMBLE_URL)
  url.searchParams.set('latitude', String(location.lat))
  url.searchParams.set('longitude', String(location.lon))
  url.searchParams.set('models', ENSEMBLE_MODELS)
  url.searchParams.set('daily', 'temperature_2m_max,temperature_2m_min,precipitation_sum')
  url.searchParams.set('forecast_days', String(OUTLOOK_DAYS))
  url.searchParams.set('timezone', 'auto')

  const res = await fetchWithRetry(url.toString())
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    logger.debug(
      { statusCode: res.status, body: body.slice(0, 200) },
      '[ensembleOutlook] error response',
    )
    throw new Error(`Open-Meteo ensemble outlook returned ${res.status}`)
  }

  const raw = (await res.json()) as OutlookResponse
  if (!raw.daily || typeof raw.daily !== 'object') {
    throw new Error('Open-Meteo ensemble outlook carried no daily block')
  }
  // Unlike `fetchEnsembleRun`, a missing offset is an error: "today" decides which
  // days are recorded and shown, and a guessed UTC day would be acted on.
  const offset = raw.utc_offset_seconds
  if (typeof offset !== 'number' || !Number.isFinite(offset)) {
    throw new Error('Open-Meteo ensemble outlook carried no utc_offset_seconds')
  }

  const today = localDateString(now, offset)
  return {
    utc_offset_seconds: offset,
    ...parseOutlook(raw.daily, today, lapseShiftC(location.elevation_m, raw.elevation)),
  }
}
