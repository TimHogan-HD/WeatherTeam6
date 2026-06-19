import { logger } from '../logger.js'

const ACIS_GRID_URL = 'https://data.rcc-acis.org/GridData'

// Grid 1 = NRCC Hi-Res 1km dataset; has full monthly coverage back to 1991
const GRID_ID = 1
const NORMALS_SDATE = '1991-01'
const NORMALS_EDATE = '2020-12'

// Sentinel value ACIS uses for missing data
const ACIS_MISSING = -999

export type GriddedNormalsResult = {
  month: number
  precip_normal_mm: number
  temp_max_normal_c: number
  temp_min_normal_c: number
  source: 'acis_grid_91_20'
}

type AcisGridRow = [string, number | string, number | string, number | string]

type AcisGridResponse = {
  data?: AcisGridRow[]
  error?: string
}

function inchesToMm(inches: number): number {
  return inches * 25.4
}

function fToC(f: number): number {
  return (f - 32) * (5 / 9)
}

function isValidValue(v: number | string): v is number {
  return typeof v === 'number' && isFinite(v) && v !== ACIS_MISSING
}

/**
 * Fetches 1991-2020 monthly climatological normals for a lat/lon point from
 * NOAA ACIS GridData (NRCC Hi-Res grid). Returns all 12 months at once.
 * Normals are computed by averaging 30 years of monthly data client-side.
 * Units: precip in mm, temps in °C.
 */
export async function fetchGriddedNormals(
  lat: number,
  lon: number,
): Promise<GriddedNormalsResult[]> {
  const body = {
    loc: `${lon},${lat}`,
    grid: GRID_ID,
    sdate: NORMALS_SDATE,
    edate: NORMALS_EDATE,
    elems: [
      { name: 'pcpn', interval: 'mly', duration: 'mly', reduce: 'mean' },
      { name: 'maxt', interval: 'mly', duration: 'mly', reduce: 'mean' },
      { name: 'mint', interval: 'mly', duration: 'mly', reduce: 'mean' },
    ],
  }

  logger.debug({ lat, lon }, '[acisNormals] fetching 30-year gridded normals')

  let lastErr: Error = new Error('no attempts made')
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(ACIS_GRID_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        const parsed = (await res.json()) as AcisGridResponse
        if (parsed.error) throw new Error(`ACIS GridData error: ${parsed.error}`)

        const rows = parsed.data ?? []
        if (rows.length === 0) throw new Error('ACIS GridData returned empty data array')

        return computeMonthlyNormals(rows)
      }

      if (res.status !== 429 && res.status < 500) {
        throw new Error(`ACIS GridData returned ${res.status}`)
      }
      lastErr = new Error(`HTTP ${res.status}`)
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err))
      if (lastErr.message.startsWith('ACIS GridData')) throw lastErr
    }
    if (attempt < 3) {
      await new Promise<void>((r) => setTimeout(r, Math.pow(2, attempt) * 1000))
    }
  }
  throw lastErr
}

function computeMonthlyNormals(rows: AcisGridRow[]): GriddedNormalsResult[] {
  // Accumulators: index 0-11 = month 1-12
  // Using Map instead of indexed array to avoid TypeScript strict no-unchecked-indexed-access errors
  const pcpn = new Map<number, number[]>()
  const maxt = new Map<number, number[]>()
  const mint = new Map<number, number[]>()
  for (let m = 1; m <= 12; m++) {
    pcpn.set(m, [])
    maxt.set(m, [])
    mint.set(m, [])
  }

  for (const row of rows) {
    const [date, p, mx, mn] = row
    const monthNum = parseInt(date.slice(5, 7), 10)
    if (!monthNum || monthNum < 1 || monthNum > 12) continue
    if (isValidValue(p)) pcpn.get(monthNum)!.push(p)
    if (isValidValue(mx)) maxt.get(monthNum)!.push(mx)
    if (isValidValue(mn)) mint.get(monthNum)!.push(mn)
  }

  const results: GriddedNormalsResult[] = []
  for (let month = 1; month <= 12; month++) {
    const p = pcpn.get(month)!
    const mx = maxt.get(month)!
    const mn = mint.get(month)!
    if (p.length === 0 || mx.length === 0 || mn.length === 0) {
      throw new Error(`ACIS GridData: no valid samples for month ${month}`)
    }
    const meanPcpn = p.reduce((a, b) => a + b, 0) / p.length
    const meanMaxt = mx.reduce((a, b) => a + b, 0) / mx.length
    const meanMint = mn.reduce((a, b) => a + b, 0) / mn.length

    results.push({
      month,
      precip_normal_mm: inchesToMm(meanPcpn),
      temp_max_normal_c: fToC(meanMaxt),
      temp_min_normal_c: fToC(meanMint),
      source: 'acis_grid_91_20',
    })
  }
  return results
}
