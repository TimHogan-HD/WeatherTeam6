import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import { EM_DASH, formatPrecipIn, mmToIn, REWETTING_PRECIP_MM } from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { row, stack } from '../theme/styles.js'
import {
  dayLabel,
  hourKind,
  isRealRain,
  type HourCell,
  type PrecipDay,
  type PrecipKind,
  type RunningPoint,
} from '../lib/precipHistory.js'

/**
 * Every hour of the window as a table: **days across, hours down**, each day's
 * total along the foot. Tap (or arrow to) an hour and the readout above the
 * table shows what that hour carried — the Hourly charts' readout, on a grid.
 *
 * **Days across, not hours across** (owner, 2026-09-29: "every hour needs to be
 * a bit big"). Twenty-four columns on a phone left each cell ~12 px wide, too
 * small to tap; seven columns give ~40 px. The readout opens on the most recent
 * wet hour so the card is complete at rest.
 *
 * **Amount is the fill, kind is a ring.** One blue ramp (`precipStep1`–`5`)
 * carries how much fell; snow and a mix add a ring in their own colour rather
 * than repainting the step, and an hour whose kind is unknown gets no ring —
 * never called rain, never called snow.
 */

const CELL_H = 20
const HOUR_COL = '28px'
const SWATCH = 12
const FOCUS_RING = `0 0 0 2px ${colorsV2.txt1}`

const KIND_COLOR: Record<'mix' | 'snow', string> = {
  mix: colorsV2.precipMix,
  snow: colorsV2.precipSnow,
}
const KIND_LEGEND: Record<PrecipKind, string> = { rain: 'Rain', mix: 'Rain and snow', snow: 'Snow' }

/**
 * Each amount step's lower edge, mm in an hour, and its colour. The second
 * edge is the real-rain line, so an hour too light to re-wet the rock sits on
 * the dimmest step alone.
 */
const STEPS: readonly (readonly [minMm: number, color: string])[] = [
  [0, colorsV2.precipStep1],
  [REWETTING_PRECIP_MM, colorsV2.precipStep2],
  [1, colorsV2.precipStep3],
  [2, colorsV2.precipStep4],
  [4, colorsV2.precipStep5],
]
const TOP_STEP_IN = mmToIn(4).toFixed(2)

function stepColor(mm: number): string {
  let color = colorsV2.precipStep1 as string
  for (const [min, c] of STEPS) if (mm >= min) color = c
  return color
}

function kindRing(kind: PrecipKind | null): string | null {
  return kind === 'snow' || kind === 'mix' ? KIND_COLOR[kind] : null
}

/** `0.35`, `0`, `tr`, or a dash for a day with no data. The unit is in the card's aside. */
function dayFigure(mm: number | null): string {
  if (mm === null) return EM_DASH
  if (mm === 0) return '0'
  const inches = mmToIn(mm)
  return inches < 0.01 ? 'tr' : inches.toFixed(2)
}

const hh = (i: number) => String(i).padStart(2, '0')

/**
 * The hour a cell describes: stamp `06:00` closes `05:00–06:00`, and
 * `00:00` closes the previous day's last hour, so both days are named.
 */
function span(localDate: string, hour: number, today: string): string {
  if (hour > 0) return `${dayLabel(localDate, today)} ${hh(hour - 1)}:00–${hh(hour)}:00`
  const prev = new Date(Date.parse(`${localDate}T00:00Z`) - 24 * 3600 * 1000).toISOString().slice(0, 10)
  return `${dayLabel(prev, today)} 23:00–${dayLabel(localDate, today)} 00:00`
}

function Swatch({ color, ring }: { color: string; ring?: string }) {
  return (
    <span
      style={{
        width: `${SWATCH}px`,
        height: `${SWATCH}px`,
        borderRadius: `${radius.tag}px`,
        backgroundColor: color,
        ...(ring === undefined ? {} : { boxShadow: `inset 0 0 0 2px ${ring}` }),
      }}
    />
  )
}

function cellFill(cell: HourCell): { backgroundColor?: string; ring: string | null } {
  if (cell.state !== 'value') return { ring: null }
  const mm = cell.hour.precip_mm
  if (mm <= 0) return { backgroundColor: colorsV2.grid, ring: null }
  return { backgroundColor: stepColor(mm), ring: kindRing(hourKind(cell.hour)) }
}

/** What one hour carried, as label and value pairs. */
function readoutFields(cell: HourCell, soFarMm: number | null): { label: string; value: string }[] {
  if (cell.state === 'ahead') return [{ label: 'Precip', value: 'Still to come' }]
  if (cell.state === 'missing') return [{ label: 'Precip', value: 'No estimate for this hour' }]
  const h = cell.hour
  const fields = [{ label: 'Precip', value: h.precip_mm > 0 ? formatPrecipIn(h.precip_mm) : 'None' }]
  if (h.precip_mm > 0) {
    const kind = hourKind(h)
    fields.push({ label: 'Type', value: kind === null ? 'Unknown' : KIND_LEGEND[kind] })
    const snow = h.snowfall_cm ?? null
    if (snow !== null && snow > 0) fields.push({ label: 'Snow', value: `${(snow / 2.54).toFixed(1)} in` })
    fields.push({ label: 'Real rain', value: isRealRain(h) ? 'Yes' : 'No' })
  }
  if (soFarMm !== null) fields.push({ label: 'Week so far', value: formatPrecipIn(soFarMm) })
  return fields
}

type Pos = { d: number; h: number }

export type PrecipHourTableProps = {
  days: readonly PrecipDay[]
  grid: readonly (readonly HourCell[])[]
  points: readonly RunningPoint[]
  today: string
}

export function PrecipHourTable({ days, grid, points, today }: PrecipHourTableProps) {
  const soFar = new Map(points.map((p) => [p.validAtLocal, p.totalMm]))
  // Open on the most recent wet hour; failing that, the newest hour there is.
  const initial = (() => {
    let wet: Pos | null = null
    let any: Pos | null = null
    grid.forEach((col, d) =>
      col.forEach((c, h) => {
        if (c.state !== 'value') return
        any = { d, h }
        if (c.hour.precip_mm > 0) wet = { d, h }
      }),
    )
    return wet ?? any ?? { d: 0, h: 0 }
  })()
  const [sel, setSel] = useState<Pos>(initial)
  const tableRef = useRef<HTMLDivElement>(null)
  const keyed = useRef(false)
  // Arrow keys move the one tab stop; follow it with focus, but never steal
  // focus on a tap or on first render.
  useEffect(() => {
    if (!keyed.current) return
    keyed.current = false
    tableRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${sel.d}-${sel.h}"]`)?.focus()
  }, [sel])

  const selCell = grid[sel.d]?.[sel.h]
  const selDay = days[sel.d]
  const ringKinds = (['mix', 'snow'] as const).filter((k) =>
    grid.some((col) => col.some((c) => c.state === 'value' && c.hour.precip_mm > 0 && hourKind(c.hour) === k)),
  )

  const move = (e: KeyboardEvent<HTMLDivElement>) => {
    const step: Record<string, Pos> = {
      ArrowUp: { d: 0, h: -1 },
      ArrowDown: { d: 0, h: 1 },
      ArrowLeft: { d: -1, h: 0 },
      ArrowRight: { d: 1, h: 0 },
    }
    const by = step[e.key]
    if (by === undefined) return
    e.preventDefault()
    keyed.current = true
    setSel((p) => ({
      d: Math.min(days.length - 1, Math.max(0, p.d + by.d)),
      h: Math.min(23, Math.max(0, p.h + by.h)),
    }))
  }

  const columns = `${HOUR_COL} repeat(${days.length}, minmax(0, 1fr))`

  return (
    <div style={stack(spacing.listGapLg)}>
      <div
        aria-live="polite"
        style={{
          ...stack(spacing.tight),
          minHeight: '64px',
          padding: `${spacing.cellPad}px`,
          borderRadius: `${radius.rowV2}px`,
          backgroundColor: colorsV2.surface,
        }}
      >
        <span style={typeV2.rowTitle}>{selDay === undefined ? EM_DASH : span(selDay.localDate, sel.h, today)}</span>
        <div style={{ ...row(spacing.listGapLg), flexWrap: 'wrap', rowGap: `${spacing.tight}px` }}>
          {selCell === undefined || selDay === undefined
            ? null
            : readoutFields(selCell, soFar.get(`${selDay.localDate}T${hh(sel.h)}:00`) ?? null).map((f) => (
                <span key={f.label} style={{ ...stack(spacing.micro) }}>
                  <span style={typeV2.tileLabel}>{f.label}</span>
                  <span style={typeV2.factValue}>{f.value}</span>
                </span>
              ))}
        </div>
      </div>

      <div
        ref={tableRef}
        role="group"
        aria-label="Precipitation by hour: days across, hours down. Arrow keys move between hours."
        onKeyDown={move}
        style={{
          display: 'grid',
          gridTemplateColumns: columns,
          columnGap: '4px',
          rowGap: '3px',
          alignItems: 'center',
        }}
      >
        <span />
        {days.map((d, di) => {
          const label = dayLabel(d.localDate, today)
          return (
            <span
              key={d.localDate}
              style={{
                ...typeV2.dayTab,
                textAlign: 'center',
                color: di === sel.d || label === 'Today' ? colorsV2.txt1 : colorsV2.legend,
              }}
            >
              {label}
            </span>
          )
        })}
        {Array.from({ length: 24 }, (_, h) => [
          <span
            key={`h${h}`}
            style={{ ...typeV2.axisTick, color: h === sel.h ? colorsV2.txt1 : colorsV2.txtMuted }}
          >
            {hh(h)}
          </span>,
          ...days.map((d, di) => {
            const cell = grid[di]?.[h] ?? ({ state: 'missing' } as const)
            const { backgroundColor, ring } = cellFill(cell)
            const selected = di === sel.d && h === sel.h
            const shadows = [
              cell.state !== 'value' ? `inset 0 0 0 1px ${colorsV2.grid}` : null,
              ring === null ? null : `inset 0 0 0 2px ${ring}`,
              selected ? FOCUS_RING : null,
            ].filter((s): s is string => s !== null)
            return (
              <button
                key={`${d.localDate}-${h}`}
                type="button"
                data-cell={`${di}-${h}`}
                tabIndex={selected ? 0 : -1}
                aria-pressed={selected}
                aria-label={`${span(d.localDate, h, today)}: ${readoutFields(cell, null)
                  .map((f) => `${f.label} ${f.value}`)
                  .join(', ')}`}
                onClick={() => setSel({ d: di, h })}
                style={{
                  height: `${CELL_H}px`,
                  width: '100%',
                  padding: 0,
                  border: 'none',
                  cursor: 'pointer',
                  borderRadius: `${radius.tag}px`,
                  backgroundColor: backgroundColor ?? 'transparent',
                  boxShadow: shadows.length === 0 ? 'none' : shadows.join(', '),
                }}
              />
            )
          }),
        ])}
        <span style={{ ...typeV2.axisTick, paddingTop: `${spacing.tight}px` }}>in</span>
        {days.map((d) => {
          const wet = d.totalMm !== null && d.totalMm > 0
          return (
            <span
              key={`${d.localDate}-t`}
              style={{
                ...typeV2.dayChip,
                textAlign: 'center',
                paddingTop: `${spacing.tight}px`,
                color: wet ? colorsV2.txt1 : colorsV2.txtMuted,
              }}
            >
              {dayFigure(d.totalMm)}
            </span>
          )
        })}
      </div>

      <div style={{ ...row(spacing.chipGapMd), flexWrap: 'wrap' }}>
        <span style={typeV2.legendSm}>Dry</span>
        <Swatch color={colorsV2.grid} />
        <span style={{ ...typeV2.legendSm, marginLeft: `${spacing.listGap}px` }}>Less</span>
        {STEPS.map(([, c]) => (
          <Swatch key={c} color={c} />
        ))}
        <span style={typeV2.legendSm}>More ({TOP_STEP_IN}+ in/h)</span>
        {ringKinds.map((k) => (
          <span key={k} style={{ ...row(spacing.chipGapMd), marginLeft: `${spacing.listGap}px` }}>
            <Swatch color={colorsV2.grid} ring={KIND_COLOR[k]} />
            <span style={typeV2.legendSm}>{KIND_LEGEND[k]}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

