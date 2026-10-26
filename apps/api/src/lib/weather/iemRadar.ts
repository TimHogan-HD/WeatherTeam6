import { logger } from '../logger.js'
import { fetchWithRetry } from './openMeteo.js'
import type { RadarLatest } from '@weatherteam6/types'

/**
 * IEM's US composite reflectivity (N0Q), refreshed every 5 minutes. This file
 * names the newest frame; the tiles themselves load straight from IEM in the
 * browser, stamped with this time, so the label and the picture are one frame.
 */
const LATEST_URL = 'https://mesonet.agron.iastate.edu/data/gis/images/4326/USCOMP/n0q_0.json'

type LatestResponse = { meta?: { valid?: unknown } }

/**
 * The newest composite's valid time, or null when IEM did not answer or said
 * something unreadable. Null means "no radar", never "no rain".
 */
export async function fetchLatestRadar(): Promise<RadarLatest | null> {
  let res: Response
  try {
    res = await fetchWithRetry(LATEST_URL, 3)
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, '[iemRadar] fetch failed after retries')
    return null
  }
  if (!res.ok) {
    logger.warn({ statusCode: res.status }, '[iemRadar] non-ok response')
    return null
  }

  const valid = ((await res.json()) as LatestResponse).meta?.valid
  const time = typeof valid === 'string' ? Date.parse(valid) : NaN
  if (!Number.isFinite(time)) {
    logger.warn('[iemRadar] response has no readable valid time')
    return null
  }
  return { valid_at: new Date(time).toISOString() }
}
