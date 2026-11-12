import { logger } from '../logger.js'
import { fetchWithRetry } from './openMeteo.js'
import { localDateAt } from '../trips/tripSummary.js'
import type { NoaaGaugeDay, SoilPoint, SoilRainDay, UscrnStation } from '@weatherteam6/types'

/**
 * NOAA's U.S. Climate Reference Network (USCRN) from NCEI, keyless (#589 part
 * 2): a station's hourly rain (`hourly02`) and its soil moisture with the
 * percentile for the date (`soilanom01`).
 *
 * **Both files are read from the end with a Range request**: a year of hourly
 * rows is ~2 MB and the soil file, every hour since the station opened, ~20
 * MB. A server that ignores the range and answers 200 is refused, so a request
 * never pulls the whole file into a 60 s function. The first line of a tail is
 * cut mid-row and dropped.
 *
 * Every row's time is UTC and marks the **end** of its hour. A missing value
 * is `-9999` or `-99` in `hourly02` and an empty field in `soilanom01`; both
 * become null, never 0.
 */

const BASE = 'https://www.ncei.noaa.gov/pub/data/uscrn/products'
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

/** A request-time fetch: short, so a slow NCEI holds up only this card. */
export const USCRN_BUDGET_MS = 15_000

/** Bytes per row, generously: `hourly02` rows are ~240, `soilanom01` ~140. */
const HOURLY_ROW_BYTES = 260
const SOIL_ROW_BYTES = 160
/** Rows the files may lag behind now, or carry past what is asked: about a day. */
const SLACK_ROWS = 24

export function hourlyUrl(station: Pick<UscrnStation, 'file'>, year: number): string {
  return `${BASE}/hourly02/${year}/CRNH0203-${year}-${station.file}.txt`
}

export function soilUrl(station: Pick<UscrnStation, 'file'>): string {
  return `${BASE}/soil/soilanom01/CRNSSM0101-${station.file}.csv`
}

/** The last `bytes` of a file as text, whole lines only. Throws on anything but a 206. */
async function fetchTail(url: string, bytes: number, deadline: number): Promise<string[]> {
  const res = await fetchWithRetry(url, 3, { Range: `bytes=-${bytes}` }, deadline)
  if (res.status !== 206) {
    // A 200 here is the whole file; never read it.
    await res.body?.cancel().catch(() => undefined)
    throw new Error(`HTTP ${res.status}, not a partial response`)
  }
  const lines = (await res.text()).split('\n')
  // A tail starts mid-row unless it is the whole file, which a 206 for a short file can be.
  const whole = /^bytes 0-/.test(res.headers.get('content-range') ?? '')
  return (whole ? lines : lines.slice(1)).map((l) => l.trimEnd()).filter((l) => l !== '')
}

/** `YYYYMMDD` and `HHMM` (or `HH`) in UTC as epoch ms; NaN for anything else. */
function utcMs(date: string, time: string): number {
  if (!/^\d{8}$/.test(date) || !/^\d{2}(\d{2})?$/.test(time)) return NaN
  return Date.UTC(+date.slice(0, 4), +date.slice(4, 6) - 1, +date.slice(6, 8), +time.slice(0, 2), time.length === 4 ? +time.slice(2, 4) : 0)
}

/** A sensor value, or null for a sentinel, a blank or anything not a finite number. */
function value(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return null
  const n = Number(raw)
  return Number.isFinite(n) && n > -99 ? n : null
}

export type HourlyRain = { endMs: number; mm: number | null }

/**
 * `hourly02` rows as each hour's rain (`P_CALC`, field 13), oldest first. A
 * row that is not one station's hour is dropped. Pure, for the tests.
 */
export function parseHourlyRain(lines: readonly string[], wban: string): HourlyRain[] {
  const out: HourlyRain[] = []
  for (const line of lines) {
    const f = line.trim().split(/\s+/)
    if (f.length < 13 || f[0] !== wban) continue
    const endMs = utcMs(f[1] ?? '', f[2] ?? '')
    if (!Number.isFinite(endMs)) continue
    out.push({ endMs, mm: value(f[12]) })
  }
  return out.sort((a, b) => a.endMs - b.endMs)
}

/** `soilanom01` rows as `SoilPoint`s, oldest first. Pure, for the tests. */
export function parseSoilRows(lines: readonly string[], wban: string): SoilPoint[] {
  const out: { ms: number; p: SoilPoint }[] = []
  for (const line of lines) {
    const f = line.split(',')
    if (f.length < 16 || f[0] !== wban) continue
    const dt = f[1] ?? ''
    const ms = utcMs(dt.slice(0, 8), dt.slice(8))
    if (dt.length !== 10 || !Number.isFinite(ms)) continue
    const pct = (raw: string | undefined) => {
      const v = value(raw)
      return v === null || v < 0 || v > 1 ? null : v
    }
    const vwc = (raw: string | undefined) => {
      const v = value(raw)
      return v === null || v < 0 || v > 1 ? null : v
    }
    out.push({
      ms,
      p: {
        at: new Date(ms).toISOString(),
        vwc_5: vwc(f[4]),
        pct_5: pct(f[6]),
        temp_5_c: value(f[7]),
        vwc_20: vwc(f[12]),
        pct_20: pct(f[14]),
        temp_20_c: value(f[15]),
      },
    })
  }
  return out.sort((a, b) => a.ms - b.ms).map((o) => o.p)
}

/**
 * The station's rain on each local date in `dates`. An hour belongs to the
 * local date its start falls on (a row is stamped at the hour's end). A date
 * is whole only when every one of its hours reported; otherwise `rain_mm` is
 * null and the counts say how short it fell. Pure, for the tests.
 */
export function noaaDays(
  hours: readonly HourlyRain[],
  dates: readonly string[],
  tz: string,
  lon: number,
): Map<string, NoaaGaugeDay> {
  const want = new Set(dates)
  const days = new Map<string, { mm: number; reported: number; expected: number }>()
  for (const d of dates) days.set(d, { mm: 0, reported: 0, expected: 0 })
  if (dates.length === 0) return new Map()

  // Every hour start that could fall on one of the dates, on the station's clock.
  const first = Date.parse(`${[...dates].sort()[0] ?? ''}T00:00:00Z`)
  const last = Date.parse(`${[...dates].sort().at(-1) ?? ''}T00:00:00Z`)
  const byStart = new Map(hours.map((h) => [h.endMs - HOUR_MS, h.mm]))
  for (let start = first - 15 * HOUR_MS; start <= last + DAY_MS + 15 * HOUR_MS; start += HOUR_MS) {
    const local = localDateAt(new Date(start), tz, lon)
    const day = want.has(local) ? days.get(local) : undefined
    if (day === undefined) continue
    day.expected += 1
    const mm = byStart.get(start)
    if (mm === undefined || mm === null) continue
    day.reported += 1
    day.mm += mm
  }
  return new Map(
    [...days].map(([d, s]) => [
      d,
      {
        rain_mm: s.expected > 0 && s.reported === s.expected ? Math.round(s.mm * 10) / 10 : null,
        hours_reported: s.reported,
        hours_expected: s.expected,
      },
    ]),
  )
}

/**
 * The station's hourly rain from `fromMs` to now. Reads the end of this
 * year's file, and of last year's too when the span reaches back over New
 * Year. Throws when a read fails, so the caller can say the gauge did not
 * answer rather than show a dry week.
 */
export async function fetchHourlyRain(
  station: Pick<UscrnStation, 'file' | 'wban'>,
  fromMs: number,
  nowMs: number,
  deadline: number,
): Promise<HourlyRain[]> {
  const year = new Date(nowMs).getUTCFullYear()
  const rows = Math.ceil((nowMs - fromMs) / HOUR_MS) + SLACK_ROWS
  const bytes = rows * HOURLY_ROW_BYTES
  const years = fromMs < Date.UTC(year, 0, 1) ? [year - 1, year] : [year]
  const reads = await Promise.all(years.map((y) => fetchTail(hourlyUrl(station, y), bytes, deadline)))
  return parseHourlyRain(reads.flat(), station.wban).filter((h) => h.endMs > fromMs)
}

/** The station's soil from `fromMs` to now. Throws when the read fails. */
export async function fetchSoilPoints(
  station: Pick<UscrnStation, 'file' | 'wban'>,
  fromMs: number,
  nowMs: number,
  deadline: number,
): Promise<SoilPoint[]> {
  const rows = Math.ceil((nowMs - fromMs) / HOUR_MS) + SLACK_ROWS
  const lines = await fetchTail(soilUrl(station), rows * SOIL_ROW_BYTES, deadline)
  return parseSoilRows(lines, station.wban).filter((p) => Date.parse(p.at) > fromMs)
}

/** The local dates from `fromMs` to now on the station's clock, oldest first. */
export function localDatesBetween(fromMs: number, nowMs: number, tz: string, lon: number): string[] {
  const out: string[] = []
  for (let ms = fromMs; ms <= nowMs; ms += HOUR_MS) {
    const d = localDateAt(new Date(ms), tz, lon)
    if (out.at(-1) !== d) out.push(d)
  }
  return out
}

/** The soil card's rain bars: each local day's total, or null for a day not every hour of which reported. */
export function soilRainDays(hours: readonly HourlyRain[], dates: readonly string[], tz: string, lon: number): SoilRainDay[] {
  const days = noaaDays(hours, dates, tz, lon)
  return dates.map((local_date) => ({ local_date, rain_mm: days.get(local_date)?.rain_mm ?? null }))
}

/** Logs a failed read without the error object (`describeError`'s rule): a message only. */
export function logUscrnFailure(what: string, wban: string, err: unknown): void {
  logger.warn({ wban, err: err instanceof Error ? err.message : String(err) }, `[uscrn] ${what} read failed`)
}
