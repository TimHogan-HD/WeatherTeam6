import { useEffect, useRef, useState, type RefObject } from 'react'
import { colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import { cToF, formatHumidity } from '@weatherteam6/types'
import { typeV2, withOpacity } from '../../theme/tokens.css.js'
import { bareButton, row } from '../../theme/styles.js'
import { TODAY_CHART_FROM, TODAY_CHART_TO, type ChartHour } from '../../lib/overview.js'
import { BAR_MIN_H, BAR_RADIUS, chartColorsV2, scoreRampColor } from './chartStyle.js'

/**
 * Today, 06:00 to 22:00, as one chart: the air temperature as a line coloured
 * by the hour's score on the continuous `scoreScale`, and three layers the
 * reader switches: dew point (dashed, on the same °F scale, so the gap between
 * the two lines is the margin before the rock condenses), rain chance (bars on
 * their own 0-100% scale) and wind (a grey line on its own scale, off by
 * default). Owner's pick, 2026-09-30: mockup D+.
 *
 * **Drawn at its real pixel size**, measured, rather than scaled from a fixed
 * viewBox: it takes whatever height the Overview can spare without stretching
 * its text, and a phone and a tall phone both get legible labels.
 *
 * **No layer labels itself inside the plot** except the rain peak; the
 * switches above the chart name each line, and the score row under the hours
 * says what the line's colour is. An inline wind label collided with the rain
 * figure in the mockup, and labels that move with the data will always find
 * something to collide with.
 *
 * **Without scores the line is neutral ink**: a city, the preview, a Severe+
 * alert, alerts still loading. A tinted line with no number beside it would be
 * the score leaking through the suppression rule.
 */

const PAD_X = 14
const PAD_TOP = 18
/** Hour ticks, then the score under each. */
const PAD_BOTTOM = 31
const DEFAULT_SIZE = { w: 360, h: 112 }
/** Rain bars and the wind line share the bottom of the plot. */
const LOWER_SHARE = 0.34

const LABEL_HOURS = [9, 12, 15, 18, 21] as const

type Layers = { dew: boolean; rain: boolean; wind: boolean }

function clock(hour: number): string {
  if (hour === 12) return '12p'
  return hour > 12 ? `${hour - 12}p` : `${hour}a`
}

/** The location-clock hour of `nowMs`, fractional. */
function nowHour(nowMs: number, utcOffsetSeconds: number): number {
  const d = new Date(nowMs + utcOffsetSeconds * 1000)
  return d.getUTCHours() + d.getUTCMinutes() / 60
}

function useSize(): [RefObject<HTMLDivElement | null>, { w: number; h: number }] {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState(DEFAULT_SIZE)
  useEffect(() => {
    const el = ref.current
    if (el === null) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setSize({ w: Math.round(r.width), h: Math.round(r.height) })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, size]
}

export function TodayChart({
  hours,
  nowMs,
  utcOffsetSeconds,
  fill,
}: {
  hours: readonly ChartHour[]
  nowMs: number
  utcOffsetSeconds: number
  /** Grow to take the Overview's spare height. */
  fill: boolean
}) {
  const [layers, setLayers] = useState<Layers>({ dew: true, rain: true, wind: false })
  const [ref, { w, h }] = useSize()

  const x = (hour: number) => PAD_X + ((hour - TODAY_CHART_FROM) / (TODAY_CHART_TO - TODAY_CHART_FROM)) * (w - 2 * PAD_X)
  const base = h - PAD_BOTTOM
  const plotH = base - PAD_TOP
  const lowerH = plotH * LOWER_SHARE

  // One °F scale for air and dew point, padded so neither line touches an edge.
  const temps = hours.flatMap((p) => [p.tempC, layers.dew ? p.dewC : null]).filter((v): v is number => v !== null)
  const lo = temps.length === 0 ? 0 : Math.min(...temps)
  const hi = temps.length === 0 ? 1 : Math.max(...temps)
  const span = Math.max(hi - lo, 4)
  const y = (c: number) => base - 6 - ((c - lo) / span) * (plotH - 14)

  const windMax = Math.max(32, ...hours.map((p) => p.windKmh ?? 0))
  const wy = (kmh: number) => base - (kmh / windMax) * lowerH

  const scored = hours.some((p) => p.score !== null)
  const lineColor = (p: ChartHour) => (p.score === null ? colorsV2.txt2 : scoreRampColor(p.score))

  const now = nowHour(nowMs, utcOffsetSeconds)
  const nowOnChart = now >= TODAY_CHART_FROM && now <= TODAY_CHART_TO
  const nowX = nowOnChart ? x(now) : null
  const pastX = now > TODAY_CHART_TO ? w - PAD_X : nowX

  const barW = Math.max(4, ((w - 2 * PAD_X) / (TODAY_CHART_TO - TODAY_CHART_FROM)) * 0.55)
  const peak = hours.reduce<ChartHour | null>(
    (best, p) => (p.chancePct !== null && (best === null || p.chancePct > (best.chancePct ?? -1)) ? p : best),
    null,
  )

  const segments = hours.slice(0, -1).flatMap((p, i) => {
    const q = hours[i + 1]
    if (q === undefined || p.tempC === null || q.tempC === null || q.hour - p.hour !== 1) return []
    return [{ key: p.valid_at, x1: x(p.hour), y1: y(p.tempC), x2: x(q.hour), y2: y(q.tempC), color: lineColor(p) }]
  })

  const path = (pick: (p: ChartHour) => number | null, map: (v: number) => number) => {
    let d = ''
    let open = false
    for (const p of hours) {
      const v = pick(p)
      if (v === null) {
        open = false
        continue
      }
      d += `${open ? 'L' : 'M'}${x(p.hour).toFixed(1)} ${map(v).toFixed(1)} `
      open = true
    }
    return d
  }

  const tempF = hours.map((p) => p.tempC).filter((v): v is number => v !== null).map((c) => Math.round(cToF(c)))
  const bestScore = hours.reduce<ChartHour | null>((b, p) => (p.score !== null && (b === null || p.score > (b.score ?? -1)) ? p : b), null)
  const label = [
    `Today ${clock(TODAY_CHART_FROM)} to ${clock(TODAY_CHART_TO)}`,
    tempF.length === 0 ? null : `temperature ${Math.min(...tempF)}° to ${Math.max(...tempF)}°F`,
    bestScore?.score == null ? null : `score highest ${bestScore.score} at ${clock(bestScore.hour)}`,
    layers.rain && peak?.chancePct != null ? `rain chance up to ${formatHumidity(peak.chancePct)}` : null,
  ]
    .filter((s) => s !== null)
    .join(', ')

  const tick = { fontFamily: typeV2.axisTick.fontFamily, fontSize: typeV2.axisTick.fontSize }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: `${spacing.listGap}px`, ...(fill ? { flex: '1 1 auto' } : {}) }}>
      {/* Above the chart, where a reader looks first; the owner missed them below it. */}
      <div style={{ ...row(spacing.listGapSm), flexWrap: 'wrap' }} role="group" aria-label="Chart layers">
        <LayerSwitch label="Dew point" on={layers.dew} swatch={chartColorsV2.dewPoint} dashed onToggle={() => setLayers((l) => ({ ...l, dew: !l.dew }))} />
        <LayerSwitch label="Rain chance" on={layers.rain} swatch={withOpacity(chartColorsV2.rain, 0.45)} onToggle={() => setLayers((l) => ({ ...l, rain: !l.rain }))} />
        <LayerSwitch label="Wind" on={layers.wind} swatch={chartColorsV2.wind} onToggle={() => setLayers((l) => ({ ...l, wind: !l.wind }))} />
      </div>
      {/*
        The svg is taken out of flow: the box's height must come from the
        layout alone. In flow, the svg drawn at the last measured height held
        the box at that height, so the chart could grow but never shrink.
      */}
      <div
        ref={ref}
        style={{
          position: 'relative',
          height: fill ? undefined : `${DEFAULT_SIZE.h}px`,
          minHeight: `${DEFAULT_SIZE.h}px`,
          ...(fill ? { flex: '1 1 auto' } : {}),
        }}
      >
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          role="img"
          aria-label={label}
          style={{ display: 'block', position: 'absolute', inset: 0 }}
        >
          <line x1={PAD_X} y1={base} x2={w - PAD_X} y2={base} stroke={chartColorsV2.grid} />

          {!layers.rain
            ? null
            : hours.map((p) =>
                p.chancePct === null ? null : (
                  <rect
                    key={`r${p.valid_at}`}
                    x={x(p.hour) - barW / 2}
                    y={base - Math.max(BAR_MIN_H, (p.chancePct / 100) * lowerH)}
                    width={barW}
                    height={Math.max(BAR_MIN_H, (p.chancePct / 100) * lowerH)}
                    rx={BAR_RADIUS}
                    fill={withOpacity(chartColorsV2.rain, 0.45)}
                  />
                ),
              )}
          {layers.wind ? (
            <path d={path((p) => p.windKmh, wy)} fill="none" stroke={chartColorsV2.wind} strokeWidth={1.5} />
          ) : null}
          {layers.dew ? (
            <path d={path((p) => p.dewC, y)} fill="none" stroke={chartColorsV2.dewPoint} strokeWidth={1.5} strokeDasharray="4 3" />
          ) : null}

          {segments.map((s) => (
            <line key={s.key} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.color} strokeWidth={3} strokeLinecap="round" />
          ))}

          {/*
            Over the lines, with a halo in the card colour, so a wind or dew
            line passing behind the figure cannot strike through it.
          */}
          {layers.rain && peak?.chancePct != null && peak.chancePct >= 10 ? (
            <text
              x={x(peak.hour)}
              y={base - (peak.chancePct / 100) * lowerH - 4}
              textAnchor="middle"
              fill={chartColorsV2.rain}
              stroke={colorsV2.card}
              strokeWidth={3}
              paintOrder="stroke"
              {...tick}
            >
              {formatHumidity(peak.chancePct)}
            </text>
          ) : null}

          {/* The hours already gone sit behind a veil, as on the Hourly charts. */}
          {pastX === null || pastX <= PAD_X ? null : (
            <rect x={0} y={0} width={pastX} height={base + 1} fill={chartColorsV2.past} />
          )}
          {nowX === null ? null : (
            <line x1={nowX} y1={PAD_TOP - 8} x2={nowX} y2={base} stroke={chartColorsV2.now} strokeDasharray="2 3" />
          )}

          {LABEL_HOURS.map((hr) => {
            const p = hours.find((q) => q.hour === hr)
            return (
              <g key={hr}>
                {p?.tempC == null ? null : (
                  <text x={x(hr)} y={y(p.tempC) - 8} textAnchor="middle" fill={colorsV2.txt1} fontFamily={tick.fontFamily} fontSize={11}>
                    {Math.round(cToF(p.tempC))}°
                  </text>
                )}
                <text x={x(hr)} y={base + 13} textAnchor="middle" fill={colorsV2.txtMuted} {...tick}>
                  {clock(hr)}
                </text>
                {p?.score == null ? null : (
                  <text x={x(hr)} y={base + 27} textAnchor="middle" fill={scoreRampColor(p.score)} {...tick}>
                    {p.score}
                  </text>
                )}
              </g>
            )
          })}
          {/*
            The row that says what the line's colour is: the scores, in the
            line's own colours, named once at its start. No legend sentence.
          */}
          {scored ? (
            <text x={PAD_X} y={base + 27} textAnchor="start" fill={colorsV2.txtMuted} {...tick}>
              Score
            </text>
          ) : null}
          {nowX === null ? null : (
            <text x={Math.min(nowX, w - PAD_X - 12)} y={PAD_TOP - 10} textAnchor="middle" fill={chartColorsV2.now} {...tick}>
              now
            </text>
          )}
        </svg>
      </div>
    </div>
  )
}

function LayerSwitch({
  label,
  on,
  swatch,
  dashed = false,
  onToggle,
}: {
  label: string
  on: boolean
  swatch: string
  dashed?: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      style={{
        ...bareButton,
        ...row(spacing.tight),
        ...typeV2.legendSm,
        width: 'auto',
        color: on ? colorsV2.txt1 : colorsV2.txtMuted,
        backgroundColor: on ? colorsV2.raised : 'transparent',
        border: `1px solid ${colorsV2.line}`,
        borderRadius: `${radius.full}px`,
        padding: `${spacing.tight}px ${spacing.cellPad}px`,
      }}
    >
      <span
        aria-hidden
        style={{
          width: '14px',
          height: dashed ? '0' : '6px',
          borderTop: dashed ? `2px dashed ${swatch}` : undefined,
          background: dashed ? undefined : swatch,
          borderRadius: dashed ? 0 : '2px',
        }}
      />
      {label}
    </button>
  )
}
