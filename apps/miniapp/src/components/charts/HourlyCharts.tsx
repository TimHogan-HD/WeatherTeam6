import { useId, type ReactNode } from 'react'
import { colorsV2 } from '@weatherteam6/design/tokens'
import { EM_DASH } from '@weatherteam6/types'
import { typeV2 } from '../../theme/tokens.css.js'
import { niceTicks } from '../../lib/chartTicks.js'
import { compass, rowInches, type HourRow, type HourlyView } from '../../lib/hourlyRows.js'
import { SkyIcon } from '../Icons.js'
import { BAR_MIN_H, BAR_RADIUS, chartColorsV2, scoreRampColor } from './chartStyle.js'
import { bleed, keyInset, sectCard } from './DayCharts.js'
import { HOUR_MS } from './hourlySeries.js'
import {
  Bead,
  DISPLAY,
  Frost,
  KeyRow,
  LIQUID_W,
  LiquidFrame,
  MONO,
  ScaleFigure,
  Sect,
  Tube,
  XGradient,
  runsOf,
  scale,
  smoothPath,
  timeAxis,
  type Pt,
  type ReadoutItem,
  type TimeAxis,
} from './liquid.js'

/**
 * Hourly as charts (owner, 2026-11-24: mockup
 * `docs/handoffs/design-mockups/hourly-chart-view.html`, variant A, the List /
 * Chart switch). The charts Hourly had before it became rows (#667) —
 * temperature and humidity, sun, rain, wind — drawn from **the same rows the
 * list prints** (`lib/hourlyRows.ts`), so a figure on a chart is the figure in
 * its row. Rain is drawn as the owner's 2026-11-24 pick C: a row of chance
 * cells over amount bars, per hour.
 *
 * A row is the hour that starts at its label, so every chart shares one axis
 * from the first row's start to the last row's end. An instantaneous figure
 * (air, dew point, humidity, wind) sits at its row's start; a figure that
 * covers the hour (sun, cloud, chance, rain) is a bar across it. A pointer
 * reads the hour it is inside (`snap="floor"`), the same hour the list opens.
 *
 * The `all` view stacks the four, one read across all of them; any other view
 * draws its one chart taller.
 */

export type HourlyChartsProps = {
  rows: readonly HourRow[]
  /** The rain chart's inch scale, shared with the list's Rain column head. */
  rainTopIn: number
  good: { from: number; to: number } | null
  scored: boolean
  view: HourlyView
  utcOffsetSeconds: number
  nowMs: number
  readMs: number | null
  onRead: (ms: number) => void
}

/** Every chart's one scale sits at the left, four figures wide (owner, 2026-10-27). */
const SCALES = { left: 4, right: 0 }

/** Heights for a chart in the stack, and alone. */
const HEIGHTS = {
  temp: [150, 210],
  sun: [120, 170],
  rain: [140, 190],
  wind: [120, 170],
} as const

type Frame = {
  axis: TimeAxis
  instants: number[]
  utcOffsetSeconds: number
  nowMs: number
  read: { ms: number | null; onRead: (ms: number) => void }
  rows: readonly HourRow[]
  height: number
}

const or = (v: number | string | null, unit = ''): string => (v === null ? EM_DASH : `${v}${unit}`)

export function HourlyCharts({ rows, rainTopIn, good, scored, view, utcOffsetSeconds, nowMs, readMs, onRead }: HourlyChartsProps) {
  const first = rows[0]
  const last = rows[rows.length - 1]
  if (first === undefined || last === undefined) return null
  const axis = timeAxis(first.ms, last.ms + HOUR_MS, SCALES)
  const alone = view === 'all' ? 0 : 1
  const frame = (k: keyof typeof HEIGHTS): Frame => ({
    axis,
    instants: rows.map((r) => r.ms),
    utcOffsetSeconds,
    nowMs,
    read: { ms: readMs, onRead },
    rows,
    height: HEIGHTS[k][alone],
  })
  const show = (k: Exclude<HourlyView, 'all'>) => view === 'all' || view === k

  return (
    <>
      {show('temp') ? (
        <section style={sectCard}>
          <Sect title="Temperature and humidity" aside="°F" />
          <TemperatureChart {...frame('temp')} scored={scored} good={good} />
        </section>
      ) : null}
      {show('sun') ? (
        <section style={sectCard}>
          <Sect title="Sun" aside="minutes of sun in the hour" />
          <SunChart {...frame('sun')} />
        </section>
      ) : null}
      {show('rain') ? (
        <section style={sectCard}>
          <Sect title="Rain" aside="chance · inches per hour" />
          <RainChart {...frame('rain')} topIn={rainTopIn} />
        </section>
      ) : null}
      {show('wind') ? (
        <section style={sectCard}>
          <Sect title="Wind" aside="mph" />
          <WindChart {...frame('wind')} />
        </section>
      ) : null}
    </>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p style={{ ...typeV2.body, margin: 0 }}>{children}</p>
}

/** The row being read, if any. */
function readRow(rows: readonly HourRow[], ms: number | null): HourRow | null {
  return ms === null ? null : (rows.find((r) => r.ms === ms) ?? null)
}

/** An hour's span on the axis, inset a pixel each side so neighbouring bars stand apart. */
function span(axis: TimeAxis, ms: number): { x: number; w: number; mid: number } {
  const x0 = axis.x(ms)
  const x1 = axis.x(ms + HOUR_MS)
  return { x: x0 + 1, w: Math.max(1, x1 - x0 - 2), mid: (x0 + x1) / 2 }
}

/** Points of one figure, a run per unbroken stretch: a gap breaks the line, never bridges it. */
function lineRuns(rows: readonly HourRow[], axis: TimeAxis, value: (r: HourRow) => number | null, y: (v: number) => number): Pt[][] {
  return runsOf(
    rows.map((r) => ({ t: r.ms, v: value(r) })),
    (d) => d.v !== null,
  ).map((run) => run.map((d) => [axis.x(d.t), y(d.v ?? 0)] as const))
}

function Grid({ axis, ticks, y, unit = '' }: { axis: TimeAxis; ticks: readonly number[]; y: (v: number) => number; unit?: string }) {
  return (
    <>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={axis.left} x2={axis.right} y1={y(v)} y2={y(v)} stroke={chartColorsV2.grid} />
          <ScaleFigure side="start" y={y(v)}>{`${v}${unit}`}</ScaleFigure>
        </g>
      ))}
    </>
  )
}

/**
 * Air as the line, coloured by each hour's score on a crag and neutral
 * elsewhere; the likely range behind it, the dew point dashed, humidity on a
 * fixed 0–100% scale of its own (read in the chip, not printed: one scale per
 * chart), the good hours shaded, the sky every three hours.
 */
function TemperatureChart({ axis, instants, utcOffsetSeconds, nowMs, read, rows, height: H, scored, good }: Frame & { scored: boolean; good: { from: number; to: number } | null }) {
  const gradient = useId()
  const temps = rows.flatMap((r) => [r.lowF ?? r.tempF, r.highF ?? r.tempF, r.dewF]).filter((v): v is number => v !== null)
  if (!rows.some((r) => r.tempF !== null) || temps.length === 0) return <Empty>No hourly temperature for this day.</Empty>
  const ticks = niceTicks(Math.min(...temps), Math.max(...temps))
  const top = 22
  const base = H - 26
  const y = scale(ticks[0] ?? 0, ticks[ticks.length - 1] ?? 0, base, top)
  const hy = scale(0, 100, base, top)
  const airColor = (r: HourRow | null) => (scored && r !== null && r.score !== null ? scoreRampColor(r.score) : chartColorsV2.air)
  const rr = readRow(rows, read.ms)
  const hasDew = rows.some((r) => r.dewF !== null)
  const hasHumidity = rows.some((r) => r.humidityPct !== null)
  const band = runsOf(
    rows.map((r) => ({ t: r.ms, lo: r.lowF, hi: r.highF })),
    (d) => d.lo !== null && d.hi !== null,
  )

  return (
    <div style={bleed}>
      <LiquidFrame
        height={H}
        top={10}
        bottom={22}
        axis={axis}
        instants={instants}
        utcOffsetSeconds={utcOffsetSeconds}
        nowMs={nowMs}
        read={read}
        snap="floor"
        title={hasHumidity ? 'Temperature, dew point and humidity by hour' : 'Temperature by hour'}
        readout={
          rr === null
            ? []
            : [
                { label: 'air', value: or(rr.tempF, '°'), color: airColor(rr) },
                ...(hasDew ? [{ label: 'dew', value: or(rr.dewF, '°'), color: chartColorsV2.dewPoint }] : []),
                ...(hasHumidity ? [{ label: 'humidity', value: or(rr.humidityPct, '%'), color: chartColorsV2.humidity }] : []),
              ]
        }
      >
        <defs>
          <XGradient id={gradient} stops={rows.map((r) => ({ at: axis.x(r.ms) / LIQUID_W, color: airColor(r) }))} />
        </defs>
        <Grid axis={axis} ticks={ticks} y={y} unit="°" />
        {good === null
          ? null
          : rows
              .filter((r) => r.ms >= good.from && r.ms <= good.to)
              .map((r) => {
                const s = span(axis, r.ms)
                return <rect key={r.ms} data-good="" x={s.x - 1} y={top - 4} width={s.w + 2} height={base - top + 8} fill={chartColorsV2.goodHours} />
              })}
        {band.map((run, i) => (
          <Frost
            key={i}
            top={run.map((d) => [axis.x(d.t), y(d.hi ?? 0)] as Pt)}
            bottom={run.map((d) => [axis.x(d.t), y(d.lo ?? 0)] as Pt)}
            color={chartColorsV2.airBand}
          />
        ))}
        {lineRuns(rows, axis, (r) => r.humidityPct, hy).map((pts, i) => (
          <path key={i} d={smoothPath(pts)} fill="none" stroke={chartColorsV2.humidity} strokeWidth={1.8} opacity={0.85} data-humidity="" />
        ))}
        {lineRuns(rows, axis, (r) => r.dewF, y).map((pts, i) => (
          <path key={i} d={smoothPath(pts)} fill="none" stroke={chartColorsV2.dewPoint} strokeWidth={2} strokeDasharray="5 4" data-dew="" />
        ))}
        {lineRuns(rows, axis, (r) => r.tempF, y).map((pts, i) => (
          <Tube key={i} d={smoothPath(pts)} stroke={`url(#${gradient})`} width={6} />
        ))}
        {rr === null || rr.humidityPct === null ? null : <circle cx={axis.x(rr.ms)} cy={hy(rr.humidityPct)} r={3.5} fill={chartColorsV2.humidity} />}
        {rr === null || rr.tempF === null ? null : <Bead x={axis.x(rr.ms)} y={y(rr.tempF)} color={airColor(rr)} />}
        {rows
          .filter((r) => r.sky !== null && new Date(r.ms + utcOffsetSeconds * 1000).getUTCHours() % 3 === 0)
          .map((r) => (
            <g key={r.ms} data-sky="" transform={`translate(${(span(axis, r.ms).mid - 7).toFixed(1)} 0)`}>
              <SkyIcon sky={r.sky!} size={14} />
            </g>
          ))}
      </LiquidFrame>
      <div style={keyInset}>
        <KeyRow
          keys={[
            {
              label: scored ? 'air, coloured by score' : 'air',
              swatch: {
                kind: 'line',
                background: scored ? `linear-gradient(90deg, ${scoreRampColor(20)}, ${scoreRampColor(50)}, ${scoreRampColor(90)})` : chartColorsV2.air,
              },
            },
            ...(hasDew ? [{ label: 'dew point', swatch: { kind: 'dash' as const, color: chartColorsV2.dewPoint } }] : []),
            ...(hasHumidity ? [{ label: 'humidity', swatch: { kind: 'line' as const, background: chartColorsV2.humidity } }] : []),
            { label: 'likely range', swatch: { kind: 'block', background: colorsV2.rangeFrost } },
            ...(good === null ? [] : [{ label: 'good hours', swatch: { kind: 'block' as const, background: colorsV2.brand, opacity: 0.4 } }]),
          ]}
        />
      </div>
    </div>
  )
}

/**
 * Minutes of bright sun per hour on a fixed 0–60 scale, the cloud behind
 * (owner, 2026-11-03, `sun-hours.html` option B). Night hours carry no bar and
 * one `night` word per run. A daylight hour with no answer is a dashed gap,
 * never an empty bar, which would be a measured hour without sun.
 */
function SunChart({ axis, instants, utcOffsetSeconds, nowMs, read, rows, height: H }: Frame) {
  if (!rows.some((r) => r.daylight === true && r.sunMin !== null)) return <Empty>No sunshine forecast for this day yet.</Empty>
  const base = H - 26
  const y = scale(0, 60, base, 14)
  const cy = scale(0, 100, base, 14)
  const rr = readRow(rows, read.ms)
  const nights = runsOf(
    rows.map((r) => ({ t: r.ms, night: r.daylight === false })),
    (d) => d.night,
  )

  return (
    <div style={bleed}>
      <LiquidFrame
        height={H}
        top={10}
        bottom={22}
        axis={axis}
        instants={instants}
        utcOffsetSeconds={utcOffsetSeconds}
        nowMs={nowMs}
        read={read}
        snap="floor"
        title="Minutes of sun and cloud cover by hour"
        readout={
          rr === null
            ? []
            : [
                rr.daylight === false
                  ? { label: '', value: 'night' }
                  : { label: 'sun', value: or(rr.sunMin, ' min'), color: colorsV2.sun },
                { label: 'cloud', value: or(rr.cloudPct, '%'), color: chartColorsV2.sunCloudKey },
              ]
        }
      >
        {[0, 30, 60].map((v) => (
          <g key={v}>
            <line x1={axis.left} x2={axis.right} y1={y(v)} y2={y(v)} stroke={chartColorsV2.grid} />
            <ScaleFigure side="start" y={y(v)}>{v === 0 ? '0' : `${v}m`}</ScaleFigure>
          </g>
        ))}
        {rows.map((r) => {
          if (r.cloudPct === null) return null
          const s = span(axis, r.ms)
          const t = cy(Math.min(100, Math.max(0, r.cloudPct)))
          return <rect key={`c${r.ms}`} data-cloud="" x={s.x} y={t} width={s.w} height={Math.max(0, base - t)} rx={2} fill={r.ms === read.ms ? chartColorsV2.sunCloudRead : chartColorsV2.sunCloud} />
        })}
        {rows.map((r) => {
          if (r.daylight !== true) return null
          const s = span(axis, r.ms)
          if (r.sunMin === null) {
            return <line key={`s${r.ms}`} data-sun-gap="" x1={s.x} x2={s.x + s.w} y1={base - 3} y2={base - 3} stroke={colorsV2.txtMuted} strokeWidth={1.5} strokeDasharray="2 2" />
          }
          const h = Math.max(BAR_MIN_H, base - y(Math.min(60, Math.max(0, r.sunMin))))
          return <rect key={`s${r.ms}`} data-sun="" x={s.x} y={base - h} width={s.w} height={h} rx={Math.min(BAR_RADIUS, s.w / 2)} fill={colorsV2.sun} opacity={r.sunMin < 1 ? 0.35 : 1} />
        })}
        {nights.map((run) => {
          const a = span(axis, run[0]!.t)
          const z = span(axis, run[run.length - 1]!.t)
          if (z.x + z.w - a.x < 34) return null
          return (
            <text key={`n${run[0]!.t}`} data-night="" x={(a.x + z.x + z.w) / 2} y={base - 6} textAnchor="middle" fill={colorsV2.txtMuted} style={{ font: `500 11px ${MONO}` }}>
              night
            </text>
          )
        })}
      </LiquidFrame>
      <div style={keyInset}>
        <KeyRow
          keys={[
            { label: 'minutes of sun', swatch: { kind: 'block', background: colorsV2.sun, opacity: 1 } },
            { label: 'cloud', swatch: { kind: 'block', background: chartColorsV2.sunCloudKey, opacity: 1 } },
          ]}
        />
      </div>
    </div>
  )
}

/** A chance figure is written in its cell from this share up; lower cells stay quiet. */
export const CHANCE_FIGURE_MIN = 30

/** A chance cell's fill opacity: faint at 0%, never so strong that its figure loses contrast. */
export function chanceOpacity(pct: number): number {
  return 0.06 + (0.39 * Math.min(100, Math.max(0, pct))) / 100
}

/**
 * Rain as C (owner, 2026-11-24, `research-overview-hourly.html` §2b): a row of
 * cells on top, one per hour, darker the likelier, with the chance written from
 * `CHANCE_FIGURE_MIN` up; under it each hour's inches as a bar on the printed
 * inch scale the list's Rain column uses. Every mark has its own scale or none:
 * no second axis. An unanswered chance is a dashed cell, never a pale one; an
 * unanswered amount draws no bar and a dashed baseline.
 */
function RainChart({ axis, instants, utcOffsetSeconds, nowMs, read, rows, height: H, topIn }: Frame & { topIn: number }) {
  const cellTop = 2
  const cellH = 20
  const base = H - 26
  const y = scale(0, topIn, base, cellTop + cellH + 16)
  const rr = readRow(rows, read.ms)
  const ticks = [0, topIn / 2, topIn]

  return (
    <div style={bleed}>
      <LiquidFrame
        height={H}
        top={cellTop + cellH + 6}
        bottom={22}
        axis={axis}
        instants={instants}
        utcOffsetSeconds={utcOffsetSeconds}
        nowMs={nowMs}
        read={read}
        snap="floor"
        title="Chance of rain by hour as a row of cells, and inches of rain by hour as bars"
        readout={
          rr === null
            ? []
            : [
                { label: 'chance', value: or(rr.chancePct, '%'), color: colorsV2.rain },
                { label: 'rain', value: rr.rainIn === null ? EM_DASH : `${rowInches(rr.rainIn)} in`, color: colorsV2.rainAmount },
              ]
        }
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={axis.left} x2={axis.right} y1={y(v)} y2={y(v)} stroke={chartColorsV2.grid} />
            <ScaleFigure side="start" y={y(v)}>{v === 0 ? '0' : (rowInches(v) ?? '')}</ScaleFigure>
          </g>
        ))}
        <ScaleFigure side="start" y={cellTop + cellH / 2}>%</ScaleFigure>
        {rows.map((r) => {
          const s = span(axis, r.ms)
          if (r.chancePct === null) {
            return (
              <rect key={`c${r.ms}`} data-chance-gap="" x={s.x + 0.5} y={cellTop + 0.5} width={Math.max(0, s.w - 1)} height={cellH - 1} rx={3} fill="none" stroke={colorsV2.txtMuted} strokeDasharray="2 2" opacity={0.7} />
            )
          }
          return (
            <g key={`c${r.ms}`} data-chance={r.chancePct}>
              <rect x={s.x} y={cellTop} width={s.w} height={cellH} rx={3} fill={colorsV2.rain} opacity={chanceOpacity(r.chancePct)} />
              {r.chancePct >= CHANCE_FIGURE_MIN ? (
                <text x={s.mid} y={cellTop + cellH / 2 + 4} textAnchor="middle" fill={colorsV2.txt1} style={{ font: `600 10px ${DISPLAY}` }}>
                  {r.chancePct}
                </text>
              ) : null}
            </g>
          )
        })}
        {rr === null ? null : (() => {
          const s = span(axis, rr.ms)
          return <rect data-read-cell="" x={s.x - 1} y={cellTop - 1.5} width={s.w + 2} height={cellH + 3} rx={4} fill="none" stroke={colorsV2.txt1} strokeWidth={1.5} />
        })()}
        {rows.map((r) => {
          const s = span(axis, r.ms)
          if (r.rainIn === null) {
            return <line key={`a${r.ms}`} data-rain-gap="" x1={s.x} x2={s.x + s.w} y1={base - 2} y2={base - 2} stroke={colorsV2.txtMuted} strokeWidth={1.5} strokeDasharray="2 2" />
          }
          if (r.rainIn <= 0) return null
          const h = Math.max(BAR_MIN_H, base - y(Math.min(topIn, r.rainIn)))
          return <rect key={`a${r.ms}`} data-rain="" x={s.x + 0.5} y={base - h} width={Math.max(1, s.w - 1)} height={h} rx={Math.min(BAR_RADIUS, s.w / 2)} fill={colorsV2.rainAmount} />
        })}
      </LiquidFrame>
      <div style={keyInset}>
        <KeyRow
          keys={[
            { label: 'chance, darker the likelier', swatch: { kind: 'block', background: colorsV2.rain, opacity: 0.45 } },
            { label: 'inches in the hour', swatch: { kind: 'block', background: colorsV2.rainAmount, opacity: 1 } },
          ]}
        />
      </div>
    </div>
  )
}

/** Sustained wind as the line, gusts dashed, the ensemble's likely range shaded. */
function WindChart({ axis, instants, utcOffsetSeconds, nowMs, read, rows, height: H }: Frame) {
  if (!rows.some((r) => r.windMph !== null)) return <Empty>No hourly wind for this day.</Empty>
  const highs = rows.flatMap((r) => [r.windMph, r.gustMph, r.windHighMph]).filter((v): v is number => v !== null)
  const ticks = niceTicks(0, Math.max(...highs))
  const base = H - 26
  const y = scale(ticks[0] ?? 0, ticks[ticks.length - 1] ?? 0, base, 12)
  const rr = readRow(rows, read.ms)
  const hasGusts = rows.some((r) => r.gustMph !== null)
  const band = runsOf(
    rows.map((r) => ({ t: r.ms, lo: r.windLowMph, hi: r.windHighMph })),
    (d) => d.lo !== null && d.hi !== null,
  )
  const dir = rr === null ? null : compass(rr.windFromDeg)

  return (
    <div style={bleed}>
      <LiquidFrame
        height={H}
        top={10}
        bottom={22}
        axis={axis}
        instants={instants}
        utcOffsetSeconds={utcOffsetSeconds}
        nowMs={nowMs}
        read={read}
        snap="floor"
        title="Wind by hour"
        readout={
          rr === null
            ? []
            : ([
                { label: 'wind', value: rr.windMph === null ? EM_DASH : `${rr.windMph} mph${dir === null ? '' : ` ${dir}`}`, color: chartColorsV2.wind },
                ...(hasGusts ? [{ label: 'gusts', value: or(rr.gustMph, ' mph'), color: chartColorsV2.gust }] : []),
              ] satisfies ReadoutItem[])
        }
      >
        <Grid axis={axis} ticks={ticks} y={y} />
        {band.map((run, i) => (
          <Frost
            key={i}
            top={run.map((d) => [axis.x(d.t), y(d.hi ?? 0)] as Pt)}
            bottom={run.map((d) => [axis.x(d.t), y(d.lo ?? 0)] as Pt)}
            color={chartColorsV2.wind}
          />
        ))}
        {lineRuns(rows, axis, (r) => r.gustMph, y).map((pts, i) => (
          <path key={i} d={smoothPath(pts)} fill="none" stroke={chartColorsV2.gust} strokeWidth={2} strokeDasharray="5 4" data-gust="" />
        ))}
        {lineRuns(rows, axis, (r) => r.windMph, y).map((pts, i) => (
          <Tube key={i} d={smoothPath(pts)} stroke={chartColorsV2.wind} width={5} />
        ))}
        {rr === null || rr.windMph === null ? null : <Bead x={axis.x(rr.ms)} y={y(rr.windMph)} color={chartColorsV2.wind} />}
      </LiquidFrame>
      <div style={keyInset}>
        <KeyRow
          keys={[
            { label: 'sustained', swatch: { kind: 'line', background: chartColorsV2.wind } },
            ...(hasGusts ? [{ label: 'gusts', swatch: { kind: 'dash' as const, color: chartColorsV2.gust } }] : []),
            { label: 'likely range', swatch: { kind: 'block', background: chartColorsV2.wind, opacity: 0.4 } },
          ]}
        />
      </div>
    </div>
  )
}
