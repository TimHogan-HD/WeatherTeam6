import { logger } from '../logger.js'
import { fetchWithRetry } from './openMeteo.js'

const NWS_BASE = 'https://api.weather.gov'

export type NwsAlert = {
  nws_alert_id: string
  event: string
  severity: string
  certainty: string
  headline: string | null
  description: string | null
  effective: string | null
  expires: string | null
}

type NwsFeatureProperties = {
  id?: string
  event?: string
  severity?: string
  certainty?: string
  headline?: string | null
  description?: string | null
  effective?: string | null
  expires?: string | null
}

type NwsFeatureCollection = {
  features?: Array<{
    id?: string
    properties?: NwsFeatureProperties
  }>
}

/**
 * Fetch active NWS alerts for a lat/lon point.
 *
 * Returns null when the request fails or the response cannot be parsed —
 * callers should treat null as "data unavailable" and skip pruning stale rows.
 * Returns [] when NWS confirms no active alerts for the point.
 */
export async function fetchNwsAlerts(lat: number, lon: number): Promise<NwsAlert[] | null> {
  const userAgent = process.env['NWS_USER_AGENT'] ?? 'weatherteam6/1.0 contact@example.com'
  const url = `${NWS_BASE}/alerts/active?point=${lat},${lon}`

  let res: Response
  try {
    res = await fetchWithRetry(url, 4, { 'User-Agent': userAgent })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.warn({ lat, lon, err: msg }, '[nwsAlerts] fetch failed')
    return null
  }

  if (!res.ok) {
    logger.warn({ lat, lon, status: res.status }, '[nwsAlerts] non-ok response')
    return null
  }

  let data: NwsFeatureCollection
  try {
    data = (await res.json()) as NwsFeatureCollection
  } catch {
    logger.warn({ lat, lon }, '[nwsAlerts] failed to parse JSON response')
    return null
  }

  if (!Array.isArray(data.features)) {
    return []
  }

  return data.features.flatMap((feature) => {
    const props = feature.properties
    if (!props) return []
    const nws_alert_id = feature.id ?? props.id
    if (!nws_alert_id) return []
    return [
      {
        nws_alert_id,
        event: props.event ?? 'Unknown',
        severity: props.severity ?? 'Unknown',
        certainty: props.certainty ?? 'Unknown',
        headline: props.headline ?? null,
        description: props.description ?? null,
        effective: props.effective ?? null,
        expires: props.expires ?? null,
      },
    ]
  })
}
