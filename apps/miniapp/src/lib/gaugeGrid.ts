import { EM_DASH, formatPrecipIn, mmToIn, type RainGaugeReadings } from '@weatherteam6/types'
import { missingLabel, type GaugeSide, type ModelDay } from './gaugeLines.js'

/**
 * The Gauges card's rain grid (#589, owner 2026-11-12, mockup version 13):
 * one row per source, one column per past day, and a total. Pure, so the
 * rules that keep a cell honest are tested here rather than in markup.
 *
 * **A cell is a figure, `part`, or a gap; never a 0 it did not measure**
 * (defect class 1). `part` is a day not every hour of which reported (an
 * airport day short an hour, the models' first day of the window): left out
 * of the total, as the owner decided. A gap (no report, a read that failed,
 * no models figure) **withholds the row's total**, because leaving it out
 * would print a drier week than the gauge measured.
 */

export type GridCell =
  | { kind: 'value'; mm: number }
  | { kind: 'part' }
  /** `why` is for a screen reader: the cell itself prints an em dash. */
  | { kind: 'gap'; why: string }

export type GridRowKey = 'models' | 'airport' | 'volunteer' | 'noaa'

export type GridRow = {
  key: GridRowKey
  name: string
  /** One per `RainGrid.dates`, in that order. */
  cells: GridCell[]
  /** The sum of the row's figures, `part` left out; null when any day is a gap. */
  totalMm: number | null
}

export type RainGrid = {
  /** The local dates, oldest first. */
  dates: string[]
  rows: GridRow[]
}

/** Build the grid from the gauges' days and the models' per-day totals (`modelDays`). */
export function rainGrid(r: RainGaugeReadings, models: ReadonlyMap<string, ModelDay>): RainGrid {
  const dates = r.days.map((d) => d.local_date)
  const rows: GridRow[] = [
    row(
      'models',
      'Models',
      r.days.map((d): GridCell => {
        const m = models.get(d.local_date)
        // Outside the hours the tab drew: no figure, never 0.
        if (m === undefined) return { kind: 'gap', why: 'no figure' }
        return m.kind === 'partial' ? { kind: 'part' } : { kind: 'value', mm: m.mm }
      }),
    ),
  ]
  if (r.airport !== null) {
    const missing = missingLabel(r, 'airport')
    rows.push(
      row(
        'airport',
        'Airport',
        r.days.map((d): GridCell =>
          d.gauge == null ? { kind: 'gap', why: missing } : d.gauge.rain_mm === null ? { kind: 'part' } : { kind: 'value', mm: d.gauge.rain_mm },
        ),
      ),
    )
  }
  if (r.volunteer.stations > 0) {
    const missing = missingLabel(r, 'volunteer')
    rows.push(
      row(
        'volunteer',
        'Volunteer',
        r.days.map((d): GridCell =>
          d.volunteer_gauge == null ? { kind: 'gap', why: missing } : { kind: 'value', mm: d.volunteer_gauge.rain_mm },
        ),
      ),
    )
  }
  if (r.noaa != null) {
    const missing = missingLabel(r, 'noaa')
    rows.push(
      row(
        'noaa',
        'NOAA',
        r.days.map((d): GridCell =>
          d.noaa_gauge == null
            ? { kind: 'gap', why: missing }
            : d.noaa_gauge.rain_mm === null
              ? { kind: 'part' }
              : { kind: 'value', mm: d.noaa_gauge.rain_mm },
        ),
      ),
    )
  }
  return { dates, rows }
}

function row(key: GridRowKey, name: string, cells: GridCell[]): GridRow {
  let total = 0
  for (const c of cells) {
    if (c.kind === 'gap') return { key, name, cells, totalMm: null }
    if (c.kind === 'value') total += c.mm
  }
  return { key, name, cells, totalMm: total }
}

/**
 * A figure as the grid prints it: inches with no unit (the footnote says
 * inches), `0` for a measured zero, `trace` for under 0.01 in, never `0.00`.
 */
export function inchFigure(mm: number): string {
  if (mm === 0) return '0'
  const text = formatPrecipIn(mm)
  return text === 'trace' ? 'trace' : mmToIn(mm).toFixed(2)
}

/** What a cell prints. */
export function cellText(c: GridCell): string {
  switch (c.kind) {
    case 'value':
      return inchFigure(c.mm)
    case 'part':
      return 'part'
    case 'gap':
      return EM_DASH
  }
}

/** The total cell's text: an em dash when the row's total is withheld. */
export function totalText(row: Pick<GridRow, 'totalMm'>): string {
  return row.totalMm === null ? EM_DASH : inchFigure(row.totalMm)
}

/** Rain that fills the shade: half an inch in a day. More is as dark as the grid goes. */
export const SHADE_FULL_MM = 12.7
const SHADE_MIN = 0.12
const SHADE_SPAN = 0.48

/**
 * How strongly a cell with rain is shaded, 0.12 to 0.60 on one fixed scale for
 * every crag, so a shade means the same rain everywhere. Null for no shading:
 * a zero, a trace (printed as a word), `part` and a gap.
 */
export function cellShade(c: GridCell): number | null {
  if (c.kind !== 'value' || c.mm <= 0 || formatPrecipIn(c.mm) === 'trace') return null
  return SHADE_MIN + SHADE_SPAN * Math.min(1, c.mm / SHADE_FULL_MM)
}

/**
 * The Rain tab's status word (#589 mockup: "Little rain", "Models matched"),
 * from the same comparison as the headline (`compareGauges`). An em dash when
 * no gauge has a whole day to set beside the models.
 */
export function rainTabWord(sides: readonly GaugeSide[]): string {
  if (sides.length === 0) return EM_DASH
  const told = sides.filter((s) => s.read !== 'little')
  const first = told[0]
  if (first === undefined) return 'Little rain'
  if (told.every((s) => s.read === first.read)) return first.read === 'matched' ? 'Models matched' : `Models ${first.read}`
  return told.some((s) => s.read === 'matched') ? 'Partly matched' : 'Gauges disagree'
}

const SIDE_NAME: Record<GaugeSide['kind'], string> = { airport: 'Airport', volunteer: 'Volunteer', noaa: 'NOAA' }

/** One gauge's figures under the headline: `Airport 0 in · models 0.05 in, over 5 whole days`. */
export function sideNote(s: GaugeSide): string {
  const days = `${s.days} whole ${s.days === 1 ? 'day' : 'days'}`
  return `${SIDE_NAME[s.kind]} ${formatPrecipIn(s.gaugeMm)} · models ${formatPrecipIn(s.modelsMm)}, over ${days}`
}

/** An instant's local date on the crag's clock (`YYYY-MM-DD`), or null if unreadable. */
export function localDateOf(iso: string, utcOffsetSeconds: number): string | null {
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? new Date(ms + utcOffsetSeconds * 1000).toISOString().slice(0, 10) : null
}
