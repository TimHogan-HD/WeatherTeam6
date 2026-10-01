import { useEffect, useRef, useState, type RefObject } from 'react'
import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import { EM_DASH, cToF, formatHumidity, formatWindMph, readingNow } from '@weatherteam6/types'
import { typeV2, withOpacity } from '../../theme/tokens.css.js'
import { row, stack } from '../../theme/styles.js'
import { formatTempDeg } from '../../lib/format.js'
import { TODAY_CHART_FROM, TODAY_CHART_TO, chartHourAt, type ChartHour } from '../../lib/overview.js'
import { BAR_MIN_H, BAR_RADIUS, chartColorsV2, scoreRampColor } from './chartStyle.js'

/**
 * Today, 06:00 to 22:00, as one chart: the air temperature as a line coloured
 * by the hour's score on the continuous `scoreScale`, the dew point dashed on
 * the same °F scale (where the two lines meet, the rock condenses), and rain
 * chance as bars on their own 0-100% scale. Owner's pick, 2026-09-30.
 *
 * **Every layer is always on, and there is no wind.** The owner tried layer
 * switches and a wind line and dropped both: switches hid what the chart could
 * show, and wind needs a scale of its own that crossed everything else. Wind
 * is on the hero card.
 *
 * **Drawn at its real pixel size**, measured, rather than scaled from a fixed
 * viewBox: it takes whatever height the Overview can spare without stretching
 * its text.
 *
 * **Without scores the line is neutral ink**: a city, a Severe+
 * alert, alerts still loading. A tinted line with no number beside it would be
 * the score leaking through the suppression rule.
 */

const PAD_X = 16
const PAD_TOP = 22
/** Hour ticks, then the score under each. */
const PAD_BOTTOM = 36
/** The least the chart is drawn at; on a taller screen it grows. */
export const TODAY_CHART_MIN_H = 140
const DEFAULT_WIDTH = 360
/** Rain bars take the bottom of the plot. */
const RAIN_SHARE = 0.32

const LABEL_HOURS = [9, 12, 15, 18, 21] as const

function clock(hour: number): string {
  if (hour === 12) return '12p'
  return hour > 12 ? `${hour - 12}p` : `${hour}a`
}

/** `3pm`, `12pm`, `9am`. */
function clockLong(hour: number): string {
  return `${clock(hour)}m`
}

/** The location-clock hour of `nowMs`, fractional. */
function nowHour(nowMs: number, utcOffsetSeconds: number): number {
  const d = new Date(nowMs + utcOffsetSeconds * 1000)
  return d.getUTCHours() + d.getUTCMinutes() / 60
}

function useSize(): [RefObject<HTMLDivElement | null>, { w: number; h: number }] {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: DEFAULT_WIDTH, h: TODAY_CHART_MIN_H })
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

/** A swatch drawn the way its mark is drawn, so the readout doubles as the legend. */
function Swatch({ kind }: { kind: 'dew' | 'rain' }) {
  return kind === 'dew' ? (
    <span aria-hidden style={{ width: '12px', borderTop: `2px dashed ${chartColorsV2.dewPoint}` }} />
  ) : (
    <span aria-hidden style={{ width: '7px', height: '10px', borderRadius: '2px', background: withOpacity(chartColorsV2.rain, 0.5) }} />
  )
}

function Field({ label, value, color, swatch }: { label: string; value: string; color?: string; swatch?: 'dew' | 'rain' }) {
  return (
    <span style={{ ...row(spacing.tight), alignItems: 'baseline', whiteSpace: 'nowrap' }}>
      {swatch === undefined ? null : <span style={{ alignSelf: 'center', display: 'flex' }}><Swatch kind={swatch} /></span>}
      <span style={typeV2.legendSm}>{label}</span>
      <span style={{ ...typeV2.chartValue, fontSize: '13px', ...(color === undefined ? {} : { color }) }}>{value}</span>
    </span>
  )
}

/**
 * The picked hour's figures, above the chart. **It stays where it is**: a
 * floating chip over the plot would sit on the temperature labels, and the
 * readout is also the legend — the dashed and barred swatches beside the dew
 * point and rain chance are how those two marks are keyed.
 *
 * Wind is here as a figure and nowhere on the plot: drawn, it needed a scale
 * of its own and crossed everything else (owner, 2026-09-30).
 */
function Readout({ hour, isNow }: { hour: ChartHour; isNow: boolean }) {
  return (
    <div aria-live="polite" style={{ ...row(spacing.cellPad), flexWrap: 'wrap', rowGap: `${spacing.micro}px` }}>
      <span style={{ ...typeV2.rowTitle, fontSize: '13px', whiteSpace: 'nowrap' }}>{isNow ? 'Now' : clockLong(hour.hour)}</span>
      <Field label="Temp" value={formatTempDeg(hour.tempC)} />
      <Field label="Dew" value={formatTempDeg(hour.dewC)} swatch="dew" />
      <Field label="Rain" value={formatChance(hour.chancePct)} swatch="rain" />
      <Field label="Wind" value={formatWindMph(hour.windKmh)} />
      {hour.score === null ? null : <Field label="Score" value={String(hour.score)} color={scoreRampColor(hour.score)} />}
    </div>
  )
}

function formatChance(pct: number | null): string {
  return pct === null ? EM_DASH : `${Math.round(pct)}%`
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
  const [ref, { w, h }] = useSize()
  // The hour the reader picked, on the location's clock. `null` follows now.
  const [picked, setPicked] = useState<number | null>(null)

  const x = (hour: number) => PAD_X + ((hour - TODAY_CHART_FROM) / (TODAY_CHART_TO - TODAY_CHART_FROM)) * (w - 2 * PAD_X)
  const base = h - PAD_BOTTOM
  const plotH = base - PAD_TOP
  const rainH = plotH * RAIN_SHARE

  // One °F scale for air and dew point, padded so neither line touches an edge.
  const temps = hours.flatMap((p) => [p.tempC, p.dewC]).filter((v): v is number => v !== null)
  const lo = temps.length === 0 ? 0 : Math.min(...temps)
  const hi = temps.length === 0 ? 1 : Math.max(...temps)
  const span = Math.max(hi - lo, 4)
  const y = (c: number) => base - 8 - ((c - lo) / span) * (plotH - 18)

  const scored = hours.some((p) => p.score !== null)
  const lineColor = (p: ChartHour) => (p.score === null ? colorsV2.txt2 : scoreRampColor(p.score))

  const now = nowHour(nowMs, utcOffsetSeconds)
  const nowX = now >= TODAY_CHART_FROM && now <= TODAY_CHART_TO ? x(now) : null
  const pastX = now > TODAY_CHART_TO ? w - PAD_X : nowX

  // "Now" is `readingNow`'s hour, the one the hero above prints, so the two
  // cannot show different figures for the same moment.
  const nowCell = readingNow(hours, nowMs)
  const selected = picked === null ? (nowCell ?? chartHourAt(hours, now)) : chartHourAt(hours, picked)
  const isNow = selected !== null && nowCell !== null && selected.hour === nowCell.hour && nowX !== null
  /** The chart hour under a clientX, from the element's own box. */
  const hourAtClient = (clientX: number, box: DOMRect): number =>
    TODAY_CHART_FROM + ((clientX - box.left - PAD_X) / Math.max(1, box.width - 2 * PAD_X)) * (TODAY_CHART_TO - TODAY_CHART_FROM) + 0.5
  const step = (dir: -1 | 1) => {
    if (selected === null) return
    const i = hours.indexOf(selected)
    const next = hours[i + dir]
    if (next !== undefined) setPicked(next.hour)
  }

  const barW = Math.max(5, ((w - 2 * PAD_X) / (TODAY_CHART_TO - TODAY_CHART_FROM)) * 0.55)
  const barH = (pct: number) => Math.max(BAR_MIN_H, (pct / 100) * rainH)
  const peak = hours.reduce<ChartHour | null>(
    (best, p) => (p.chancePct !== null && (best === null || p.chancePct > (best.chancePct ?? -1)) ? p : best),
    null,
  )

  const segments = hours.slice(0, -1).flatMap((p, i) => {
    const q = hours[i + 1]
    if (q === undefined || p.tempC === null || q.tempC === null || q.hour - p.hour !== 1) return []
    return [{ key: p.valid_at, x1: x(p.hour), y1: y(p.tempC), x2: x(q.hour), y2: y(q.tempC), color: lineColor(p) }]
  })

  let dew = ''
  let open = false
  for (const p of hours) {
    if (p.dewC === null) {
      open = false
      continue
    }
    dew += `${open ? 'L' : 'M'}${x(p.hour).toFixed(1)} ${y(p.dewC).toFixed(1)} `
    open = true
  }

  const tempF = hours.map((p) => p.tempC).filter((v): v is number => v !== null).map((c) => Math.round(cToF(c)))
  const bestScore = hours.reduce<ChartHour | null>((b, p) => (p.score !== null && (b === null || p.score > (b.score ?? -1)) ? p : b), null)
  const label = [
    `Today ${clock(TODAY_CHART_FROM)} to ${clock(TODAY_CHART_TO)}`,
    tempF.length === 0 ? null : `temperature ${Math.min(...tempF)}° to ${Math.max(...tempF)}°F`,
    bestScore?.score == null ? null : `score highest ${bestScore.score} at ${clock(bestScore.hour)}`,
    peak?.chancePct != null ? `rain chance up to ${formatHumidity(peak.chancePct)}` : null,
  ]
    .filter((s) => s !== null)
    .join(', ')

  const mono = typeV2.axisTick.fontFamily

  return (
    <div style={{ ...stack(spacing.listGap), ...(fill ? { flex: '1 1 auto' } : {}) }}>
    {selected === null ? null : <Readout hour={selected} isNow={isNow} />}
    {/*
      The svg is out of flow: the box's height must come from the layout
      alone. In flow, the svg drawn at the last measured height held the box
      at that height, so the chart could grow but never shrink.

      **Tap or drag to pick an hour**, as on the Hourly charts: pointer events
      cover mouse and touch alike, `pan-y` keeps the page scrolling under a
      vertical swipe, and lifting a finger keeps the hour — that is how a phone
      reader finishes looking at it. A mouse leaving the chart returns to now.
      Arrow keys step through the hours for a keyboard.
    */}
    <div
      ref={ref}
      tabIndex={0}
      aria-label="Today by the hour. Left and right arrows pick an hour."
      onPointerDown={(e) => setPicked(hourAtClient(e.clientX, e.currentTarget.getBoundingClientRect()))}
      onPointerMove={(e) => setPicked(hourAtClient(e.clientX, e.currentTarget.getBoundingClientRect()))}
      onPointerLeave={(e) => {
        if (e.pointerType === 'mouse') setPicked(null)
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') {
          e.preventDefault()
          step(-1)
        } else if (e.key === 'ArrowRight') {
          e.preventDefault()
          step(1)
        }
      }}
      style={{
        position: 'relative',
        touchAction: 'pan-y',
        cursor: 'crosshair',
        height: fill ? undefined : `${TODAY_CHART_MIN_H}px`,
        minHeight: `${TODAY_CHART_MIN_H}px`,
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

        {hours.map((p) =>
          p.chancePct === null ? null : (
            <rect
              key={`r${p.valid_at}`}
              x={x(p.hour) - barW / 2}
              y={base - barH(p.chancePct)}
              width={barW}
              height={barH(p.chancePct)}
              rx={BAR_RADIUS}
              fill={withOpacity(chartColorsV2.rain, 0.5)}
            />
          ),
        )}

        <path d={dew} fill="none" stroke={chartColorsV2.dewPoint} strokeWidth={2} strokeDasharray="5 4" />

        {segments.map((s) => (
          <line key={s.key} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={s.color} strokeWidth={4} strokeLinecap="round" />
        ))}

        {/* Over the lines, with a halo in the card colour, so a line behind it cannot strike through it. */}
        {peak?.chancePct != null && peak.chancePct >= 10 ? (
          <text
            x={x(peak.hour)}
            y={base - barH(peak.chancePct) - 5}
            textAnchor="middle"
            fill={chartColorsV2.rain}
            stroke={colorsV2.card}
            strokeWidth={3}
            paintOrder="stroke"
            fontFamily={mono}
            fontSize={12}
          >
            {formatHumidity(peak.chancePct)}
          </text>
        ) : null}

        {/* The hours already gone sit behind a veil, as on the Hourly charts. */}
        {pastX === null || pastX <= PAD_X ? null : (
          <rect x={0} y={0} width={pastX} height={base + 1} fill={chartColorsV2.past} />
        )}
        {nowX === null ? null : (
          <>
            <line x1={nowX} y1={PAD_TOP - 6} x2={nowX} y2={base} stroke={chartColorsV2.now} strokeDasharray="2 3" />
            <text x={Math.min(nowX, w - PAD_X - 14)} y={PAD_TOP - 10} textAnchor="middle" fill={chartColorsV2.now} fontFamily={mono} fontSize={11}>
              now
            </text>
          </>
        )}

        {LABEL_HOURS.map((hr) => {
          const p = hours.find((q) => q.hour === hr)
          return (
            <g key={hr}>
              {p?.tempC == null ? null : (
                <text x={x(hr)} y={y(p.tempC) - 10} textAnchor="middle" fill={colorsV2.txt1} fontFamily={mono} fontSize={14} fontWeight={500}>
                  {Math.round(cToF(p.tempC))}°
                </text>
              )}
              <text x={x(hr)} y={base + 15} textAnchor="middle" fill={colorsV2.txtMuted} fontFamily={mono} fontSize={11}>
                {clock(hr)}
              </text>
              {p?.score == null ? null : (
                <text x={x(hr)} y={base + 31} textAnchor="middle" fill={scoreRampColor(p.score)} fontFamily={mono} fontSize={12} fontWeight={500}>
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
          <text x={PAD_X} y={base + 31} textAnchor="start" fill={colorsV2.txtMuted} fontFamily={mono} fontSize={11}>
            Score
          </text>
        ) : null}

        {/* The picked hour: a rule through it, and a dot on each line. */}
        {selected === null ? null : (
          <g>
            <line x1={x(selected.hour)} y1={PAD_TOP - 4} x2={x(selected.hour)} y2={base} stroke={withOpacity(colorsV2.txt1, 0.45)} strokeWidth={1.5} />
            {selected.dewC === null ? null : (
              <circle cx={x(selected.hour)} cy={y(selected.dewC)} r={3.5} fill={chartColorsV2.dewPoint} stroke={colorsV2.card} strokeWidth={2} />
            )}
            {selected.tempC === null ? null : (
              <circle cx={x(selected.hour)} cy={y(selected.tempC)} r={5} fill={lineColor(selected)} stroke={colorsV2.card} strokeWidth={2} />
            )}
          </g>
        )}
      </svg>
    </div>
    </div>
  )
}
