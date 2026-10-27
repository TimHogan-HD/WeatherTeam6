import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { colorsV2 } from '@weatherteam6/design/tokens'
import { EM_DASH, cToF, fToC, readingNow, type SkyCondition, type SkyHour } from '@weatherteam6/types'
import { formatTempDeg } from '../../lib/format.js'
import { chartHourAt, shortDay, type ChartHour, type ChartWindow } from '../../lib/overview.js'
import { SkyIcon } from '../Icons.js'
import { niceTicks } from '../../lib/chartTicks.js'
import { chartColorsV2, scoreRampColor } from './chartStyle.js'
import {
  Bead,
  DISPLAY,
  KeyRow,
  LIQUID_W,
  MONO,
  ReadChip,
  ScaleFigure,
  Tube,
  XGradient,
  clearTapped,
  markTapped,
  plotSpan,
  runsOf,
  scale,
  smoothPath,
  type Pt,
  type ReadoutItem,
} from './liquid.js'
import { StreamIn } from './StreamIn.js'

/**
 * The hours around now as one chart — six back, ten ahead, moving with the
 * clock (`chartWindow`) — drawn as the hybrid mockup's `todayChart` (owner,
 * 2026-10-19): the air temperature as a glowing line coloured by each hour's
 * score, the dew point dashed on the same °F scale (where the two meet, the
 * rock condenses), gridlines for that scale labelled at the right end, the
 * chance of rain as filled capsules underneath, the sky every three hours along the top, and the hour's score under its label. Tap
 * or drag to read an hour; a chip above the plot, Hourly's a size up, follows it.
 *
 * **Without scores the line is neutral ink**: a city, a Severe+ alert, alerts
 * still loading. A tinted line with no number beside it would be the score
 * leaking through the suppression rule.
 */

const H = 230
const TOP = 30
const PLOT_B = 150
const RAIN_TOP = PLOT_B + 8
const RAIN_H = 40
const SCORE_Y = H - 6
const HOUR_MS = 3_600_000

function clock(hour: number): string {
  if (hour === 0) return '12a'
  if (hour === 12) return '12p'
  return hour > 12 ? `${hour - 12}p` : `${hour}a`
}

/** `3 PM`, as the read-out names an hour. */
function clockLong(hour: number): string {
  const twelve = hour % 12 === 0 ? 12 : hour % 12
  return `${twelve} ${hour < 12 ? 'AM' : 'PM'}`
}

export function TodayChart({
  window: { fromMs, toMs, hours },
  nowMs,
  todayDate,
  sky,
}: {
  window: ChartWindow
  nowMs: number
  /** The location's today, so the midnight label can name the day it starts. */
  todayDate: string
  /** The sky words for daylight hours. A night hour has none, and draws none. */
  sky: readonly SkyHour[]
}) {
  const gradient = useId()
  const fade = useId()
  const capsule = useId()
  // The instant the reader picked, epoch ms. `null` follows now.
  const [picked, setPicked] = useState<number | null>(null)

  const temps = hours.flatMap((p) => [p.tempC, p.dewC]).filter((v): v is number => v !== null)
  // Gridlines in °F, as Daily's temperature chart has them (#399); the span is
  // the ticks', so nothing draws past the top line.
  const ticks = temps.length === 0 ? [] : niceTicks(cToF(Math.min(...temps)), cToF(Math.max(...temps)))
  const y = scale(fToC(ticks[0] ?? 32), fToC(ticks[ticks.length - 1] ?? 34), PLOT_B, TOP)
  // The figures stand at the right end: the window starts at now, so the left edge is under the now bead.
  const span = plotSpan({ left: 0, right: Math.max(0, ...ticks.map((v) => `${v}°`.length)) })
  const x = scale(fromMs, toMs, span.left, span.right)

  const scored = hours.some((p) => p.score !== null)
  const lineColor = (p: ChartHour) => (p.score === null ? chartColorsV2.air : scoreRampColor(p.score))

  // "Now" is `readingNow`'s hour, the one the hero prints, so the two cannot disagree.
  const nowCell = readingNow(hours, nowMs)
  const selected = picked === null ? (nowCell ?? chartHourAt(hours, nowMs)) : chartHourAt(hours, picked)
  const isNow = selected !== null && nowCell !== null && selected.ms === nowCell.ms
  // On the now column, not the clock: the window starts there, so 12:43 would fall left of it.
  const nowX = nowCell === null ? null : x(nowCell.ms)

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    const vx = ((e.clientX - box.left) / Math.max(1, box.width)) * LIQUID_W
    setPicked(fromMs + ((vx - span.left) / (span.right - span.left)) * (toMs - fromMs) + HOUR_MS / 2)
  }
  const step = (e: KeyboardEvent<SVGSVGElement>) => {
    clearTapped(e)
    const dir = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (dir === 0 || selected === null) return
    e.preventDefault()
    const next = hours[hours.indexOf(selected) + dir]
    if (next !== undefined) setPicked(next.ms)
  }

  const air = runsOf(
    hours.map((p) => ({ ...p, t: p.ms })),
    (p) => p.tempC !== null,
  ).map((run) => run.map((p) => [x(p.ms), y(p.tempC ?? 0)] as Pt))
  const dew = runsOf(
    hours.map((p) => ({ ...p, t: p.ms })),
    (p) => p.dewC !== null,
  ).map((run) => run.map((p) => [x(p.ms), y(p.dewC ?? 0)] as Pt))

  // A sky cell covers the hour before its stamp, so the glyph for 9–10 am sits over 9:30.
  const glyphs = sky.filter((h) => {
    const startHour = hours.find((p) => p.ms === Date.parse(h.valid_at) - HOUR_MS)?.hour
    return h.sky !== null && startHour !== undefined && startHour % 3 === 0
  })

  const labelled = hours.filter((p) => p.hour % 3 === 0 || (nowCell !== null && p.ms === nowCell.ms))
  const label = `Today: air temperature${scored ? ' coloured by score' : ''}, dew point dashed, chance of rain as filled capsules, from now to sixteen hours ahead`

  return (
    <div>
      <div style={{ margin: '0 -14px' }}>
        {selected === null ? null : (
          <ReadChip
            large
            hour={isNow ? 'Now' : clockLong(selected.hour)}
            items={readItems(selected, scored, lineColor(selected), dew.length > 0, hours.some((p) => p.chancePct !== null))}
            at={((x(selected.ms) - span.left) / (span.right - span.left)) * 100}
            span={span}
          />
        )}
        <svg
          viewBox={`0 0 ${LIQUID_W} ${H}`}
          role="img"
          aria-label={label}
          tabIndex={0}
          onPointerDown={(e) => (markTapped(e), pick(e))}
          onBlur={clearTapped}
          onPointerMove={(e) => (e.buttons > 0 || e.pointerType === 'mouse' ? pick(e) : undefined)}
          onPointerLeave={(e) => (e.pointerType === 'mouse' ? setPicked(null) : undefined)}
          onKeyDown={step}
          style={{ display: 'block', width: '100%', overflow: 'visible', touchAction: 'pan-y', cursor: 'crosshair' }}
        >
          <defs>
            <XGradient id={gradient} stops={hours.map((p) => ({ at: x(p.ms) / LIQUID_W, color: lineColor(p) }))} />
            <linearGradient id={capsule} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={colorsV2.rainCapsuleTop} />
              <stop offset="0.25" stopColor={colorsV2.rainMark} />
              <stop offset="1" stopColor={colorsV2.rainCapsuleBottom} />
            </linearGradient>
            <linearGradient id={fade} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={colorsV2.txt1} stopOpacity={0.22} />
              <stop offset="1" stopColor={colorsV2.txt1} stopOpacity={0} />
            </linearGradient>
          </defs>

          {nowX === null ? null : (
            <line x1={nowX} x2={nowX} y1={TOP - 8} y2={RAIN_TOP + RAIN_H} stroke={colorsV2.brandInk} strokeDasharray="2 3" />
          )}

          {ticks.map((v) => (
            <g key={`g${v}`}>
              <line x1={span.left} x2={span.right} y1={y(fToC(v))} y2={y(fToC(v))} stroke={chartColorsV2.grid} />
              <ScaleFigure side="end" y={y(fToC(v))}>{`${v}°`}</ScaleFigure>
            </g>
          ))}

          <StreamIn height={H}>
          {glyphs.map((h) => (
            <g key={h.valid_at} transform={`translate(${(x(Date.parse(h.valid_at) - HOUR_MS) - 9).toFixed(1)} 4)`}>
              <SkyIcon sky={h.sky as SkyCondition} size={18} />
            </g>
          ))}

          {air.map((pts, i) => {
            const first = pts[0]
            const last = pts[pts.length - 1]
            return first === undefined || last === undefined ? null : (
              <path key={i} d={`${smoothPath(pts)} L${last[0]} ${PLOT_B} L${first[0]} ${PLOT_B} Z`} fill={`url(#${fade})`} />
            )
          })}
          {dew.map((pts, i) => (
            <path key={i} d={smoothPath(pts)} fill="none" stroke={chartColorsV2.dewPoint} strokeWidth={2} strokeDasharray="5 4" opacity={0.9} />
          ))}
          {air.map((pts, i) => (
            <Tube key={i} d={smoothPath(pts)} stroke={`url(#${gradient})`} width={7} />
          ))}

          {hours.map((p) => {
            const w = 11
            const cx = x(p.ms)
            return (
              <g key={`c${p.valid_at}`}>
                <rect x={cx - w / 2} y={RAIN_TOP} width={w} height={RAIN_H} rx={5.5} fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.18)" />
                {p.chancePct === null ? null : (
                  <rect
                    x={cx - w / 2 + 1}
                    y={RAIN_TOP + RAIN_H - Math.max(1.5, (p.chancePct / 100) * RAIN_H)}
                    width={w - 2}
                    height={Math.max(1.5, (p.chancePct / 100) * RAIN_H)}
                    rx={4.5}
                    fill={`url(#${capsule})`}
                    data-chance=""
                  />
                )}
              </g>
            )
          })}

          {labelled.map((p) => (
            <text
              key={`l${p.valid_at}`}
              x={x(p.ms)}
              y={SCORE_Y - 14}
              fontFamily={MONO}
              fontSize={9}
              fill={colorsV2.txtMuted}
              textAnchor="middle"
            >
              {nowCell !== null && p.ms === nowCell.ms ? 'now' : p.hour === 0 ? shortDay(p.local_date, todayDate) : clock(p.hour)}
            </text>
          ))}
          {scored
            ? hours.map((p) => (
                <text
                  key={`s${p.valid_at}`}
                  x={x(p.ms)}
                  y={SCORE_Y}
                  fontFamily={DISPLAY}
                  fontWeight={700}
                  fontSize={selected !== null && p.ms === selected.ms ? 15 : 12}
                  fill={p.score === null ? colorsV2.txtMuted : scoreRampColor(p.score)}
                  textAnchor="middle"
                  opacity={p.ms < (nowCell?.ms ?? nowMs) ? 0.82 : 1}
                >
                  {p.score ?? EM_DASH}
                </text>
              ))
            : null}
          </StreamIn>

          {selected === null ? null : (
            <>
              <line x1={x(selected.ms)} x2={x(selected.ms)} y1={TOP - 8} y2={RAIN_TOP + RAIN_H} stroke="rgba(255,255,255,0.35)" />
              {selected.tempC === null ? null : <Bead x={x(selected.ms)} y={y(selected.tempC)} color={lineColor(selected)} />}
            </>
          )}
        </svg>
      </div>
      <KeyRow
        keys={[
          {
            label: scored ? 'air, coloured by score' : 'air',
            swatch: {
              kind: 'line',
              background: scored
                ? `linear-gradient(90deg, ${scoreRampColor(20)}, ${scoreRampColor(50)}, ${scoreRampColor(90)})`
                : chartColorsV2.air,
            },
          },
          ...(dew.length === 0 ? [] : [{ label: 'dew point', swatch: { kind: 'dash' as const, color: chartColorsV2.dewPoint } }]),
          ...(hours.some((p) => p.chancePct !== null)
            ? [{ label: 'chance of rain', swatch: { kind: 'capsule' as const, color: colorsV2.rainMark } }]
            : []),
        ]}
      />
    </div>
  )
}

/**
 * The read hour's figures for its chip: the score first, coloured as its
 * number under the axis, then air, dew point and chance of rain with their
 * series' dots, then Dryness. A series the chart does not draw is left out.
 */
function readItems(hour: ChartHour, scored: boolean, airColor: string, hasDew: boolean, hasRain: boolean): ReadoutItem[] {
  return [
    ...(scored
      ? [
          {
            label: '',
            value: hour.score === null ? EM_DASH : String(hour.score),
            valueColor: hour.score === null ? colorsV2.txtMuted : scoreRampColor(hour.score),
          },
        ]
      : []),
    { label: 'air', value: hour.tempC === null ? EM_DASH : `${Math.round(cToF(hour.tempC))}°`, color: airColor },
    ...(hasDew ? [{ label: 'dew', value: formatTempDeg(hour.dewC), color: chartColorsV2.dewPoint }] : []),
    ...(hasRain
      ? [{ label: 'rain', value: hour.chancePct === null ? EM_DASH : `${Math.round(hour.chancePct)}%`, color: colorsV2.rainMark }]
      : []),
    ...(hour.dryness === null ? [] : [{ label: '', value: hour.dryness }]),
  ]
}
