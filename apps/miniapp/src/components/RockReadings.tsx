import { useState } from 'react'
import { colorsV2 } from '@weatherteam6/design/tokens'
import {
  EM_DASH,
  MAX_HOURS,
  MIN_HOURS,
  rockTypeLabel,
  type HourlyReadings,
  type RecentPrecip,
  type RockType,
} from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { niceTicks } from '../lib/chartTicks.js'
import { lastRainText } from '../lib/overview.js'
import { formatSince, precipDays, precipSummary } from '../lib/precipHistory.js'
import {
  CONDENSATION_EDGE_F,
  MARGIN_AHEAD_HOURS,
  condensationHoursAhead,
  drynessNow,
  marginSeries,
} from '../lib/rockReadings.js'
import { useNow } from '../hooks/useNow.js'
import { bleed, keyInset, sectCard } from './charts/DayCharts.js'
import { chartColorsV2 } from './charts/chartStyle.js'
import {
  Bead,
  KeyRow,
  LiquidFrame,
  ScaleFigure,
  Sect,
  Tube,
  runsOf,
  scale,
  smoothPath,
  timeAxis,
  type Pt,
} from './charts/liquid.js'
import { DryingClock } from './DryingClock.js'
import { Stats } from './StatTiles.js'

/**
 * The Rock tab's live readings, above the field guide (owner, 2026-10-19,
 * reversing the 2026-09-30 removal of the drying card): the drying clock with
 * the rock's Dryness and its drying window, and how far the rock sits above
 * its dew point over 48 hours.
 *
 * **The condensation edge is the score's own**: `SCORE_MODEL_FACTS
 * .condensationClearMarginC`, under which Crag A starts taking grip away. The
 * mockup's 4° was sample data; 2 °C is printed as 3.6°F, the value the shading uses.
 */

export function DryingCard({
  rockType,
  recent,
  readings,
}: {
  rockType: RockType
  recent: RecentPrecip | undefined
  readings: HourlyReadings | undefined
}) {
  const now = useNow()
  const summary = recent === undefined ? null : precipSummary(recent, now)
  const since = summary?.hoursSinceReal ?? null
  // The measured span ("None in 3 days"), and null for an empty window: never a week asked for but not read.
  const noRealRain = summary === null || recent === undefined ? null : lastRainText(summary, precipDays(recent.hours).length)
  const dryness = drynessNow(readings, now)
  const min = MIN_HOURS[rockType]
  const max = MAX_HOURS[rockType]
  return (
    <section style={sectCard}>
      <Sect title="Drying" aside={`${rockTypeLabel(rockType)} · dries in ${min}–${max} h`} />
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
        <DryingClock
          hours={since}
          rockType={rockType}
          dryness={dryness}
          size={140}
          label={
            since !== null
              ? `Drying clock: ${formatSince(since)} since real rain`
              : `Drying clock: ${noRealRain ?? 'no rain record'}`
          }
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Stats
            stacked
            items={[
              { label: 'Dryness', value: dryness ?? EM_DASH },
              { label: 'Since real rain', value: since === null ? (noRealRain ?? EM_DASH) : formatSince(since) },
              { label: 'Window starts', value: `${min} h`, note: 'the tick on the ring' },
            ]}
          />
        </div>
      </div>
    </section>
  )
}

const H = 160
const TOP = 10
const BOTTOM = 22

export function CondensationCard({
  readings,
  utcOffsetSeconds,
}: {
  readings: HourlyReadings | undefined
  utcOffsetSeconds: number
}) {
  const now = useNow()
  const [readMs, setReadMs] = useState<number | null>(null)
  const series = marginSeries(readings, now)
  const values = series.map((h) => h.marginF).filter((v): v is number => v !== null)
  const first = series[0]
  const last = series[series.length - 1]
  if (values.length === 0 || first === undefined || last === undefined) return null

  const ticks = niceTicks(Math.min(0, ...values), Math.max(CONDENSATION_EDGE_F * 2, ...values))
  // Printed to the tenth the shading uses (2 °C is 3.6°F), so an hour at 3.8°F is never called "more than 4°F".
  const edge = Number(CONDENSATION_EDGE_F.toFixed(1))
  // The ticks' figures stand at the right, the edge's at the left.
  const axis = timeAxis(first.t, Math.max(last.t, first.t + 3_600_000), {
    left: `${edge}°`.length,
    right: Math.max(0, ...ticks.map((v) => `${v}°`.length)),
  })
  const lo = ticks[0] ?? 0
  const hi = ticks[ticks.length - 1] ?? CONDENSATION_EDGE_F * 2
  const y = scale(lo, hi, H - BOTTOM, TOP + 4)
  const instants = series.map((h) => h.t)
  const nowHour = instants.reduce<number | null>((b, t) => (b === null || Math.abs(t - now) < Math.abs(b - now) ? t : b), null)
  const read = readMs !== null && instants.includes(readMs) ? readMs : nowHour
  const readHour = series.find((h) => h.t === read) ?? null
  const half = (axis.x(first.t + 3_600_000) - axis.x(first.t)) / 2
  const ahead = series.filter((h) => h.t > now && h.marginF !== null).length
  const condHours = condensationHoursAhead(series, now)
  const runs = runsOf(
    series.map((h) => ({ t: h.t, v: h.marginF })),
    (h) => h.v !== null,
  ).map((run) => run.map((h) => [axis.x(h.t), y(h.v ?? 0)] as Pt))

  return (
    <section style={sectCard}>
      <Sect title="Condensation" aside={`°F rock above dew point · ${MARGIN_AHEAD_HOURS + 6} h`} />
      <div style={bleed}>
        <LiquidFrame
          height={H}
          top={TOP}
          bottom={BOTTOM}
          axis={axis}
          instants={instants}
          utcOffsetSeconds={utcOffsetSeconds}
          nowMs={now}
          read={{ ms: read, onRead: setReadMs }}
          title={`How far the rock sits above its dew point, six hours back and ${MARGIN_AHEAD_HOURS} ahead; hours within ${edge}°F shaded`}
          readout={[
            {
              label: 'rock above dew',
              value: readHour === null || readHour.marginF === null ? EM_DASH : `${Math.round(readHour.marginF)}°F`,
              color: colorsV2.dewMargin,
            },
          ]}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={axis.left} x2={axis.right} y1={y(v)} y2={y(v)} stroke={chartColorsV2.grid} />
              <ScaleFigure side="end" y={y(v)}>{`${v}°`}</ScaleFigure>
            </g>
          ))}
          {now > first.t ? (
            <rect x={axis.left} y={TOP} width={Math.max(0, axis.x(Math.min(now, last.t)) - axis.left)} height={H - BOTTOM - TOP} fill={chartColorsV2.past} />
          ) : null}
          {series.map((h) =>
            h.marginF === null || h.marginF >= CONDENSATION_EDGE_F ? null : (
              <rect
                key={h.t}
                x={axis.x(h.t) - half}
                y={TOP}
                width={half * 2}
                height={H - BOTTOM - TOP}
                fill={colorsV2.poorInk}
                opacity={0.14}
                data-condensing=""
              />
            ),
          )}
          <line
            x1={axis.left}
            x2={axis.right}
            y1={y(CONDENSATION_EDGE_F)}
            y2={y(CONDENSATION_EDGE_F)}
            stroke={colorsV2.poorInk}
            strokeWidth={1.2}
            strokeDasharray="4 4"
            opacity={0.8}
          />
          <ScaleFigure side="start" y={y(CONDENSATION_EDGE_F)} color={colorsV2.poorInk}>{`${edge}°`}</ScaleFigure>
          {runs.map((pts, i) => (
            <Tube key={i} d={smoothPath(pts)} stroke={colorsV2.dewMargin} width={4} />
          ))}
          {readHour === null || readHour.marginF === null ? null : (
            <Bead x={axis.x(readHour.t)} y={y(readHour.marginF)} color={colorsV2.dewMargin} />
          )}
        </LiquidFrame>
        <div style={keyInset}>
          <KeyRow
            keys={[
              { label: 'rock above dew point', swatch: { kind: 'line', background: colorsV2.dewMargin } },
              { label: `within ${edge}° of dew`, swatch: { kind: 'block', background: colorsV2.poorInk, opacity: 0.4 } },
            ]}
          />
        </div>
      </div>
      <p style={{ ...typeV2.rowSmall, margin: '12px 0 0' }}>
        {ahead === 0
          ? 'No rock readings for the hours ahead.'
          : condHours > 0
            ? `${condHours} of the next ${ahead} hours bring the rock within ${edge}°F of its dew point, where the score starts to count condensation against grip.`
            : `The rock stays more than ${edge}°F above its dew point for the next ${ahead} hours.`}
      </p>
    </section>
  )
}
