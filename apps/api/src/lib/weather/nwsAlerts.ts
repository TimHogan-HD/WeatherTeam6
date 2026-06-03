import { logger } from '../logger.js'

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

async function fetchWithHeadersRetry(
  url: string,
  headers: Record<string, string>,
  maxAttempts = 4,
): Promise<Response> {
  let lastErr: Error = new Error('no attempts made')
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, { headers })
      if (res.ok) return res
      if (res.status !== 429 && res.status < 500) return res
      lastErr = new Error(`HTTP ${res.status}`)
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
    }
    if (attempt < maxAttempts - 1) {
      const delay = Math.pow(2, attempt) * 1000
      await new Promise<void>((r) => setTimeout(r, delay))
    }
  }
  throw lastErr
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
    res = await fetchWithHeadersRetry(url, { 'User-Agent': userAgent })
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
