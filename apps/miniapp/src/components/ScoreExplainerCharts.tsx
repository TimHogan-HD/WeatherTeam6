import { useId } from 'react'
import { colors, colorsV2, spacing } from '@weatherteam6/design/tokens'
import { MAX_HOURS, MIN_HOURS, SCORE_MODEL_FACTS, rockTypeLabel, type RockType } from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { scoreColor } from './charts/chartStyle.js'
import { DISPLAY, LIQUID_W, MONO, scale } from './charts/liquid.js'

/**
 * The three pictures How the score works draws. Each draws a rule, never a
 * reading: the drying table, the reader's temperature range, and a made-up
 * day labelled as one. No friction magnitude is printed (`scoring.md`'s
 * magnitude fence); the grip band's fade is the model's own curve, unlabelled.
 */

const LABEL = 13

/** "Dry rock × Good grip = Score", spread across the card. */
export function ScoreEquation() {
  const pill = (text: string, tint: string) => (
    <span
      style={{
        ...typeV2.body,
        flex: 1,
        textAlign: 'center',
        padding: `${spacing.listGapSm}px 0`,
        borderRadius: 999,
        background: tint,
        color: colorsV2.txt1,
        fontWeight: 600,
      }}
    >
      {text}
    </span>
  )
  const op = (text: string) => (
    <span aria-hidden style={{ ...typeV2.body, color: colorsV2.txtMuted, padding: '0 6px' }}>
      {text}
    </span>
  )
  return (
    <div role="img" aria-label="Dry rock times good grip equals the score" style={{ display: 'flex', alignItems: 'center' }}>
      {pill('Dry rock', 'rgba(165,180,252,0.18)')}
      {op('×')}
      {pill('Good grip', 'rgba(29,197,210,0.18)')}
      {op('=')}
      {pill('Score', 'rgba(200,247,106,0.16)')}
    </div>
  )
}

const DRYING_EXAMPLES: readonly RockType[] = [
  'granite',
  'limestone_dense',
  'sandstone_quartz_arenite',
  'limestone_porous',
  'sandstone_soft',
]
const DRYING_MAX_H = 120
const DRYING_TICKS: readonly [number, string][] = [
  [0, '0'],
  [24, '1 day'],
  [48, '2 days'],
  [120, '5 days'],
]

/** `1–6 h`, `6 h–1 day`, `2–5 days`: hours until a whole day, then days. */
export function dryingSpan(min: number, max: number): string {
  const days = (h: number): number => Math.round((h / 24) * 10) / 10
  const unit = (h: number): string => (days(h) === 1 ? 'day' : 'days')
  if (max < 24) return `${min}–${max} h`
  if (min < 24) return `${min} h–${days(max)} ${unit(max)}`
  return `${days(min)}–${days(max)} ${unit(max)}`
}

/**
 * How long a soaked wall takes to dry, per rock, from the drying table. The
 * crag's own rock is added if it is not one of the examples, and picked out.
 */
export function DryingChart({ rockType }: { rockType: RockType | null }) {
  const own = rockType === null || rockType === 'unknown' ? null : rockType
  const rows = own === null || DRYING_EXAMPLES.includes(own) ? DRYING_EXAMPLES : [...DRYING_EXAMPLES, own]
  const left = 150
  const right = LIQUID_W - 14
  const x = scale(0, DRYING_MAX_H, left, right)
  const rowH = 30
  const top = 26
  const height = top + rows.length * rowH + 4
  const label = `Drying time after a soaking: ${rows
    .map((r) => `${rockTypeLabel(r)} ${MIN_HOURS[r]} to ${MAX_HOURS[r]} hours`)
    .join(', ')}.`

  return (
    <svg viewBox={`0 0 ${LIQUID_W} ${height}`} width="100%" role="img" aria-label={label}>
      {DRYING_TICKS.map(([h, text]) => (
        <g key={h}>
          <line x1={x(h)} x2={x(h)} y1={top - 6} y2={height} stroke="rgba(255,255,255,0.08)" />
          <text x={x(h)} y={top - 10} textAnchor={h === 0 ? 'start' : h === DRYING_MAX_H ? 'end' : 'middle'} fontFamily={MONO} fontSize={11} fill={colorsV2.txtMuted}>
            {text}
          </text>
        </g>
      ))}
      {rows.map((r, i) => {
        const y = top + i * rowH + rowH / 2
        const mine = r === own
        const x0 = x(MIN_HOURS[r])
        const x1 = Math.max(x(MAX_HOURS[r]), x0 + 6)
        return (
          <g key={r}>
            <text x={0} y={y + 4.5} fontFamily={DISPLAY} fontSize={LABEL} fontWeight={mine ? 700 : 400} fill={mine ? colorsV2.brandInk : colorsV2.txt2}>
              {mine ? `${rockTypeLabel(r)} (here)` : rockTypeLabel(r)}
            </text>
            <rect x={x0} y={y - 6} width={x1 - x0} height={12} rx={6} fill={mine ? colorsV2.brand : colorsV2.rainMark} opacity={mine ? 1 : 0.55} />
            <text
              x={x1 + 52 <= right ? x1 + 6 : x0 - 6}
              y={y + 4}
              textAnchor={x1 + 52 <= right ? 'start' : 'end'}
              fontFamily={DISPLAY}
              fontSize={12}
              fontWeight={mine ? 700 : 400}
              fill={mine ? colorsV2.brandInk : colorsV2.txt2}
            >
              {dryingSpan(MIN_HOURS[r], MAX_HOURS[r])}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

const HEAT_SCALE_F = SCORE_MODEL_FACTS.tempFadeScaleF
const GRIP_MIN_F = 0
const GRIP_MAX_F = 100

/**
 * Where grip is full across air temperature: the reader's range solid, fading
 * either side on the model's own curve. Not drawn while the range is unknown,
 * so a default is never shown as the reader's.
 */
export function GripBand({ rangeF }: { rangeF: { low: number; high: number } }) {
  const gradient = useId()
  const left = 14
  const right = LIQUID_W - 14
  const x = scale(GRIP_MIN_F, GRIP_MAX_F, left, right)
  const strength = (f: number): number =>
    f < rangeF.low ? Math.exp(-(rangeF.low - f) / HEAT_SCALE_F) : f > rangeF.high ? Math.exp(-(f - rangeF.high) / HEAT_SCALE_F) : 1
  const stops: number[] = []
  for (let f = GRIP_MIN_F; f <= GRIP_MAX_F; f += 2.5) stops.push(f)
  const lowX = x(Math.max(GRIP_MIN_F, rangeF.low))
  const highX = x(Math.min(GRIP_MAX_F, rangeF.high))
  const bandY = 30
  const bandH = 26

  return (
    <svg
      viewBox={`0 0 ${LIQUID_W} 98`}
      width="100%"
      role="img"
      aria-label={`Grip is full from ${rangeF.low}°F to ${rangeF.high}°F and fades gradually when colder or warmer.`}
    >
      <defs>
        <linearGradient id={gradient} x1={left} x2={right} gradientUnits="userSpaceOnUse">
          {stops.map((f) => (
            <stop key={f} offset={(f - GRIP_MIN_F) / (GRIP_MAX_F - GRIP_MIN_F)} stopColor={colors.good} stopOpacity={0.85 * strength(f)} />
          ))}
        </linearGradient>
      </defs>
      <text x={(lowX + highX) / 2} y={bandY - 9} textAnchor="middle" fontFamily={DISPLAY} fontSize={LABEL} fontWeight={600} fill={colorsV2.goodInk}>
        Full grip
      </text>
      <text x={left} y={bandY - 9} fontFamily={DISPLAY} fontSize={LABEL - 1} fill={colorsV2.txtMuted}>
        ← colder
      </text>
      <text x={right} y={bandY - 9} textAnchor="end" fontFamily={DISPLAY} fontSize={LABEL - 1} fill={colorsV2.txtMuted}>
        warmer →
      </text>
      <rect x={left} y={bandY} width={right - left} height={bandH} rx={8} fill="rgba(255,255,255,0.05)" />
      <rect x={left} y={bandY} width={right - left} height={bandH} rx={8} fill={`url(#${gradient})`} />
      {[rangeF.low, rangeF.high].map((f) => (
        <g key={f}>
          <line x1={x(f)} x2={x(f)} y1={bandY - 3} y2={bandY + bandH + 3} stroke={colorsV2.txt1} strokeWidth={1.5} />
          <text x={x(f)} y={bandY + bandH + 18} textAnchor="middle" fontFamily={DISPLAY} fontSize={LABEL} fontWeight={700} fill={colorsV2.txt1}>
            {`${f}°F`}
          </text>
        </g>
      ))}
      {[0, 20, 40, 80, 100]
        .filter((f) => Math.abs(f - rangeF.low) > 9 && Math.abs(f - rangeF.high) > 9)
        .map((f) => (
          <text key={f} x={x(f)} y={bandY + bandH + 18} textAnchor={f === 0 ? 'start' : f === 100 ? 'end' : 'middle'} fontFamily={MONO} fontSize={11} fill={colorsV2.txtMuted}>
            {`${f}°`}
          </text>
        ))}
    </svg>
  )
}

/** A made-up day's hourly scores, 8am to 6pm. */
const EXAMPLE_DAY: readonly number[] = [40, 55, 70, 85, 92, 88, 82, 95, 90, 62, 45]

/** The best run's start and its worst hour, by the day rule. */
export function bestRun(scores: readonly number[], run: number): { start: number; score: number } | null {
  let best: { start: number; score: number } | null = null
  for (let i = 0; i + run <= scores.length; i++) {
    const worst = Math.min(...scores.slice(i, i + run))
    if (best === null || worst > best.score) best = { start: i, score: worst }
  }
  return best
}

const hourLabel = (h: number): string => `${h % 12 === 0 ? 12 : h % 12}${h < 12 ? 'a' : 'p'}`

/** An example day: each hour's score, the best run boxed, and the day's score it gives. */
export function DayScoreExample() {
  const f = SCORE_MODEL_FACTS
  const run = bestRun(EXAMPLE_DAY, f.dayRunHours)
  const left = 4
  const right = LIQUID_W - 4
  const slot = (right - left) / EXAMPLE_DAY.length
  const base = 132
  const barTop = 44
  const y = scale(0, 100, base, barTop)
  const runX0 = run === null ? 0 : left + run.start * slot + 1
  const runX1 = run === null ? 0 : left + (run.start + f.dayRunHours) * slot - 1

  return (
    <svg
      viewBox={`0 0 ${LIQUID_W} 156`}
      width="100%"
      role="img"
      aria-label={
        run === null
          ? 'An example day'
          : `An example day: its best ${f.dayRunHours} hours in a row score ${EXAMPLE_DAY.slice(run.start, run.start + f.dayRunHours).join(', ')}, so the day scores ${run.score}.`
      }
    >
      {run === null ? null : (
        <g>
          <rect x={runX0} y={barTop - 26} width={runX1 - runX0} height={base - barTop + 30} rx={8} fill="rgba(29,197,210,0.10)" stroke={colorsV2.brand} strokeWidth={1.5} />
          <text x={(runX0 + runX1) / 2} y={barTop - 32} textAnchor="middle" fontFamily={DISPLAY} fontSize={LABEL} fontWeight={700} fill={colorsV2.brandInk}>
            {`Day score ${run.score}`}
          </text>
        </g>
      )}
      {EXAMPLE_DAY.map((s, i) => {
        const cx = left + i * slot + slot / 2
        const lowest = run !== null && i >= run.start && i < run.start + f.dayRunHours && s === run.score
        return (
          <g key={i}>
            <rect x={cx - slot * 0.3} y={y(s)} width={slot * 0.6} height={base - y(s)} rx={4} fill={scoreColor(s)} opacity={0.85} />
            <text x={cx} y={y(s) - 5} textAnchor="middle" fontFamily={DISPLAY} fontSize={12} fontWeight={lowest ? 700 : 400} fill={lowest ? colorsV2.txt1 : colorsV2.txt2}>
              {s}
            </text>
            {i % 2 === 0 ? (
              <text x={cx} y={base + 16} textAnchor="middle" fontFamily={MONO} fontSize={11} fill={colorsV2.txtMuted}>
                {hourLabel(f.dayFirstHour + i)}
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}
