import { cToF, kmhToMph, mmToIn } from '@weatherteam6/types'
import type { RunHour } from '../runs/latestRuns.js'
import { localDateString } from '../weather/openMeteo.js'

/**
 * The monospace forecast table: column sets, steps, day slicing and the cell
 * formatting.
 *
 * **Pure** — no database, no env, no Telegram — so every column, every unit and
 * every gap is testable directly. `panels.ts` wraps what this returns in
 * `<pre>`; the escaping happens there, once, over the whole block.
 *
 * Two rules the whole file exists to keep:
 *
 * - **A missing value is a gap, never a number.** `cToF(null)` is 32°F and
 *   `kmhToMph(null)` is 0 mph, and both read as measurements. Every cell here
 *   goes through a formatter that takes `number | null`.
 * - **A cell is never wider than its header.** The columns are aligned by
 *   padding, and one over-long value shifts every column to its right for that
 *   row only, which is worse than a truncated number.
 */

/** The em dash `packages/types` uses for a missing value, at table width. */
const GAP = '—'

export const TABLE_UNITS = ['imperial', 'metric'] as const
export type TableUnits = (typeof TABLE_UNITS)[number]

export function isTableUnits(value: string): value is TableUnits {
  return (TABLE_UNITS as readonly string[]).includes(value)
}

/**
 * The steps a table can be drawn at. 1 h is 24 rows, which fits a phone screen
 * inside `<pre>`; 12 h is the trip-planning glance.
 */
export const INTERVAL_HOURS = [1, 3, 6, 12] as const
export type IntervalHours = (typeof INTERVAL_HOURS)[number]

export function isIntervalHours(value: number): value is IntervalHours {
  return (INTERVAL_HOURS as readonly number[]).includes(value)
}

/**
 * Short display names for the models.
 *
 * The keys are the `/v1/forecast` spellings from `DETERMINISTIC_MODELS`, which
 * are **not** the ensemble spellings — `icon_seamless` here, `icon_seamless_eps`
 * there. A model with no entry falls back to its raw key rather than being
 * dropped: an unlabelled model is still an honest label, an absent one is not.
 */
const MODEL_LABELS: Record<string, string> = {
  gfs_seamless: 'GFS',
  ecmwf_ifs025: 'ECMWF',
  icon_seamless: 'ICON',
  gem_seamless: 'GEM',
  ncep_hrrr_conus: 'HRRR',
  ncep_nbm_conus: 'NBM',
}

export function modelLabel(model: string): string {
  return MODEL_LABELS[model] ?? model
}

// ---------------------------------------------------------------------------
// Cell formatters. Each takes `number | null` and each pads to a fixed width.
// ---------------------------------------------------------------------------

function cell(text: string, width: number): string {
  return text.padStart(width)
}

function round(value: number): string {
  return String(Math.round(value))
}

function tempCell(c: number | null, units: TableUnits, width: number): string {
  if (c === null) return cell(GAP, width)
  return cell(round(units === 'imperial' ? cToF(c) : c), width)
}

function windCell(kmh: number | null, units: TableUnits, width: number): string {
  if (kmh === null) return cell(GAP, width)
  return cell(round(units === 'imperial' ? kmhToMph(kmh) : kmh), width)
}

/**
 * Two decimals in inches, one in millimetres, and **`t` for a trace** — a
 * measurable amount that rounds to zero must not print as `0`, which is the
 * value that means "no rain at all".
 */
export function precipCell(mm: number | null, units: TableUnits, width: number): string {
  if (mm === null) return cell(GAP, width)
  if (mm === 0) return cell('0', width)
  if (units === 'imperial') {
    const inches = mmToIn(mm)
    return cell(inches < 0.01 ? 't' : inches.toFixed(2), width)
  }
  return cell(mm < 0.1 ? 't' : mm.toFixed(1), width)
}

function pctCell(pct: number | null, width: number): string {
  if (pct === null) return cell(GAP, width)
  return cell(round(pct), width)
}

/** 16-point compass. `null` is a gap; 0° is due north and a real reading. */
const COMPASS = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
] as const

export function compassPoint(deg: number | null): string | null {
  if (deg === null || !Number.isFinite(deg)) return null
  const index = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16
  return COMPASS[index] ?? null
}

// ---------------------------------------------------------------------------
// Local-time bucketing
// ---------------------------------------------------------------------------

const HOUR_MS = 3_600_000

/** Milliseconds in an hour, exported so the rain view steps by the same unit. */
export const HOUR_IN_MS = HOUR_MS

/**
 * The instant at a given local wall-clock hour of a local calendar day.
 *
 * Computed arithmetically rather than looked up, so a row can be emitted for an
 * hour the series does not contain — a table that quietly ends at a model's
 * horizon looks like a day that ends there.
 */
export function localHourInstant(
  localDate: string,
  hour: number,
  utcOffsetSeconds: number,
): number | null {
  const asUtc = Date.parse(`${localDate}T${String(hour).padStart(2, '0')}:00:00Z`)
  if (!Number.isFinite(asUtc)) return null
  return asUtc - utcOffsetSeconds * 1000
}

/**
 * The local calendar days a series covers, in order.
 *
 * Derived from the hours themselves rather than from the server's clock: the
 * days a table can page through are exactly the days there is data for, and a
 * model whose horizon ends on Wednesday must not offer a Thursday button.
 */
export function localDays(
  hours: readonly { valid_at: Date }[],
  utcOffsetSeconds: number,
): string[] {
  const seen = new Set<string>()
  for (const h of hours) seen.add(localDateString(h.valid_at, utcOffsetSeconds))
  return [...seen].sort()
}

export type ForecastRow = {
  /** Local wall-clock hour the row starts at. */
  readonly hour: number
  /** The instantaneous reading at that hour, or `null` when the series has no such hour. */
  readonly at: RunHour | null
  /**
   * Precipitation **during** the step — the total of the hours after this row's
   * hour, up to and including the next row's.
   *
   * Open-Meteo's hourly precipitation is the preceding hour's sum, so the value
   * stamped 13:00 fell between 12:00 and 13:00. A row labelled 12 with a 3 h step
   * therefore adds the hours stamped 13, 14 and 15, and means "rain between
   * 12:00 and 15:00". `null` when not one of those hours is present — a sum over
   * nothing is not zero rain.
   */
  readonly precip_mm: number | null
}

/**
 * One local day, sliced into rows at `interval` hours.
 *
 * Rows are emitted for every step of the day whether or not the series reaches
 * them, so a model that stops at 06:00 shows the rest of its day as gaps rather
 * than a table that quietly ends early.
 */
export function buildRows(
  hours: readonly RunHour[],
  utcOffsetSeconds: number,
  localDate: string,
  interval: IntervalHours,
): ForecastRow[] {
  const byInstant = new Map<number, RunHour>()
  for (const h of hours) byInstant.set(h.valid_at.getTime(), h)

  const rows: ForecastRow[] = []
  for (let hour = 0; hour < 24; hour += interval) {
    const start = localHourInstant(localDate, hour, utcOffsetSeconds)
    if (start === null) continue

    let precip: number | null = null
    for (let step = 1; step <= interval; step++) {
      const value = byInstant.get(start + step * HOUR_MS)?.precip_mm
      if (value === null || value === undefined) continue
      precip = (precip ?? 0) + value
    }

    rows.push({ hour, at: byInstant.get(start) ?? null, precip_mm: precip })
  }
  return rows
}

/**
 * Whether the model actually said anything about this day.
 *
 * **Measured, not assumed:** Open-Meteo pads every model's arrays to the longest
 * horizon in the request, so `ncep_hrrr_conus` comes back with 168 hours of
 * which 66 carry temperature. Those trailing hours are present as rows with
 * every value null — checking that the hour *exists* would call a table of 24
 * em dashes a forecast.
 *
 * **`precip_prob_pct` does not count.** Probe A measured it running 276 h
 * against HRRR's 54 h model and byte-identical to another model's series: it is
 * a blended field that belongs to no model, so a model whose only non-null value
 * for a day is that one has not reached the day.
 */
export function dayHasData(rows: readonly ForecastRow[]): boolean {
  return rows.some(
    (r) =>
      r.precip_mm !== null ||
      r.at?.temp_c != null ||
      r.at?.dewpoint_c != null ||
      r.at?.humidity_pct != null ||
      r.at?.precip_mm != null ||
      r.at?.wind_kmh != null ||
      r.at?.wind_gust_kmh != null ||
      r.at?.wind_dir_deg != null ||
      r.at?.cloud_pct != null ||
      r.at?.pressure_hpa != null,
  )
}

// ---------------------------------------------------------------------------
// Column sets
// ---------------------------------------------------------------------------

type Column = {
  readonly header: (units: TableUnits) => string
  readonly width: number
  readonly render: (row: ForecastRow, units: TableUnits) => string
}

const COLUMNS = {
  temp: {
    header: (u) => (u === 'imperial' ? '°F' : '°C'),
    width: 4,
    render: (r, u) => tempCell(r.at?.temp_c ?? null, u, 4),
  },
  dew: {
    header: () => 'dew',
    width: 4,
    render: (r, u) => tempCell(r.at?.dewpoint_c ?? null, u, 4),
  },
  rh: {
    header: () => 'RH',
    width: 4,
    render: (r) => pctCell(r.at?.humidity_pct ?? null, 4),
  },
  wind: {
    header: (u) => (u === 'imperial' ? 'mph' : 'kmh'),
    width: 4,
    render: (r, u) => windCell(r.at?.wind_kmh ?? null, u, 4),
  },
  gust: {
    header: () => 'gst',
    width: 4,
    render: (r, u) => windCell(r.at?.wind_gust_kmh ?? null, u, 4),
  },
  dir: {
    header: () => 'dir',
    width: 4,
    render: (r) => cell(compassPoint(r.at?.wind_dir_deg ?? null) ?? GAP, 4),
  },
  cloud: {
    header: () => 'cld',
    width: 4,
    render: (r) => pctCell(r.at?.cloud_pct ?? null, 4),
  },
  precip: {
    header: (u) => (u === 'imperial' ? 'in' : 'mm'),
    width: 5,
    render: (r, u) => precipCell(r.precip_mm, u, 5),
  },
  /**
   * The blended probability from `weather_run_hours.precip_prob_pct`. The header
   * is deliberately not the model's name and the caller adds the footnote — see
   * `probabilityNote`.
   */
  pop: {
    header: () => 'pop',
    width: 4,
    render: (r) => pctCell(r.at?.precip_prob_pct ?? null, 4),
  },
  pressure: {
    header: () => 'mb',
    width: 6,
    // NBM answers 384 nulls for this at every point measured, so the gap is the
    // common case rather than the edge one.
    render: (r) => {
      const hpa = r.at?.pressure_hpa ?? null
      return hpa === null ? cell(GAP, 6) : cell(round(hpa), 6)
    },
  },
} satisfies Record<string, Column>

type ColumnKey = keyof typeof COLUMNS

/**
 * The four column sets a panel can switch between.
 *
 * Probe B measured nine columns fitting a phone with no wrap, so these are not
 * cut to fit a width that was never the constraint — they are cut so each set
 * answers one question.
 */
export const COLUMN_SETS = {
  all: { label: 'Overview', columns: ['temp', 'dew', 'wind', 'cloud', 'precip'] },
  temp: { label: 'Air', columns: ['temp', 'dew', 'rh', 'pressure'] },
  wind: { label: 'Wind', columns: ['wind', 'gust', 'dir', 'temp'] },
  rain: { label: 'Rain', columns: ['precip', 'pop', 'cloud', 'rh'] },
} satisfies Record<string, { label: string; columns: readonly ColumnKey[] }>

export type ColumnSet = keyof typeof COLUMN_SETS

export const COLUMN_SET_KEYS = Object.keys(COLUMN_SETS) as ColumnSet[]

export function isColumnSet(value: string): value is ColumnSet {
  return Object.prototype.hasOwnProperty.call(COLUMN_SETS, value)
}

/**
 * The caveat a `pop` column carries, or `null` when there is none to make.
 *
 * Probe A measured `precipitation_probability` running 276 h against HRRR's 54 h
 * horizon and byte-identical to NBM's series: it is a blended field that belongs
 * to no single model, and `markSharedProbability` derives per response which
 * models share one. So the column may only be read as this model's own when the
 * flag is explicitly `false`.
 *
 * **`null` is unknown, not "no".** A run stored before the flag existed gets the
 * caveat, because withholding an attribution costs a sentence and asserting a
 * wrong one is the defect.
 */
export function probabilityNote(
  columnSet: ColumnSet,
  probabilityIsShared: boolean | null,
): string | null {
  const columns: readonly string[] = COLUMN_SETS[columnSet].columns
  if (!columns.includes('pop')) return null
  if (probabilityIsShared === false) return null
  return 'pop is a blended probability, not this model’s own field.'
}

export type TableInput = {
  readonly rows: readonly ForecastRow[]
  readonly columnSet: ColumnSet
  readonly units: TableUnits
}

/**
 * The table body, unescaped and without the `<pre>` wrapper.
 *
 * Returns `null` for a day with no rows at all rather than a header with nothing
 * under it — an empty table reads as "no wind, no rain, no cloud" for the day.
 */
export function renderTable(input: TableInput): string | null {
  if (input.rows.length === 0) return null

  const columns = COLUMN_SETS[input.columnSet].columns.map((key) => COLUMNS[key])
  const header = ['hh', ...columns.map((c) => cell(c.header(input.units), c.width))].join(' ')
  const body = input.rows.map((row) =>
    [
      String(row.hour).padStart(2, '0'),
      ...columns.map((c) => c.render(row, input.units)),
    ].join(' '),
  )

  return [header, ...body].join('\n')
}

/**
 * "rain is the total for the 3 h after each row" — stated because the reading is
 * not obvious and the alternative convention (the hour *before* each row, which
 * is how Open-Meteo stamps it) is equally plausible to a reader.
 */
export function stepNote(interval: IntervalHours): string {
  return interval === 1
    ? 'Values are at the hour; rain is the total for the hour after it.'
    : `Values are at the hour; rain is the total for the ${interval} h after it.`
}
