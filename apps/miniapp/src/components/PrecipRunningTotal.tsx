import { useState } from 'react'
import { colors, colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import { formatPrecipIn, mmToIn, ROCK_LABELS, type RockLevel, type RockReading } from '@weatherteam6/types'
import { typeV2, withOpacity } from '../theme/tokens.css.js'
import { row } from '../theme/styles.js'
import { GRID_W, LINE_W, PAD_LEFT, PAD_RIGHT, VIEW_W } from './charts/chartStyle.js'
import { linePath, linearScale, niceTicks, type Point } from './charts/geometry.js'
import { clockOf, dayLabel, type PrecipDay, type PrecipEvent, type RunningPoint } from '../lib/precipHistory.js'

/**
 * The week's precipitation as a running total — concept 1 of the round-2
 * Figma mocks, added under the headline at the owner's request (2026-09-29).
 * Steep is when it poured and flat is when it was dry, so one line answers
 * "how much, and has it stopped". The days line up with the hour grid below.
 *
 * Storms that reached the real-rain line are labelled with their total where
 * they ended, and the flat run since the last real rain is bracketed. A hole
 * in the response is a dashed line, never a solid flat one: flat says dry.
 *
 * **The total is dotted and the rock is solid** (owner, 2026-09-29): a line
 * that only ever climbs read as rock that only ever got wetter. The total is
 * now a quiet dotted line with no fill, and under it a solid **Rock** strip
 * shows the drying model's state hour by hour — wet, drying, dry, in the tones
 * every other surface gives those words — on the same time axis, so the reader
 * sees Sunday's storm wet the rock and Monday dry it. Two strips, not two
 * lines on one plot: inches and a three-word state share no scale, and one plot
 * would need two y-axes. An hour with no reading is the bare track, never a
 * colour.
 */

const VIEW_H = 150
const PAD_TOP = 26
/** Room under the plot for the rock strip and then the day labels. */
const PAD_BOTTOM = 36
const STRIP_GAP = 6
const STRIP_H = 10
const SWATCH = 12

/** The tones every surface gives the rock's three words (`WeekCard`, `locationList`). */
const ROCK_COLOR: Record<RockLevel, string> = { dry: colors.good, drying: colors.fair, wet: colors.poor }
const ROCK_ORDER: readonly RockLevel[] = ['dry', 'drying', 'wet']
const TICKS = 3
/** A storm label or the dry bracket needs this much room, in user units, to be written. */
const LABEL_MIN_W = 56
/** At most this many storms are labelled — the largest — so labels never pile up. */
const MAX_STORM_LABELS = 3
const DOT_R = 3.5

export type PrecipRunningTotalProps = {
  days: readonly PrecipDay[]
  points: readonly RunningPoint[]
  spanHours: number
  /** Storms that re-wet the rock, newest first. */
  realEvents: readonly PrecipEvent[]
  /** Where the last real rain ended, in hours from the first midnight; null when none, or still falling. */
  flatFrom: number | null
  /** How long it has been flat, for the bracket's words. */
  flatHours: number | null
  /** The rock's state by local stamp; null draws no strip at all. */
  rock: ReadonlyMap<string, RockReading | null> | null
  today: string
}

export function PrecipRunningTotal({
  days,
  points,
  spanHours,
  realEvents,
  flatFrom,
  flatHours,
  rock,
  today,
}: PrecipRunningTotalProps) {
  const [hover, setHover] = useState<number | null>(null)
  const last = points[points.length - 1]
  if (last === undefined || spanHours === 0) return null

  const totalIn = mmToIn(last.totalMm)
  const ticks = niceTicks({ min: 0, max: Math.max(totalIn, 0.05) }, TICKS)
  const top = Math.max(totalIn, ticks[ticks.length - 1] ?? 0, 0.05)
  const x = linearScale({ min: 0, max: spanHours }, PAD_LEFT, VIEW_W - PAD_RIGHT)
  const y = linearScale({ min: 0, max: top }, VIEW_H - PAD_BOTTOM, PAD_TOP)
  const yMm = (mm: number) => y(mmToIn(mm))
  const base = VIEW_H - PAD_BOTTOM
  const stripTop = base + STRIP_GAP

  // The rock strip: one cell per stamped hour, covering the hour it closes,
  // inside the window only. Hours past the last precipitation stamp are the
  // forecast and are not drawn — this card is the past.
  const startMs = Date.parse(`${days[0]?.localDate ?? ''}T00:00Z`)
  const cells =
    rock === null
      ? []
      : [...rock]
          .map(([stamp, reading]) => ({ at: (Date.parse(`${stamp}Z`) - startMs) / 3_600_000, reading }))
          .filter((c) => c.reading !== null && c.at > 0 && c.at <= last.at)
  const rockAtPoint = (p: RunningPoint) => (rock === null ? undefined : (rock.get(p.validAtLocal) ?? null))

  // Solid runs of consecutive hours; a gap starts a new run and is bridged dashed.
  const runs: Point[][] = []
  const bridges: [Point, Point][] = []
  let prevTotal = 0
  for (const p of points) {
    const start = { x: x(p.at - 1), y: yMm(prevTotal) }
    const end = { x: x(p.at), y: yMm(p.totalMm) }
    const run = runs[runs.length - 1]
    if (run === undefined || p.gapBefore) {
      const tail = run?.[run.length - 1]
      if (tail !== undefined) bridges.push([tail, start])
      runs.push([start, end])
    } else {
      run.push(end)
    }
    prevTotal = p.totalMm
  }

  const labelled = [...realEvents]
    .sort((a, b) => b.totalMm - a.totalMm)
    .slice(0, MAX_STORM_LABELS)
    .map((e) => {
      const end = points.find((p) => p.validAtLocal === e.endLocal)
      return end === undefined ? null : { key: e.endLocal, x: x(end.at), y: yMm(end.totalMm), text: `+${formatPrecipIn(e.totalMm)}` }
    })
    .filter((l): l is NonNullable<typeof l> => l !== null)

  const flat =
    flatFrom === null || flatHours === null || flatHours < 1
      ? null
      : { x0: x(flatFrom), x1: x(last.at), y: yMm(last.totalMm) }

  const active = hover === null ? undefined : points[hover]
  const pct = (ux: number) => `${(ux / VIEW_W) * 100}%`
  const pctY = (uy: number) => `${(uy / VIEW_H) * 100}%`

  const hourAt = (clientX: number, rect: DOMRect): number | null => {
    const ux = ((clientX - rect.left) / rect.width) * VIEW_W
    let best: number | null = null
    let dist = Infinity
    points.forEach((p, i) => {
      const d = Math.abs(x(p.at) - ux)
      if (d < dist) {
        dist = d
        best = i
      }
    })
    return best
  }

  const summary =
    `Running total ${formatPrecipIn(last.totalMm)} over ${days.length} days` +
    (flatHours === null ? '' : `, flat for the last ${flatHours} hours`)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.listGap}px` }}>
    <div
      style={{ position: 'relative', width: '100%', touchAction: 'pan-y' }}
      onMouseMove={(e) => setHover(hourAt(e.clientX, e.currentTarget.getBoundingClientRect()))}
      onMouseLeave={() => setHover(null)}
      onTouchStart={(e) => {
        const t = e.touches[0]
        if (t !== undefined) setHover(hourAt(t.clientX, e.currentTarget.getBoundingClientRect()))
      }}
      onTouchMove={(e) => {
        const t = e.touches[0]
        if (t !== undefined) setHover(hourAt(t.clientX, e.currentTarget.getBoundingClientRect()))
      }}
    >
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width="100%" style={{ display: 'block', height: 'auto' }} role="img" aria-label={summary}>
        {ticks.map((t) => (
          <line key={t} x1={PAD_LEFT} x2={VIEW_W - PAD_RIGHT} y1={y(t)} y2={y(t)} stroke={colorsV2.grid} strokeWidth={GRID_W} vectorEffect="non-scaling-stroke" />
        ))}
        {days.slice(1).map((d, i) => (
          <line key={d.localDate} x1={x((i + 1) * 24)} x2={x((i + 1) * 24)} y1={PAD_TOP} y2={base} stroke={colorsV2.grid} strokeWidth={GRID_W} vectorEffect="non-scaling-stroke" />
        ))}
        {flat === null ? null : (
          <rect x={flat.x0} y={PAD_TOP} width={Math.max(0, flat.x1 - flat.x0)} height={base - PAD_TOP} fill={withOpacity(colorsV2.txt2, 0.05)} />
        )}
        {bridges.map(([a, b], i) => (
          <line key={`g${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={colorsV2.txtMuted} strokeWidth={GRID_W} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        ))}
        {runs.map((r, i) => (
          <path
            key={`l${i}`}
            d={linePath(r)}
            fill="none"
            stroke={colorsV2.precipStep3}
            strokeWidth={LINE_W}
            strokeDasharray="1 4"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <line x1={PAD_LEFT} x2={VIEW_W - PAD_RIGHT} y1={base} y2={base} stroke={colorsV2.line} strokeWidth={GRID_W} vectorEffect="non-scaling-stroke" />
        {rock === null ? null : (
          <>
            <rect x={PAD_LEFT} y={stripTop} width={x(last.at) - PAD_LEFT} height={STRIP_H} fill={colorsV2.grid} />
            {cells.map((c) =>
              c.reading === null ? null : (
                <rect
                  key={c.at}
                  x={x(c.at - 1)}
                  y={stripTop}
                  // A hair over one hour so adjacent cells of one state read as one solid run.
                  width={x(c.at) - x(c.at - 1) + 0.4}
                  height={STRIP_H}
                  fill={ROCK_COLOR[c.reading.level]}
                />
              ),
            )}
          </>
        )}
        {active === undefined ? null : (
          <>
            <line
              x1={x(active.at)}
              x2={x(active.at)}
              y1={PAD_TOP}
              y2={rock === null ? base : stripTop + STRIP_H}
              stroke={colorsV2.txt2}
              strokeWidth={GRID_W}
              vectorEffect="non-scaling-stroke"
            />
            <circle cx={x(active.at)} cy={yMm(active.totalMm)} r={DOT_R} fill={colorsV2.precipStep3} stroke={colorsV2.card} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>

      {rock === null ? null : (
        <span
          style={{
            ...typeV2.axisTick,
            position: 'absolute',
            left: 0,
            top: pctY(stripTop + STRIP_H / 2),
            transform: 'translateY(-50%)',
          }}
        >
          Rock
        </span>
      )}
      {ticks.map((t) => (
        <span key={t} style={{ ...typeV2.axisTick, position: 'absolute', left: 0, top: pctY(y(t)), transform: 'translateY(-50%)' }}>
          {t === 0 ? '0' : t.toFixed(2)}
        </span>
      ))}
      {days.map((d, i) => {
        const label = dayLabel(d.localDate, today)
        return (
          <span
            key={d.localDate}
            style={{
              ...typeV2.axisTick,
              position: 'absolute',
              left: pct(x(i * 24 + 12)),
              top: pctY(rock === null ? base + 4 : stripTop + STRIP_H + 4),
              transform: 'translateX(-50%)',
              color: label === 'Today' ? colorsV2.txt1 : colorsV2.txtMuted,
            }}
          >
            {label}
          </span>
        )
      })}
      {active !== undefined
        ? null
        : labelled.map((l) => (
            <span
              key={l.key}
              style={{
                ...typeV2.dayChipStrong,
                position: 'absolute',
                left: pct(Math.max(PAD_LEFT + LABEL_MIN_W, l.x)),
                top: pctY(l.y - 4),
                transform: 'translate(-100%, -100%)',
                whiteSpace: 'nowrap',
              }}
            >
              {l.text}
            </span>
          ))}
      {active !== undefined || flat === null || flat.x1 - flat.x0 < LABEL_MIN_W ? null : (
        <span
          style={{
            ...typeV2.legendSm,
            position: 'absolute',
            // Under the flat stretch, inside the shaded span, so it can never
            // collide with a storm's label, which sits above the line.
            left: pct((flat.x0 + flat.x1) / 2),
            top: pctY(Math.min(flat.y + 6, VIEW_H - PAD_BOTTOM - 14)),
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap',
            color: colorsV2.txt2,
          }}
        >
          no real rain · {flatHours} h
        </span>
      )}
      {active === undefined ? null : (
        <span
          style={{
            ...typeV2.dayChipStrong,
            position: 'absolute',
            top: 0,
            left: pct(Math.min(VIEW_W - 80, Math.max(PAD_LEFT + 40, x(active.at)))),
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap',
          }}
        >
          {dayLabel(active.validAtLocal, today)} {clockOf(active.validAtLocal)} · {formatPrecipIn(active.totalMm)} so far
          {(() => {
            const reading = rockAtPoint(active)
            if (reading === undefined) return null
            return ` · ${reading === null ? 'no rock reading' : ROCK_LABELS[reading.level]}`
          })()}
        </span>
      )}
    </div>
      {/* Outside the chart's box: its labels are placed as percentages of that box. */}
      <div style={{ ...row(spacing.chipGapMd), flexWrap: 'wrap' }}>
        <svg width="22" height="8" aria-hidden>
          <line x1="2" y1="4" x2="20" y2="4" stroke={colorsV2.precipStep3} strokeWidth={2} strokeDasharray="1 4" strokeLinecap="round" />
        </svg>
        <span style={typeV2.legendSm}>Rain so far</span>
        {rock === null
          ? null
          : ROCK_ORDER.map((level) => (
              <span key={level} style={{ ...row(spacing.chipGapMd), marginLeft: `${spacing.listGap}px` }}>
                <span
                  style={{
                    width: `${SWATCH}px`,
                    height: `${SWATCH}px`,
                    borderRadius: `${radius.tag}px`,
                    backgroundColor: ROCK_COLOR[level],
                  }}
                />
                <span style={typeV2.legendSm}>{ROCK_LABELS[level]}</span>
              </span>
            ))}
      </div>
    </div>
  )
}
