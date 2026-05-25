import { logger } from '../logger.js'

export type AcisRainfallEntry = {
  date: string // YYYY-MM-DD
  precip_mm: number
}

type AcisResponse = {
  data?: [string, string][]
}

const ACIS_URL = 'https://data.rcc-acis.org/StnData'
const INCHES_TO_MM = 25.4

export function parseAcisResponse(data: [string, string][]): AcisRainfallEntry[] {
  const results: AcisRainfallEntry[] = []
  for (const [date, raw] of data) {
    if (!date) continue
    if (raw === 'M') continue // missing — skip
    const inches = raw === 'T' ? 0 : parseFloat(raw)
    if (!isFinite(inches)) continue
    results.push({
      date,
      precip_mm: parseFloat((inches * INCHES_TO_MM).toFixed(2)),
    })
  }
  return results
}

export async function fetchAcisRainfall(
  station: string,
  sdate: string,
  edate: string,
): Promise<AcisRainfallEntry[]> {
  const body = JSON.stringify({
    sid: station,
    sdate,
    edate,
    elems: [{ name: 'pcpn' }],
  })

  logger.debug({ station, sdate, edate }, '[acis] fetching rainfall history')

  let lastErr: Error = new Error('no attempts made')
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(ACIS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      })
      if (res.ok) {
        const json = (await res.json()) as AcisResponse
        const raw = json.data ?? []
        return parseAcisResponse(raw)
      }
      if (res.status !== 429 && res.status < 500) {
        logger.warn({ station, status: res.status }, '[acis] non-retryable error')
        return []
      }
      lastErr = new Error(`HTTP ${res.status}`)
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
    }
    if (attempt < 3) {
      await new Promise<void>((r) => setTimeout(r, Math.pow(2, attempt) * 1000))
    }
  }
  throw lastErr
}
