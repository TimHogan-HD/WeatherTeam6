import { useId, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { chartGlow, colorsV2 } from '@weatherteam6/design/tokens'
import { typeV2, withOpacity } from '../../theme/tokens.css.js'
import { formatLocalHour, formatLocalHourShort } from '../../lib/format.js'
import type { SeriesDatum } from './hourlySeries.js'
import { StreamIn } from './StreamIn.js'

/**
 * The hybrid look's charts (`docs/handoffs/design-mockups/weatherteam6-hybrid.html`,
 * owner 2026-10-19), drawn the way the mockup draws them: a fixed 390-wide
 * viewBox scaled to the card, curves through the hours, a line drawn as a
 * glowing tube with a shine along its top, a range as frosted glass, and the
 * hour being read as a ringed bead.
 *
 * **Every x comes from the hour's instant, never its index** — a day that
 * crosses a clock change has 23 or 25 hours, and a missing hour must leave a
 * gap, not close up.
 */

export const LIQUID_W = 390
export const LIQUID_PX = 18

export type Pt = readonly [number, number]

/** A curve through the points (Catmull-Rom as cubic Béziers), as the mockup's `smooth`. */
export function smoothPath(pts: readonly Pt[]): string {
  const first = pts[0]
  if (first === undefined) return ''
  let d = `M${first[0].toFixed(1)} ${first[1].toFixed(1)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i]
    const p2 = pts[i + 1]
    if (p1 === undefined || p2 === undefined) continue
    const p0 = pts[i - 1] ?? p1
    const p3 = pts[i + 2] ?? p2
    const c1x = p1[0] + (p2[0] - p0[0]) / 6
    const c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6
    const c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return d
}

/** A closed band between two curves sharing their x positions. */
export function ribbonPath(top: readonly Pt[], bottom: readonly Pt[]): string {
  if (top.length === 0 || bottom.length === 0) return ''
  return `${smoothPath(top)} L${smoothPath([...bottom].reverse()).slice(1)} Z`
}

const HOUR_MS = 3_600_000

/**
 * Consecutive hours that all pass `ok`, so a curve breaks across a gap rather
 * than drawing straight through an hour nobody forecast.
 */
export function runsOf<T extends { t: number }>(items: readonly T[], ok: (item: T) => boolean): T[][] {
  const runs: T[][] = []
  let current: T[] = []
  let last: number | null = null
  for (const item of items) {
    if (!ok(item) || (last !== null && item.t - last > HOUR_MS * 1.5)) {
      if (current.length > 0) runs.push(current)
      current = []
    }
    if (ok(item)) {
      current.push(item)
      last = item.t
    } else {
      last = null
    }
  }
  if (current.length > 0) runs.push(current)
  return runs
}

/** A linear scale from a value domain onto a pixel range. A flat domain maps to the middle. */
export function scale(min: number, max: number, from: number, to: number): (v: number) => number {
  const span = max - min
  return (v) => (span === 0 ? (from + to) / 2 : from + ((v - min) / span) * (to - from))
}

/** The soft glow under every tube (`chartGlow`, the owner's pick of "Soft"). */
export function GlowFilter({ id }: { id: string }) {
  return (
    <filter id={id} x="-20%" y="-50%" width="140%" height="160%">
      <feGaussianBlur stdDeviation={chartGlow.blurStdDev} result="b" />
      <feComponentTransfer in="b" result="d">
        <feFuncA type="linear" slope={chartGlow.alpha} />
      </feComponentTransfer>
      <feMerge>
        <feMergeNode in="d" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  )
}

/** A line as a glowing tube with a thin shine along its top. */
export function Tube({ d, stroke, width }: { d: string; stroke: string; width: number }) {
  const glow = useId()
  return (
    <>
      <defs>
        <GlowFilter id={glow} />
      </defs>
      <path
        d={d}
        fill="none"
        stroke={stroke}
        strokeWidth={width * chartGlow.strokeScale}
        strokeLinecap="round"
        filter={`url(#${glow})`}
        data-line=""
      />
      <path
        d={d}
        fill="none"
        stroke={withOpacity(colorsV2.txt1, 0.45 * chartGlow.alpha)}
        strokeWidth={1.2}
        transform="translate(0 -1.5)"
      />
    </>
  )
}

/** A range as frosted glass, with a faint edge along its top. */
export function Frost({ top, bottom, color }: { top: readonly Pt[]; bottom: readonly Pt[]; color: string }) {
  if (top.length < 2) return null
  return (
    <>
      <path d={ribbonPath(top, bottom)} fill={color} opacity={0.22} data-range="" />
      <path d={smoothPath(top)} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
    </>
  )
}

/** The hour being read, on a line: a glass ring around a dot of the line's colour. */
export function Bead({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g pointerEvents="none" data-bead="">
      <circle cx={x} cy={y} r={13} fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.55)" strokeWidth={1.2} />
      <circle cx={x} cy={y} r={5} fill={color} />
    </g>
  )
}

/**
 * A gradient across the whole viewBox, stops at x fractions of it — in user
 * space, so a stop sits over its hour whatever part of the width a curve spans.
 */
export function XGradient({ id, stops }: { id: string; stops: readonly { at: number; color: string }[] }) {
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={LIQUID_W} y2={0}>
      {stops.map((s, i) => (
        <stop key={i} offset={`${(Math.min(1, Math.max(0, s.at)) * 100).toFixed(1)}%`} stopColor={s.color} />
      ))}
    </linearGradient>
  )
}

export const MONO = typeV2.axisTick.fontFamily
export const DISPLAY = typeV2.readFigure.fontFamily

/** A small label in the chart's own mono. */
export function Label({
  x,
  y,
  anchor,
  color = colorsV2.txtMuted,
  children,
}: {
  x: number
  y: number
  anchor: 'start' | 'middle' | 'end'
  color?: string
  children: ReactNode
}) {
  return (
    <text x={x} y={y} fontFamily={MONO} fontSize={9} fill={color} textAnchor={anchor}>
      {children}
    </text>
  )
}

/**
 * A scale's figures stand in a gutter of their own beside the plot, so no line
 * or mark runs through one (owner, 2026-10-27, the slimmer of the gutters
 * mocked): `SCALE_EDGE` in from the viewBox's edge, a little outside the
 * card's text, and `SCALE_GAP` clear of the plot.
 */
const SCALE_EDGE = 14
const SCALE_GAP = 4
/** IBM Plex Mono's advance at a `Label`'s 9 units. */
const LABEL_CHAR_W = 5.4

/** The longest scale figure at each side, in characters; 0 for a side with none. */
export type ScaleChars = { left: number; right: number }

/** The plot's inset at a side whose longest figure is `chars` long. A side with none keeps `LIQUID_PX`. */
function gutter(chars: number): number {
  return chars === 0 ? LIQUID_PX : SCALE_EDGE + chars * LABEL_CHAR_W + SCALE_GAP
}

/** The plot's left and right edges, in viewBox units, for figures this long at each side. */
export function plotSpan(chars: ScaleChars): { left: number; right: number } {
  return { left: gutter(chars.left), right: LIQUID_W - gutter(chars.right) }
}

/** A scale figure in its gutter, centred on the gridline at `y`. */
export function ScaleFigure({
  side,
  y,
  color,
  children,
}: {
  side: 'start' | 'end'
  y: number
  color?: string
  children: ReactNode
}) {
  return (
    <Label x={side === 'start' ? SCALE_EDGE : LIQUID_W - SCALE_EDGE} y={y + 3} anchor={side} color={color}>
      {children}
    </Label>
  )
}

export type TimeAxis = {
  fromMs: number
  toMs: number
  /** The plot's edges: the first hour's x and the last's. */
  left: number
  right: number
  x: (ms: number) => number
}

/** The day's hours across the plot, first hour at its left edge and last at its right. */
export function timeAxis(fromMs: number, toMs: number, chars: ScaleChars = { left: 0, right: 0 }): TimeAxis {
  const { left, right } = plotSpan(chars)
  return { fromMs, toMs, left, right, x: scale(fromMs, toMs, left, right) }
}

/** One figure in a read chip. `color` is its series' dot; without one the figure stands alone, as Dryness does. */
export type ReadoutItem = { label: string; value: string; color?: string; valueColor?: string }

/**
 * The read hour's figures as a chip above a chart, following the read line.
 * `at` is the line's share of the plotted width, as a percent: the chip moves
 * left by the same share of its own width, so at the left edge it starts on
 * the line, mid-chart it centres on it, and at the right edge it ends on it.
 * That keeps it inside the card without measuring it.
 */
export function ReadChip({
  hour,
  items,
  at,
  span,
  large = false,
}: {
  hour: string
  items: readonly ReadoutItem[]
  at: number
  /** The plot's edges in viewBox units, which the chip's track spans. */
  span: { left: number; right: number }
  /** The Overview's size, a step up from Hourly's. */
  large?: boolean
}) {
  const share = (v: number) => `${((v / LIQUID_W) * 100).toFixed(2)}%`
  const dot = large ? 8 : 6
  return (
    <div
      style={{
        position: 'relative',
        height: large ? '28px' : '22px',
        margin: `0 ${share(LIQUID_W - span.right)} 2px ${share(span.left)}`,
      }}
    >
      <p
        data-readout=""
        aria-live="polite"
        style={{
          ...(large ? typeV2.readChip : typeV2.keyRow),
          position: 'absolute',
          top: 0,
          left: `${at.toFixed(1)}%`,
          transform: `translateX(-${at.toFixed(1)}%)`,
          margin: 0,
          padding: large ? '3px 11px' : '2px 8px',
          borderRadius: large ? '13px' : '10px',
          whiteSpace: 'nowrap',
          background: withOpacity(colorsV2.txt1, 0.08),
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <b style={{ color: colorsV2.txt1 }}>{hour}</b>
        {items.map((r, i) => (
          <span key={i} style={{ marginLeft: large ? '12px' : '10px' }}>
            {r.color === undefined ? null : (
              <i
                aria-hidden
                style={{
                  display: 'inline-block',
                  width: `${dot}px`,
                  height: `${dot}px`,
                  borderRadius: `${dot / 2}px`,
                  marginRight: '4px',
                  verticalAlign: 'middle',
                  background: r.color,
                }}
              />
            )}
            {r.label === '' ? null : `${r.label} `}
            <b style={{ color: r.valueColor ?? colorsV2.txt1 }}>{r.value}</b>
          </span>
        ))}
      </p>
    </div>
  )
}

/** The hour nearest a pointer's x, of the instants given. */
function nearest(instants: readonly number[], ms: number): number | null {
  let best: number | null = null
  for (const t of instants) if (best === null || Math.abs(t - ms) < Math.abs(best - ms)) best = t
  return best
}

/**
 * Marks a scrub chart as focused by a tap or a click, so `globals.css` draws no
 * focus ring round it; a key press or leaving the chart clears the mark, so
 * keyboard focus always gets the ring. iOS Safari counts a tap on a focusable
 * SVG as `:focus-visible`. Press only — a mouse hover must not mark it.
 */
export function markTapped(e: { currentTarget: Element }) {
  e.currentTarget.setAttribute('data-tapped', '')
}

export function clearTapped(e: { currentTarget: Element }) {
  e.currentTarget.removeAttribute('data-tapped')
}

/**
 * One chart's frame: the viewBox, the hour labels every six hours, the
 * reading rule and the now rule, and the hit area that picks an hour.
 *
 * **Tap or drag to read an hour**; `pan-y` keeps the page scrolling under a
 * vertical swipe, and arrow keys step for a keyboard.
 */
export function LiquidFrame({
  height,
  top,
  bottom,
  axis,
  instants,
  utcOffsetSeconds,
  nowMs,
  read,
  bare = false,
  title,
  readout,
  children,
}: {
  height: number
  top: number
  bottom: number
  axis: TimeAxis
  /** The hours that can be read. */
  instants: readonly number[]
  utcOffsetSeconds: number
  nowMs: number
  read: { ms: number | null; onRead: (ms: number) => void }
  /** No reading rule and no now rule: a chart with nothing on it to read. */
  bare?: boolean
  title: string
  /**
   * What the chart draws at the read hour, shown above the plot so it tracks
   * the read line and covers no mark. Each value is the drawn series' own
   * figure, already formatted, an em dash for a gap.
   */
  readout?: readonly ReadoutItem[]
  children: ReactNode
}) {
  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const vx = ((e.clientX - box.left) / Math.max(1, box.width)) * LIQUID_W
    const ms = axis.fromMs + ((vx - axis.left) / (axis.right - axis.left)) * (axis.toMs - axis.fromMs)
    const hit = nearest(instants, ms)
    if (hit !== null && hit !== read.ms) read.onRead(hit)
  }
  const step = (e: KeyboardEvent<SVGSVGElement>) => {
    clearTapped(e)
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (dir === 0) return
    e.preventDefault()
    const i = read.ms === null ? -1 : instants.indexOf(read.ms)
    const next = instants[i < 0 ? 0 : i + dir]
    if (next !== undefined) read.onRead(next)
  }
  const ticks = instants.filter((ms) => {
    const label = formatLocalHourShort(ms, utcOffsetSeconds)
    return label === '12a' || label === '6a' || label === '12p' || label === '6p'
  })
  const nowIn = nowMs >= axis.fromMs && nowMs <= axis.toMs
  return (
    <>
      {bare || read.ms === null || readout === undefined || readout.length === 0 ? null : (
        <ReadChip
          hour={formatLocalHour(read.ms, utcOffsetSeconds) ?? ''}
          items={readout}
          at={((axis.x(read.ms) - axis.left) / (axis.right - axis.left)) * 100}
          span={axis}
        />
      )}
    <svg
      viewBox={`0 0 ${LIQUID_W} ${height}`}
      role="img"
      aria-label={title}
      tabIndex={bare ? undefined : 0}
      onPointerDown={bare ? undefined : (e) => (markTapped(e), pick(e))}
      onBlur={bare ? undefined : clearTapped}
      onPointerMove={bare ? undefined : (e) => e.buttons > 0 || e.pointerType === 'mouse' ? pick(e) : undefined}
      onKeyDown={bare ? undefined : step}
      style={{ display: 'block', width: '100%', overflow: 'visible', touchAction: 'pan-y', cursor: bare ? 'default' : 'crosshair' }}
    >
      <StreamIn height={height}>{children}</StreamIn>
      {bare || read.ms === null ? null : (
        <line
          x1={axis.x(read.ms)}
          x2={axis.x(read.ms)}
          y1={top}
          y2={height - bottom}
          stroke="rgba(255,255,255,0.35)"
          data-read=""
        />
      )}
      {ticks.map((ms) => (
        <Label key={ms} x={axis.x(ms)} y={height - 2} anchor="middle">
          {formatLocalHourShort(ms, utcOffsetSeconds)}
        </Label>
      ))}
      {bare || !nowIn ? null : (
        <line
          x1={axis.x(nowMs)}
          x2={axis.x(nowMs)}
          y1={top}
          y2={height - bottom}
          stroke={colorsV2.brandInk}
          strokeDasharray="2 3"
        />
      )}
    </svg>
    </>
  )
}

/** The points of a series' value on a scale, one run per unbroken stretch. */
export function valueRuns(data: readonly SeriesDatum[], axis: TimeAxis, y: (v: number) => number): Pt[][] {
  return runsOf(data, (d) => d.value !== null).map((run) => run.map((d) => [axis.x(d.t), y(d.value ?? 0)] as const))
}

/** A key: a swatch drawn the way its mark is drawn, then its name. */
export type KeySwatch =
  | { kind: 'line'; background: string }
  | { kind: 'dash'; color: string }
  | { kind: 'block'; background: string; opacity?: number }
  | { kind: 'capsule'; color: string }

export function KeyRow({ keys }: { keys: readonly { label: string; swatch: KeySwatch }[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '6px', ...typeV2.keyRow }}>
      {keys.map(({ label, swatch }) => (
        <span key={label} style={{ whiteSpace: 'nowrap' }}>
          <i
            aria-hidden
            style={{
              display: 'inline-block',
              verticalAlign: 'middle',
              marginRight: '5px',
              borderRadius: '2px',
              width: swatch.kind === 'capsule' ? '8px' : '16px',
              height: swatch.kind === 'line' || swatch.kind === 'dash' ? '3px' : swatch.kind === 'capsule' ? '10px' : '8px',
              background:
                swatch.kind === 'dash'
                  ? `repeating-linear-gradient(90deg, ${swatch.color} 0 5px, transparent 5px 9px)`
                  : swatch.kind === 'capsule'
                    ? swatch.color
                    : swatch.background,
              opacity: swatch.kind === 'block' ? (swatch.opacity ?? 0.5) : swatch.kind === 'capsule' ? 0.5 : 1,
              ...(swatch.kind === 'capsule' ? { borderRadius: '4px' } : {}),
            }}
          />
          {label}
        </span>
      ))}
    </div>
  )
}

/** A glass card's heading and what its right side says. */
export function Sect({ title, aside }: { title: string; aside?: string | null }) {
  return (
    <h2
      style={{
        ...typeV2.sect,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: '8px',
        margin: '0 0 8px',
      }}
    >
      <span>{title}</span>
      {aside === undefined || aside === null ? null : (
        <em style={{ ...typeV2.sectAside, fontStyle: 'normal', textTransform: 'none', textAlign: 'right' }}>{aside}</em>
      )}
    </h2>
  )
}
