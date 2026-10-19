import { useId, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { colors, colorsV2, spacing } from '@weatherteam6/design/tokens'
import { EM_DASH, type HourlySeries } from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { cardV2, row, stack } from '../theme/styles.js'
import { scoreTone } from '../lib/locationList.js'
import { formatWeekday } from '../lib/forecast.js'
import { formatLocalHour, formatLocalHourShort } from '../lib/format.js'
import { scoreBarWindow, type BarHour } from '../lib/scoreBars.js'

/**
 * The Overview's score bars (hybrid look, owner 2026-10-19): the next 36 hours
 * as one bar each, the height and colour of the hour's score, each day's best
 * run underlined and named. Dragging, or the arrow keys, reads an hour in the
 * row underneath.
 *
 * Labels are HTML over the SVG, as on every chart here, so they keep their
 * type size whatever the viewport scales the plot to.
 */

const W = 335
const H = 140
const PAD_X = 4
const TOP = 24
const BASE = 114
const STUB_H = 5
const LABEL_EDGE_PCT = 16

const TONE_FILL = { good: colors.good, fair: colors.fair, poor: colors.poor } as const

const pctX = (v: number) => `${(v / W) * 100}%`
const pctY = (v: number) => `${(v / H) * 100}%`

function hourLabel(h: BarHour, first: BarHour, isFirst: boolean, offset: number): string {
  if (isFirst) return 'Now'
  const clock = formatLocalHour(h.ms, offset) ?? EM_DASH
  return h.local_date === first.local_date ? clock : `${formatWeekday(h.local_date)} ${clock}`
}

export function ScoreBars({
  series,
  nowMs,
  alerts,
}: {
  series: HourlySeries
  nowMs: number
  alerts: { severeAlertEvent: string | null; alertsPending: boolean }
}) {
  const [picked, setPicked] = useState(0)
  const gradientId = useId()
  const window = scoreBarWindow(series, nowMs, alerts)
  if (window === null) return null

  const { hours, best } = window
  const first = hours[0]!
  const n = hours.length
  const sel = Math.min(picked, n - 1)
  const slotOf = (ms: number) => (ms - first.ms) / 3_600_000
  // Slots are hours of clock time, not entries: a skipped hour keeps its gap.
  const slots = slotOf(hours[n - 1]!.ms) + 1
  const step = (W - 2 * PAD_X) / slots
  const bw = step * 0.7
  const offset = series.utc_offset_seconds
  const xOf = (slot: number) => PAD_X + slot * step

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    if (box.width === 0) return
    const slot = (((e.clientX - box.left) / box.width) * W - PAD_X) / step - 0.5
    let nearest = 0
    for (let i = 1; i < n; i++) {
      if (Math.abs(slotOf(hours[i]!.ms) - slot) < Math.abs(slotOf(hours[nearest]!.ms) - slot)) nearest = i
    }
    setPicked(nearest)
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const next =
      e.key === 'ArrowRight' ? sel + 1 : e.key === 'ArrowLeft' ? sel - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null
    if (next === null) return
    e.preventDefault()
    setPicked(Math.max(0, Math.min(n - 1, next)))
  }

  const h = hours[sel]!
  const label = hourLabel(h, first, sel === 0, offset)
  const spoken = [
    label,
    h.score === null ? 'no score' : `score ${h.score}`,
    h.dryness === null ? null : `Dryness: ${h.dryness}`,
    h.chancePct === null ? null : `Rain: ${h.chancePct}%`,
    h.withheldByAlert ? 'Alert: score withheld' : null,
  ]
    .filter((s): s is string => s !== null)
    .join(', ')

  // Every sixth hour on the location's clock, and the first; a weekday at midnight.
  const ticks = hours.flatMap((hour, i) => {
    const local = new Date(hour.ms + offset * 1000).getUTCHours()
    if (i !== 0 && (local % 6 !== 0 || i < 3)) return []
    const text = i === 0 ? 'now' : local === 0 ? formatWeekday(hour.local_date) : (formatLocalHourShort(hour.ms, offset) ?? '')
    return [{ i, text, midnight: i !== 0 && local === 0 }]
  })

  return (
    <section aria-label="Score, next 36 hours" style={{ ...cardV2, ...stack(spacing.listGapSm) }}>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Score by hour, next 36 hours"
        aria-valuemin={0}
        aria-valuemax={n - 1}
        aria-valuenow={sel}
        aria-valuetext={spoken}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          pick(e)
        }}
        onPointerMove={(e) => {
          if (e.buttons !== 0 || e.pointerType !== 'mouse') pick(e)
        }}
        onKeyDown={onKey}
        style={{ position: 'relative', touchAction: 'pan-y', cursor: 'pointer', outlineOffset: '4px' }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', height: 'auto' }} aria-hidden>
          <defs>
            {(['good', 'fair', 'poor'] as const).map((tone) => (
              <linearGradient key={tone} id={`${gradientId}-${tone}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={TONE_FILL[tone]} />
                <stop offset="1" stopColor={TONE_FILL[tone]} stopOpacity={0.45} />
              </linearGradient>
            ))}
          </defs>
          <line x1={PAD_X} x2={W - PAD_X} y1={BASE + 0.5} y2={BASE + 0.5} stroke={colorsV2.line} />
          {ticks
            .filter((t) => t.midnight)
            .map((t) => (
              <line
                key={`day-${t.i}`}
                x1={xOf(slotOf(hours[t.i]!.ms))}
                x2={xOf(slotOf(hours[t.i]!.ms))}
                y1={TOP - 4}
                y2={BASE}
                stroke={colorsV2.line}
                strokeDasharray="2 3"
              />
            ))}
          {best.map((run) => (
            <rect
              key={run.local_date}
              x={xOf(slotOf(run.fromMs))}
              y={BASE + 5}
              width={(slotOf(run.toMs) - slotOf(run.fromMs) + 1) * step}
              height={3}
              rx={1.5}
              fill={TONE_FILL[scoreTone(run.score)]}
            />
          ))}
          <line
            x1={xOf(slotOf(hours[sel]!.ms)) + step / 2}
            x2={xOf(slotOf(hours[sel]!.ms)) + step / 2}
            y1={TOP - 2}
            y2={BASE}
            stroke={colorsV2.txt2}
            strokeOpacity={0.35}
          />
          {hours.map((hour, i) => {
            const x = xOf(slotOf(hour.ms)) + (step - bw) / 2
            const height = hour.score === null ? STUB_H : Math.max(STUB_H, (hour.score / 100) * (BASE - TOP))
            const r = Math.min(bw / 2, height)
            const fill = hour.score === null ? colorsV2.txtMuted : `url(#${gradientId}-${scoreTone(hour.score)})`
            return (
              <g key={hour.ms} opacity={i === sel ? 1 : 0.78}>
                <path
                  d={`M${x} ${BASE}V${BASE - height + r}a${r} ${r} 0 0 1 ${bw} 0V${BASE}Z`}
                  fill={fill}
                  fillOpacity={hour.score === null ? 0.5 : 1}
                />
                {hour.rainLikely ? (
                  <circle cx={x + bw / 2} cy={BASE - height - 6} r={2.4} fill={colorsV2.rain} />
                ) : null}
              </g>
            )
          })}
        </svg>

        {best.map((run) => {
          const mid = xOf(slotOf(run.fromMs)) + ((slotOf(run.toMs) - slotOf(run.fromMs) + 1) * step) / 2
          const left = Math.min(100 - LABEL_EDGE_PCT, Math.max(LABEL_EDGE_PCT, (mid / W) * 100))
          const end = run.toMs + 3_600_000
          return (
            <span
              key={run.local_date}
              style={{
                ...typeV2.legend,
                position: 'absolute',
                left: `${left}%`,
                top: 0,
                transform: 'translateX(-50%)',
                whiteSpace: 'nowrap',
                pointerEvents: 'none',
              }}
            >
              Best {formatLocalHourShort(run.fromMs, offset)}–{formatLocalHourShort(end, offset)}{' '}
              <span style={{ fontWeight: 700, color: TONE_FILL[scoreTone(run.score)] }}>{run.score}</span>
            </span>
          )
        })}

        {ticks.map((t) => (
          <span
            key={`tick-${t.i}`}
            style={{
              ...typeV2.axisTick,
              position: 'absolute',
              left: pctX(xOf(slotOf(hours[t.i]!.ms)) + step / 2),
              top: pctY(BASE + 12),
              transform: 'translateX(-50%)',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
              ...(t.i === 0 ? { color: colorsV2.brandInk } : {}),
            }}
          >
            {t.text}
          </span>
        ))}
      </div>

      <div aria-hidden style={{ ...row(spacing.cellPad), alignItems: 'baseline', flexWrap: 'wrap', minHeight: '28px' }}>
        <span
          style={{
            ...typeV2.tileFigure,
            fontVariantNumeric: 'tabular-nums',
            color: h.score === null ? colorsV2.txtMuted : TONE_FILL[scoreTone(h.score)],
          }}
        >
          {h.score ?? EM_DASH}
        </span>
        <span style={{ ...typeV2.note, color: colorsV2.txt2 }}>{label}</span>
        {h.dryness === null ? null : <span style={{ ...typeV2.note, color: colorsV2.txt2 }}>Dryness: {h.dryness}</span>}
        {h.chancePct === null ? null : (
          <span style={{ ...typeV2.note, color: colorsV2.rain }}>Rain: {h.chancePct}%</span>
        )}
        {h.withheldByAlert ? <span style={{ ...typeV2.note, color: colors.poor }}>Alert: score withheld</span> : null}
      </div>
    </section>
  )
}
