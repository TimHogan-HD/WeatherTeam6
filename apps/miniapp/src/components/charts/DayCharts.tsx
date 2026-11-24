import type { CSSProperties, ReactNode } from 'react'
import { colorsV2 } from '@weatherteam6/design/tokens'
import { EM_DASH, formatPrecipIn, type HourlySample } from '@weatherteam6/types'
import { typeV2 } from '../../theme/tokens.css.js'
import { sectionV2 } from '../../theme/styles.js'
import { formatLocalHour } from '../../lib/format.js'
import { weekdayOf } from '../../lib/precipHistory.js'
import { chartColorsV2 } from './chartStyle.js'
import { KeyRow, LiquidFrame, MONO, ScaleFigure, scale, type ScaleChars, type TimeAxis } from './liquid.js'
import {
  type RainBlock,
  blockAt,
  columnInches,
  mmToIn,
  rainBlockHours,
  rainBlocks,
  rainFloorIn,
  rainTopIn,
  scaleInches,
} from './rainBlocks.js'

/**
 * The chart parts the crag tabs share: the open section every card sits in,
 * the bleed that lets a plot use the screen's width, and the rain chart in
 * blocks that the Precip tab draws. Hourly drew its four charts here until it
 * became rows (owner, 2026-11-24, `HourlyRows.tsx`).
 */

type Read = { ms: number | null; onRead: (ms: number) => void }

/**
 * Each chart prints one scale, at the left, `100%` its longest figure
 * (owner, 2026-10-27: a right-hand column read as an ugly gap). A second
 * series is read in the chart's chip.
 */
export const DAY_SCALES: ScaleChars = { left: 4, right: 0 }

/** The unit of the scale `RainChart` draws for these hours: inches in each block. */
export function rainScaleUnit(hours: readonly HourlySample[]): string {
  return `in per ${rainBlockHours(hours)} hours`
}

export const sectCard: CSSProperties = sectionV2
/**
 * The chart runs 14px past the section's edge, as the Today chart does, so its plot
 * uses the screen's width without leaving it: the screen's gutter is 16px and an open
 * section's padding 2px (#644 variant C). It was 22px past a glass card's padding.
 */
export const bleed: CSSProperties = { margin: '0 -14px' }
export const keyInset: CSSProperties = { padding: '0 14px' }

export type FrameProps = {
  axis: TimeAxis | null
  instants: readonly number[]
  utcOffsetSeconds: number
  nowMs: number
  read: Read
}

function Empty({ children }: { children: ReactNode }) {
  return <p style={{ ...typeV2.body, margin: 0 }}>{children}</p>
}

const percent = (v: number | null): string => (v === null ? EM_DASH : `${Math.round(v)}%`)

/**
 * Rain in blocks of hours (owner, 2026-10-30, mockup version 1 of the rain
 * charts): each block's total inches as a column with its figure on top, on an
 * inch scale, and its chance in a pill underneath. The old chart drew the
 * amount on a scale it never printed, so a trace looked like a downpour, and
 * its hourly chance capsules crowded together.
 *
 * The Precip tab draws its next 48 hours in sixes (`rainBlocks`; a day or
 * less goes in threes). `dry` is the caller's verdict (`dryDay`, `dryHours`)
 * and the words that replace the marks when it holds.
 */
export function RainChart({
  axis,
  instants,
  utcOffsetSeconds,
  nowMs,
  read,
  hours,
  dry,
}: FrameProps & { hours: readonly HourlySample[]; dry: { title: string; note: string } | null }) {
  const blocks = rainBlocks(hours)
  const size = rainBlockHours(hours)
  const hasAmount = blocks.some((b) => b.totalMm !== null)
  const hasChance = blocks.some((b) => b.chancePct !== null)
  if (axis === null || (!hasAmount && !hasChance)) return <Empty>No hourly rainfall for these hours.</Empty>

  const H = 176
  const floor = 126
  const peak = 30
  const topIn = rainTopIn(Math.max(0, ...blocks.map((b) => (b.totalMm === null ? 0 : mmToIn(b.totalMm)))), rainFloorIn(size))
  const y = scale(0, topIn, floor, peak)
  const frameProps = { height: H, top: 10, bottom: 22, axis, instants, utcOffsetSeconds, nowMs, read }

  const inchGrid = [0, topIn / 2, topIn].map((v) => (
    <g key={v}>
      <line x1={axis.left} x2={axis.right} y1={y(v)} y2={y(v)} stroke={chartColorsV2.grid} />
      <ScaleFigure side="start" y={y(v)}>{scaleInches(v)}</ScaleFigure>
    </g>
  ))

  if (dry !== null) {
    return (
      <div style={{ ...bleed, position: 'relative' }}>
        <LiquidFrame {...frameProps} bare title={`Rain: ${dry.title.toLowerCase()}`}>
          {inchGrid}
        </LiquidFrame>
        <div
          style={{
            position: 'absolute',
            left: '56px',
            right: '56px',
            top: '14px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: '2px',
            pointerEvents: 'none',
            textShadow: '0 1px 8px rgba(0,0,0,0.6)',
          }}
        >
          <b style={{ ...typeV2.lineFigure, color: colorsV2.goodInk }}>{dry.title}</b>
          <span style={{ ...typeV2.heroSideSm, lineHeight: '1.4', maxWidth: '32ch' }}>{dry.note}</span>
        </div>
      </div>
    )
  }

  const readBlock = blockAt(blocks, read.ms)
  const spanOf = (b: RainBlock) => {
    const from = formatLocalHour(b.fromMs, utcOffsetSeconds)
    const to = formatLocalHour(b.toMs, utcOffsetSeconds)
    if (from === null || to === null) return ''
    return `${from}–${to}${size === 6 ? ` ${weekdayOf(b.localDate)}` : ''}`
  }
  return (
    <div style={bleed}>
      <LiquidFrame
        {...frameProps}
        title={`Rain in ${size}-hour blocks: total inches as columns, chance of rain underneath`}
        readLabel={readBlock === null ? undefined : spanOf(readBlock)}
        readout={
          readBlock === null
            ? []
            : [
                ...(hasAmount
                  ? [{ label: 'total', value: formatPrecipIn(readBlock.totalMm), color: colorsV2.rainAmount }]
                  : []),
                ...(hasChance
                  ? [{ label: 'chance up to', value: percent(readBlock.chancePct), color: colorsV2.rainMark }]
                  : []),
              ]
        }
      >
        {hasAmount ? inchGrid : null}
        {blocks.map((b) => {
          // The block spans its hours' rain, each hour ending at its stamp, so
          // the first starts an hour left of the plot: it reaches into the
          // gutter, clear of the scale figures, rather than shrink.
          const x0 = axis.x(b.fromMs)
          const x1 = Math.min(axis.right, axis.x(b.toMs))
          const mid = (x0 + x1) / 2
          const w = x1 - x0
          const bw = Math.min(30, w - 8)
          // A block too narrow for its figures (a short last block) is read in the chip alone.
          const labelled = w >= 30
          const isRead = b === readBlock
          const top = b.totalMm === null ? floor : Math.min(y(mmToIn(b.totalMm)), floor - 2)
          return (
            <g key={b.fromMs} data-block="">
              {isRead ? (
                <rect x={x0 + 1} y={peak - 22} width={Math.max(0, w - 2)} height={floor - peak + 50} rx={9} fill="#fff" fillOpacity={0.055} />
              ) : null}
              {b.totalMm === null || b.totalMm === 0 || bw <= 0 ? null : (
                <rect
                  x={mid - bw / 2}
                  y={top}
                  width={bw}
                  height={floor - top}
                  rx={4}
                  fill={colorsV2.rainAmount}
                  fillOpacity={isRead ? 1 : 0.8}
                  data-amount=""
                />
              )}
              {!hasAmount || !labelled ? null : (
                <text x={mid} y={top - 6} fontFamily={MONO} fontSize={10.5} fontWeight={700} fill={colorsV2.rainAmount} textAnchor="middle">
                  {columnInches(b.totalMm)}
                </text>
              )}
              {!hasChance || !labelled ? null : (
                <g data-chance="">
                  <rect
                    x={mid - 15}
                    y={floor + 7}
                    width={30}
                    height={16}
                    rx={8}
                    fill={colorsV2.rainMark}
                    fillOpacity={b.chancePct === null ? 0.1 : 0.1 + (0.5 * b.chancePct) / 100}
                  />
                  <text
                    x={mid}
                    y={floor + 18.5}
                    fontFamily={MONO}
                    fontSize={9.5}
                    fontWeight={600}
                    fill={b.chancePct !== null && b.chancePct >= 50 ? colorsV2.txt1 : colorsV2.rainMark}
                    textAnchor="middle"
                  >
                    {percent(b.chancePct)}
                  </text>
                </g>
              )}
            </g>
          )
        })}
      </LiquidFrame>
      <div style={keyInset}>
        <KeyRow
          keys={[
            ...(hasAmount ? [{ label: `inches in ${size} hours`, swatch: { kind: 'block' as const, background: colorsV2.rainAmount } }] : []),
            ...(hasChance ? [{ label: 'chance at the likeliest hour', swatch: { kind: 'capsule' as const, color: colorsV2.rainMark } }] : []),
          ]}
        />
      </div>
    </div>
  )
}
