import { fetchWithRetry } from './openMeteo.js'
import { logger } from '../logger.js'

const STALE_LIMIT_MS = 90 * 60 * 1000
const KNOTS_TO_KMH = 1.852
const INCHES_TO_MM = 25.4

export type CurrentObservation = {
  utcValid: string
  tempC: number
  dewpointC: number
  windKmh: number
  precip1hMm: number
  pressureMb: number | null
  humidityPct: number
}

type AsosDatum = {
  utc_valid?: string
  tmpf?: number | null
  dwpf?: number | null
  sknt?: number | null
  p01i?: number | null
  mslp?: number | null
  relh?: number | null
}

type AsosResponse = {
  data?: AsosDatum[]
  // IEM also returns 'observations' in some endpoint variants
  observations?: AsosDatum[]
}

function fToC(f: number): number {
  return parseFloat(((f - 32) * (5 / 9)).toFixed(2))
}

export function parseObservation(
  datum: AsosDatum,
  asOf: Date,
): CurrentObservation | null {
  if (!datum.utc_valid) return null
  const obsTime = new Date(datum.utc_valid)
  if (isNaN(obsTime.getTime())) return null
  if (asOf.getTime() - obsTime.getTime() > STALE_LIMIT_MS) return null

  return {
    utcValid: datum.utc_valid,
    tempC: fToC(datum.tmpf ?? 68),
    dewpointC: fToC(datum.dwpf ?? 32),
    windKmh: parseFloat(((datum.sknt ?? 0) * KNOTS_TO_KMH).toFixed(2)),
    precip1hMm: parseFloat(((datum.p01i ?? 0) * INCHES_TO_MM).toFixed(2)),
    pressureMb: datum.mslp ?? null,
    humidityPct: datum.relh ?? 50,
  }
}

export async function fetchCurrentObs(
  station: string,
  network: string,
): Promise<CurrentObservation | null> {
  const url = `https://mesonet.agron.iastate.edu/json/current.py?station=${encodeURIComponent(station)}&network=${encodeURIComponent(network)}`

  logger.debug({ station, network }, '[iemAsos] fetching current observation')

  let res: Response
  try {
    res = await fetchWithRetry(url)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn({ station, err: msg }, '[iemAsos] fetch failed')
    return null
  }

  if (!res.ok) {
    logger.warn({ station, status: res.status }, '[iemAsos] error response')
    return null
  }

  const json = (await res.json()) as AsosResponse
  const dataArr = json.data ?? json.observations ?? []
  if (dataArr.length === 0) return null

  const obs = parseObservation(dataArr[0]!, new Date())
  if (!obs) {
    logger.warn({ station }, '[iemAsos] observation is stale or unparseable')
    return null
  }
  return obs
}
