import { colorsV2 } from '@weatherteam6/design/tokens'
import { cToF, mmToIn, type TripTrendPoint } from '@weatherteam6/types'
import { typeV2 } from '../../theme/tokens.css.js'
import { chartColors, chartColorsV2, BAR_MIN_H, BAR_RADIUS, LINE_W, WHISKER_W } from '../charts/chartStyle.js'
import { extent, linearScale, linePath, niceTicks, padExtent } from '../charts/geometry.js'
import { dateLabel, deviceToday, trendMarks } from '../../lib/trips.js'

const VIEW_W = 420
const VIEW_H = 190
const PAD_L = 48
const PAD_R = 40
const PAD_T = 12
const PAD_B = 22
const PLOT_B = VIEW_H - PAD_B
const RAIN_COLOR = chartColorsV2.rain
const HIGH_COLOR = chartColors.temperature

/** An axis label inside the SVG, which takes `fill` rather than `color`. */
function tickProps(fill: string) {
  return { fill, fontFamily: typeV2.axisTick.fontFamily, fontSize: typeV2.axisTick.fontSize }
}

/** The rain axis never shrinks below a tenth of an inch, so a dry trip still reads as dry. */
const RAIN_MIN_TOP_IN = 0.1

/**
 * The forecast trend: the trip's rain total at each recording, as a bar with
 * its range as a whisker, on the left axis in inches; the warmest high as a
 * line on the right axis in °F. Each axis wears its series' colour. x is when
 * the recording was made.
 *
 * **A total over part of the trip is a hollow bar**: it jumps when the next day
 * enters the horizon, and filled it would read as the forecast getting wetter.
 */
export function TripTrendChart({ points }: { points: readonly TripTrendPoint[] }) {
  const marks = trendMarks(points)
  const first = marks[0]
  const last = marks[marks.length - 1]
  if (first === undefined || last === undefined) return null

  const x = linearScale(
    first.ms === last.ms ? { min: first.ms - 1, max: first.ms + 1 } : { min: first.ms, max: last.ms },
    PAD_L + 14,
    VIEW_W - PAD_R - 14,
  )

  const rainTop = Math.max(
    RAIN_MIN_TOP_IN,
    ...marks.flatMap((m) => [m.p90Mm, m.rainMm].flatMap((v) => (v === null ? [] : [mmToIn(v)]))),
  )
  const rainTicks = niceTicks({ min: 0, max: rainTop }, 3)
  const rainMax = Math.max(rainTop, ...rainTicks)
  const yRain = linearScale({ min: 0, max: rainMax }, PLOT_B, PAD_T)

  const highsF = marks.map((m) => (m.highC === null ? null : cToF(m.highC)))
  const highExtent = extent(highsF)
  const highDomain = highExtent === null ? null : padExtent(highExtent, 0.2, 10)
  const yHigh = highDomain === null ? null : linearScale(highDomain, PLOT_B, PAD_T)
  const highTicks = highDomain === null ? [] : niceTicks(highDomain, 3)

  const barW = Math.max(3, Math.min(14, ((VIEW_W - PAD_L - PAD_R) / marks.length) * 0.45))
  const highPoints = yHigh === null
    ? []
    : marks.flatMap((m, i) => {
        const f = highsF[i]
        return f === null || f === undefined ? [] : [{ x: x(m.ms), y: yHigh(f) }]
      })

  const lastRain = last.rainMm === null ? null : mmToIn(last.rainMm)
  const firstRain = first.rainMm === null ? null : mmToIn(first.rainMm)
  const lastHigh = highsF[highsF.length - 1] ?? null
  const label =
    `Forecast trend over ${marks.length} ${marks.length === 1 ? 'recording' : 'recordings'}.` +
    (firstRain !== null && lastRain !== null
      ? ` Trip rain ${firstRain.toFixed(2)} inches, now ${lastRain.toFixed(2)}.`
      : '') +
    (lastHigh !== null ? ` Warmest high now ${Math.round(lastHigh)} degrees.` : '') +
    (marks.some((m) => m.partial) ? ' Hollow bars cover part of the trip.' : '')

  const xLabels =
    marks.length === 1 || deviceToday(new Date(first.ms)) === deviceToday(new Date(last.ms)) ? [last] : [first, last]

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width="100%" role="img" aria-label={label} style={{ display: 'block' }}>
      {rainTicks.map((v, i) => (
        <g key={`r${v}`}>
          <line
            x1={PAD_L}
            x2={VIEW_W - PAD_R}
            y1={yRain(v)}
            y2={yRain(v)}
            stroke={colorsV2.grid}
            strokeDasharray={i === 0 ? undefined : '2 4'}
          />
          <text x={PAD_L - 6} y={yRain(v) + 3} textAnchor="end" {...tickProps(RAIN_COLOR)}>
            {i === rainTicks.length - 1 ? `${v.toFixed(1)} in` : v.toFixed(1)}
          </text>
        </g>
      ))}
      {yHigh === null
        ? null
        : highTicks.map((v, i) => (
            <text key={`h${v}`} x={VIEW_W - PAD_R + 6} y={yHigh(v) + 3} {...tickProps(HIGH_COLOR)}>
              {i === highTicks.length - 1 ? `${v}°F` : `${v}°`}
            </text>
          ))}
      {marks.map((m) => {
        if (m.rainMm === null) return null
        const top = Math.min(yRain(mmToIn(m.rainMm)), PLOT_B - BAR_MIN_H)
        const cx = x(m.ms)
        return (
          <g key={m.ms}>
            <rect
              x={cx - barW / 2}
              y={top}
              width={barW}
              height={PLOT_B - top}
              rx={Math.min(BAR_RADIUS, barW / 2)}
              fill={m.partial ? 'none' : RAIN_COLOR}
              fillOpacity={m.partial ? undefined : m === last ? 0.9 : 0.55}
              stroke={m.partial ? RAIN_COLOR : 'none'}
              strokeWidth={m.partial ? 1.2 : undefined}
              data-partial={m.partial ? 'true' : undefined}
            />
            {m.p10Mm === null || m.p90Mm === null ? null : (
              <>
                <line
                  x1={cx}
                  x2={cx}
                  y1={yRain(mmToIn(m.p90Mm))}
                  y2={yRain(mmToIn(m.p10Mm))}
                  stroke={RAIN_COLOR}
                  strokeWidth={WHISKER_W}
                  strokeOpacity={0.8}
                />
                <line
                  x1={cx - barW / 2}
                  x2={cx + barW / 2}
                  y1={yRain(mmToIn(m.p90Mm))}
                  y2={yRain(mmToIn(m.p90Mm))}
                  stroke={RAIN_COLOR}
                  strokeWidth={WHISKER_W}
                  strokeOpacity={0.8}
                />
              </>
            )}
          </g>
        )
      })}
      {highPoints.length > 1 ? (
        <path d={linePath(highPoints)} fill="none" stroke={HIGH_COLOR} strokeWidth={LINE_W} strokeLinejoin="round" />
      ) : null}
      {highPoints.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === highPoints.length - 1 ? 4.5 : 3}
          fill={HIGH_COLOR}
          stroke={colorsV2.card}
          strokeWidth={1.5}
        />
      ))}
      {xLabels.map((m, i) => (
        <text
          key={`x${m.ms}`}
          x={x(m.ms)}
          y={VIEW_H - 6}
          textAnchor={marks.length === 1 ? 'middle' : xLabels.length === 2 && i === 0 ? 'start' : 'end'}
          {...tickProps(colorsV2.txtMuted)}
        >
          {dateLabel(deviceToday(new Date(m.ms)))}
        </text>
      ))}
    </svg>
  )
}
