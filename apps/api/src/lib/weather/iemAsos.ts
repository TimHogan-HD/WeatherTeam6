import { logger } from '../logger.js'
import { fetchWithRetry } from './openMeteo.js'

const IEM_URL = 'https://mesonet.agron.iastate.edu/json/current.py'
const STALENESS_LIMIT_MS = 90 * 60 * 1000 // 90 minutes

export type IemObservation = {
  temp_c: number | null
  dewpoint_c: number | null
  wind_kmh: number | null
  precip_1h_mm: number | null
  humidity_pct: number | null
  utc_valid: string
}

type IemRawObservation = {
  utc_valid?: string
  tmpf?: number | null
  dwpf?: number | null
  sknt?: number | null
  p01i?: number | null
  relh?: number | null
}

type IemResponse = {
  last_ob?: IemRawObservation
}

function fToC(f: number | null | undefined): number | null {
  if (f === null || f === undefined || !isFinite(f)) return null
  return ((f - 32) * 5) / 9
}

function ktsToKmh(kts: number | null | undefined): number | null {
  if (kts === null || kts === undefined || !isFinite(kts)) return null
  return kts * 1.852
}

function inToMm(inches: number | null | undefined): number | null {
  if (inches === null || inches === undefined || !isFinite(inches)) return null
  return inches * 25.4
}

/**
 * Fetch the most recent observation from IEM ASOS for a station.
 *
 * Returns null when:
 *   - The HTTP request fails
 *   - The response has no last_ob payload
 *   - The observation timestamp is older than 90 minutes (stale)
 *
 * IMPORTANT: `p01i` is a 1-hour precip reading, NOT a daily total. Use this
 * only as a same-day rain indicator (is it currently raining?). Daily precip
 * totals come exclusively from ACIS — see acis.ts.
 */
export async function fetchCurrentObs(
  stationId: string,
  network: string,
): Promise<IemObservation | null> {
  const url = new URL(IEM_URL)
  url.searchParams.set('station', stationId)
  url.searchParams.set('network', network)

  logger.debug({ stationId, network }, '[iemAsos] fetching current obs')

  let res: Response
  try {
    res = await fetchWithRetry(url.toString())
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn({ stationId, network, err: msg }, '[iemAsos] fetch failed after retries')
    return null
  }

  if (!res.ok) {
    logger.warn({ stationId, network, statusCode: res.status }, '[iemAsos] non-ok response')
    return null
  }

  const raw = (await res.json()) as IemResponse
  const ob = raw.last_ob
  if (!ob || !ob.utc_valid) {
    logger.debug({ stationId }, '[iemAsos] response missing last_ob')
    return null
  }

  const obTime = new Date(ob.utc_valid).getTime()
  if (!isFinite(obTime)) {
    logger.warn({ stationId, utc_valid: ob.utc_valid }, '[iemAsos] unparseable utc_valid')
    return null
  }

  const ageMs = Date.now() - obTime
  if (ageMs > STALENESS_LIMIT_MS) {
    logger.debug(
      { stationId, ageMinutes: Math.round(ageMs / 60_000) },
      '[iemAsos] observation is stale (>90 min)',
    )
    return null
  }

  return {
    temp_c: fToC(ob.tmpf),
    dewpoint_c: fToC(ob.dwpf),
    wind_kmh: ktsToKmh(ob.sknt),
    precip_1h_mm: inToMm(ob.p01i),
    humidity_pct: ob.relh ?? null,
    utc_valid: ob.utc_valid,
  }
}
