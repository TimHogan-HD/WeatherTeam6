import { logger } from '../logger.js'
import { fetchWithRetry } from './openMeteo.js'

const ACIS_URL = 'https://data.rcc-acis.org/StnData'

export type AcisDailyPrecip = {
  date: string // YYYY-MM-DD
  precip_mm: number
}

type AcisResponse = {
  data?: [string, string | number][]
  error?: string
}

/**
 * Fetch daily precipitation totals from NOAA ACIS for a single station.
 * Skips missing ('M') and trace ('T') values entirely — caller gets only
 * dates with verified non-trace amounts.
 */
export async function fetchPrecipHistory(
  stationId: string,
  fromDate: string,
  toDate: string,
): Promise<AcisDailyPrecip[]> {
  const body = {
    sid: stationId,
    sdate: fromDate,
    edate: toDate,
    elems: [{ name: 'pcpn', units: 'mm' }],
  }

  logger.debug({ stationId, fromDate, toDate }, '[acis] fetching precip history')

  let lastErr: Error = new Error('no attempts made')
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(ACIS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const data = (await res.json()) as AcisResponse
        if (data.error) {
          throw new Error(`ACIS API error: ${data.error}`)
        }
        const rows = data.data ?? []
        const out: AcisDailyPrecip[] = []
        for (const row of rows) {
          const [date, value] = row
          if (typeof date !== 'string') continue
          // Skip missing ('M'), trace ('T'), and any other non-numeric string sentinels
          if (typeof value === 'string') {
            const trimmed = value.trim()
            if (trimmed === 'M' || trimmed === 'T' || trimmed === '') continue
            const n = parseFloat(trimmed)
            if (!isFinite(n)) continue
            out.push({ date, precip_mm: n })
          } else if (typeof value === 'number' && isFinite(value)) {
            out.push({ date, precip_mm: value })
          }
        }
        return out
      }

      if (res.status !== 429 && res.status < 500) {
        // Non-retryable client error — throw immediately
        const errBody = await res.text().catch(() => '')
        logger.debug({ statusCode: res.status, body: errBody.slice(0, 200) }, '[acis] error response')
        throw new Error(`ACIS API returned ${res.status}`)
      }
      lastErr = new Error(`HTTP ${res.status}`)
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      // If this was a parse/logic error (not a transport error), don't retry
      if (lastErr.message.startsWith('ACIS API')) throw lastErr
    }
    if (attempt < 3) {
      const delay = Math.pow(2, attempt) * 1000
      await new Promise<void>((r) => setTimeout(r, delay))
    }
  }
  throw lastErr
}

// Re-export fetchWithRetry to keep one transport-retry helper in the module graph.
export { fetchWithRetry }
