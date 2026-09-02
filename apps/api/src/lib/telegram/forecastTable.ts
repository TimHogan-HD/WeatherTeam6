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

/**
 * A local wall-clock hour as a person says it: `3pm`, `midnight`, `noon`.
 *
 * Returns `null` for anything that is not an hour of the day, so a caller omits
 * the phrase rather than printing `NaNpm`.
 *
 * Lives here rather than in `panels.ts` because both tables and the rain copy
 * need it, and `panels.ts` already imports this file — the other direction
 * would be a cycle.
 */
export function clockLabel(hour: number): string | null {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null
  if (hour === 0) return 'midnight'
  if (hour === 12) return 'noon'
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`
}

/**
 * The same hour at table width: `12am`, ` 3pm`, `12pm`.
 *
 * **Not `clockLabel`.** A column has to align, and "midnight"/"noon" are eight
 * and four characters against a four-character column — they belong in a
 * sentence, not a cell. `hh` as a bare `00`/`03` was the thing being replaced:
 * a 24-hour number is a timestamp, and the reader wanted a time of day.
 */
export const TIME_COL_WIDTH = 5

export function clockCell(hour: number): string {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return cell('—', TIME_COL_WIDTH)
  const suffix = hour < 12 ? 'am' : 'pm'
  const h12 = hour % 12 === 0 ? 12 : hour % 12
  return cell(`${h12}${suffix}`, TIME_COL_WIDTH)
}

/**
 * The window a step covers, at table width: `12a-3a`, `9a-12p`.
 *
 * **The label is the explanation.** A column headed `time` showing `12am` meant
 * "the three hours after this", which needed a sentence underneath and was
 * reported from a real device as confusing. A range needs no sentence.
 *
 * Single-letter meridiem because `12am-3am` is eight characters against a seven
 * character column, and a column that shifts is worse than a terse one.
 */
export const RANGE_COL_WIDTH = 7

function shortHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${h < 12 ? 'a' : 'p'}`
}

export function clockRangeCell(hour: number, intervalHours: number): string {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return cell('—', RANGE_COL_WIDTH)
  return cell(`${shortHour(hour)}-${shortHour(hour + intervalHours)}`, RANGE_COL_WIDTH)
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

/**
 * **Headers are words, and the unit is in the header.**
 *
 * `dew`, `RH`, `gst`, `dir`, `sky`, `mb` were abbreviations that had to be
 * decoded, and they were cut short to fit a width that was never the
 * constraint — measured on a real phone, a 26-character table used well under
 * half the message bubble. Reported as *"we have a lot of horizontal space but
 * you are cutting off words"*. Spend the width on the words.
 */
const COLUMNS = {
  temp: {
    header: (u) => (u === 'imperial' ? '°F' : '°C'),
    width: 4,
    render: (r, u) => tempCell(r.at?.temp_c ?? null, u, 4),
  },
  dew: {
    header: (u) => (u === 'imperial' ? 'dew °F' : 'dew °C'),
    width: 6,
    render: (r, u) => tempCell(r.at?.dewpoint_c ?? null, u, 6),
  },
  rh: {
    header: () => 'humidity %',
    width: 10,
    render: (r) => pctCell(r.at?.humidity_pct ?? null, 10),
  },
  wind: {
    header: (u) => (u === 'imperial' ? 'wind mph' : 'wind kmh'),
    width: 8,
    render: (r, u) => windCell(r.at?.wind_kmh ?? null, u, 8),
  },
  gust: {
    header: (u) => (u === 'imperial' ? 'gusts mph' : 'gusts kmh'),
    width: 9,
    render: (r, u) => windCell(r.at?.wind_gust_kmh ?? null, u, 9),
  },
  dir: {
    // "from", because that is what a compass point on a wind reading means and
    // "dir" made the reader work it out.
    header: () => 'from',
    width: 4,
    render: (r) => cell(compassPoint(r.at?.wind_dir_deg ?? null) ?? GAP, 4),
  },
  cloud: {
    header: () => 'cloud %',
    width: 7,
    render: (r) => pctCell(r.at?.cloud_pct ?? null, 7),
  },
  precip: {
    header: (u) => (u === 'imperial' ? 'rain in' : 'rain mm'),
    width: 7,
    render: (r, u) => precipCell(r.precip_mm, u, 7),
  },
  pressure: {
    header: () => 'pressure mb',
    width: 11,
    // NBM answers 384 nulls for this at every point measured, so the gap is the
    // common case rather than the edge one.
    render: (r) => {
      const hpa = r.at?.pressure_hpa ?? null
      return hpa === null ? cell(GAP, 11) : cell(round(hpa), 11)
    },
  },
} satisfies Record<string, Column>

/** The name of one renderable column. Exported so a caller can hold a column list. */
export type ForecastColumn = keyof typeof COLUMNS

type ColumnKey = ForecastColumn

/**
 * The column sets, and there is deliberately no picker between them.
 *
 * The panel used to offer four sets, four intervals, six models and a units
 * toggle — thirteen buttons under an eight-line table, which is what made the
 * chat surface unreadable. The default is now the four columns that answer
 * "can I climb": how warm, how windy, how wet, how sunny.
 *
 * **`⚙ More` draws two narrow tables rather than one wide one.** Every set here
 * stays inside the 32-character width `renderTable`'s own test asserts: the
 * `<pre>` path scrolls sideways rather than wrapping, and a single nine-column
 * detail table measures 50 characters, so it would have moved the reader's
 * problem from "too many buttons" to "half the numbers are off screen". Probe
 * B's nine-columns-fit finding was measured on a *rich* table, not this path.
 *
 * Between the three sets, every variable `weather_run_hours` stores is rendered
 * except `precip_prob_pct` — see `precipCell`'s neighbours and the note below.
 */
export const SIMPLE_COLUMNS = [
  'temp',
  'wind',
  'precip',
  'cloud',
] as const satisfies readonly ColumnKey[]

/** `⚙ More`, first table: everything about the air. 24 characters wide. */
export const DETAIL_AIR_COLUMNS = [
  'temp',
  'dew',
  'rh',
  'pressure',
] as const satisfies readonly ColumnKey[]

/** `⚙ More`, second table: everything that moves or falls. 28 characters wide. */
export const DETAIL_WIND_COLUMNS = [
  'wind',
  'gust',
  'dir',
  'precip',
  'cloud',
] as const satisfies readonly ColumnKey[]

/**
 * **`precipitation_probability` is not rendered by any set above, on purpose.**
 *
 * It is still fetched and still stored on `weather_run_hours.precip_prob_pct` —
 * this is a rendering decision, not a data one. Three reasons it lost its
 * column:
 *
 * 1. Probe A measured it running 276 h against HRRR's 54 h horizon and
 *    byte-identical to NBM's series. It is a blended field belonging to no
 *    single model, so a column in a table headed with one model's name needed a
 *    footnote saying it was not that model's figure — the exact kind of caveat
 *    this redesign exists to remove.
 * 2. The `🌧 Rain` panel already answers the same question better and with an
 *    attribution that holds: `members_wet / member_count` from the ensemble is
 *    a real proportion of real forecasts.
 * 3. Two differently-derived "chance of rain" numbers on two panels of the same
 *    bot invite the reader to reconcile them, and they do not reconcile.
 *
 * `probability_is_shared` is still carried on the run and still reaches the
 * database. Nothing about the honesty machinery was removed — only the column
 * that needed it.
 */

export type TableInput = {
  readonly rows: readonly ForecastRow[]
  readonly columns: readonly ColumnKey[]
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

  /**
   * **No inline bar.** One was drawn here and it was wrong twice: as `░` it
   * rendered on a real phone as a dithered slab, and as `█` with a blank track
   * it became a solid white staircase whose lowest row was empty — the day's
   * minimum scales to zero blocks. Reported as *"the wavy chart is weird"* and
   * *"bars are showing blank in areas"*, alongside *"we have a lot of
   * horizontal space but you are cutting off words"*. The width is spent on
   * spelled-out headers instead, which is what was actually asked for.
   */
  const headerCells = [
    cell('time', TIME_COL_WIDTH),
    ...input.columns.map((key) => cell(COLUMNS[key].header(input.units), COLUMNS[key].width)),
  ]

  const body = input.rows.map((row) =>
    [clockCell(row.hour), ...input.columns.map((key) => COLUMNS[key].render(row, input.units))].join(
      ' ',
    ),
  )

  return [headerCells.join(' '), ...body].join('\n')
}

/**
 * "rain is the total for the 3 h after each row" — stated because the reading is
 * not obvious and the alternative convention (the hour *before* each row, which
 * is how Open-Meteo stamps it) is equally plausible to a reader.
 */
export function stepNote(interval: IntervalHours): string {
  return interval === 1
    ? 'Each row is the reading at that time. Rain is the total for the hour after it.'
    : `Each row is the reading at that time. Rain is the total for the ${interval} hours after it.`
}
