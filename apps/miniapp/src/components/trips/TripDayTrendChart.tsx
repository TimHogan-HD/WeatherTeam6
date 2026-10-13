import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import { cToF, mmToIn, type TripDayTrend } from '@weatherteam6/types'
import { typeV2 } from '../../theme/tokens.css.js'
import { chartColors, chartColorsV2, BAR_MIN_H, BAR_RADIUS, WHISKER_W } from '../charts/chartStyle.js'
import { extent, linearScale, niceTicks, padExtent } from '../charts/geometry.js'
import { dayChangeCaption, dayTrendMarks, shortDayLabel } from '../../lib/trips.js'

const VIEW_W = 420
const VIEW_H = 160
const PAD_L = 48
const PAD_R = 40
const PAD_T = 12
const PLOT_B = VIEW_H - 4
const RAIN_COLOR = chartColorsV2.rain
const HIGH_COLOR = chartColors.temperature
/** As on the whole-trip chart: a dry trip still reads as dry. */
const RAIN_MIN_TOP_IN = 0.1

function tickProps(fill: string) {
  return { fill, fontFamily: typeV2.axisTick.fontFamily, fontSize: typeV2.axisTick.fontSize }
}

/**
 * Each trip day's first recorded forecast against its latest: a dashed bar and
 * a solid one for the day's rain on the left axis, a hollow and a filled dot
 * for its high on the right. The day names and the change sit under the plot
 * as text, in columns aligned to it.
 *
 * **A day with one recording draws only the latest**, and its caption says
 * nothing moved only by saying nothing: one forecast has no change. A missing
 * figure is a missing mark, never a zero-height bar.
 */
export function TripDayTrendChart({ days }: { days: readonly TripDayTrend[] }) {
  const marks = dayTrendMarks(days)
  if (marks.length === 0) return null

  const colW = (VIEW_W - PAD_L - PAD_R) / marks.length
  const cx = (i: number) => PAD_L + colW * (i + 0.5)
  const barW = Math.max(6, Math.min(18, colW * 0.16))

  const rainsIn = marks.flatMap((m) => [m.firstRainMm, m.lastRainMm].flatMap((v) => (v === null ? [] : [mmToIn(v)])))
  const rainTop = Math.max(RAIN_MIN_TOP_IN, ...rainsIn)
  const rainTicks = niceTicks({ min: 0, max: rainTop }, 3)
  const yRain = linearScale({ min: 0, max: Math.max(rainTop, ...rainTicks) }, PLOT_B, PAD_T)
  const barTop = (mm: number) => Math.min(yRain(mmToIn(mm)), PLOT_B - BAR_MIN_H)

  const highsF = marks.flatMap((m) => [m.firstHighC, m.lastHighC].map((c) => (c === null ? null : cToF(c))))
  const highExtent = extent(highsF)
  const highDomain = highExtent === null ? null : padExtent(highExtent, 0.2, 10)
  const yHigh = highDomain === null ? null : linearScale(highDomain, PLOT_B, PAD_T)
  const highTicks = highDomain === null ? [] : niceTicks(highDomain, 3)

  const captions = marks.map((m) => (m.lastRainMm === null && m.lastHighC === null ? 'No forecast yet' : dayChangeCaption(m)))
  const label =
    'Each trip day, first forecast against the latest. ' +
    marks
      .map((m, i) => `${shortDayLabel(m.localDate)}: ${captions[i] ?? (m.single ? 'one forecast so far' : 'no change to compare')}.`)
      .join(' ')

  return (
    <div>
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
              {i === rainTicks.length - 1 ? `${v.toFixed(2)} in` : v.toFixed(2)}
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
        {marks.map((m, i) => {
          const x = cx(i)
          const firstX = x - barW * 1.6
          const lastX = x - barW * 0.4
          const dotX = x + barW * 1.4
          const firstF = m.firstHighC === null ? null : cToF(m.firstHighC)
          const lastF = m.lastHighC === null ? null : cToF(m.lastHighC)
          return (
            <g key={m.localDate}>
              {m.firstRainMm === null ? null : (
                <rect
                  x={firstX}
                  y={barTop(m.firstRainMm)}
                  width={barW}
                  height={PLOT_B - barTop(m.firstRainMm)}
                  rx={Math.min(BAR_RADIUS, barW / 2)}
                  fill="none"
                  stroke={RAIN_COLOR}
                  strokeWidth={1.2}
                  strokeDasharray="3 2"
                  data-mark="first-rain"
                />
              )}
              {m.lastRainMm === null ? null : (
                <rect
                  x={lastX}
                  y={barTop(m.lastRainMm)}
                  width={barW}
                  height={PLOT_B - barTop(m.lastRainMm)}
                  rx={Math.min(BAR_RADIUS, barW / 2)}
                  fill={RAIN_COLOR}
                  fillOpacity={0.9}
                  data-mark="last-rain"
                />
              )}
              {yHigh === null || firstF === null || lastF === null ? null : (
                <line
                  x1={dotX}
                  x2={dotX}
                  y1={yHigh(firstF)}
                  y2={yHigh(lastF)}
                  stroke={HIGH_COLOR}
                  strokeWidth={WHISKER_W}
                  strokeOpacity={0.6}
                />
              )}
              {yHigh === null || firstF === null ? null : (
                <circle
                  cx={dotX}
                  cy={yHigh(firstF)}
                  r={3.5}
                  fill={colorsV2.card}
                  stroke={HIGH_COLOR}
                  strokeWidth={1.5}
                  data-mark="first-high"
                />
              )}
              {yHigh === null || lastF === null ? null : (
                <circle
                  cx={dotX}
                  cy={yHigh(lastF)}
                  r={4.5}
                  fill={HIGH_COLOR}
                  stroke={colorsV2.card}
                  strokeWidth={1.5}
                  data-mark="last-high"
                />
              )}
            </g>
          )
        })}
      </svg>
      <div
        aria-hidden
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${marks.length}, 1fr)`,
          paddingLeft: `${(PAD_L / VIEW_W) * 100}%`,
          paddingRight: `${(PAD_R / VIEW_W) * 100}%`,
          marginTop: `${spacing.micro}px`,
        }}
      >
        {marks.map((m, i) => (
          <div key={m.localDate} style={{ textAlign: 'center', minWidth: 0 }}>
            <div style={{ ...typeV2.note, color: colorsV2.txt1 }}>{shortDayLabel(m.localDate)}</div>
            <div style={{ ...typeV2.axisTick, color: colorsV2.txt2 }}>{captions[i] ?? ' '}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
