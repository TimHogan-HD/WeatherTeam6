import { useState } from 'react'
import { colorsV2 } from '@weatherteam6/design/tokens'
import {
  EM_DASH,
  FRICTION_MECHANISM,
  MAX_HOURS,
  MIN_HOURS,
  rockTypeLabel,
  type HourlyReadings,
  type RecentPrecip,
  type RockType,
} from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { niceTicks } from '../lib/chartTicks.js'
import { formatSince, precipDays, precipSummary } from '../lib/precipHistory.js'
import {
  CONDENSATION_EDGE_F,
  MARGIN_AHEAD_HOURS,
  MARGIN_ZONE_LABELS,
  condensationHeadline,
  drynessNow,
  marginSeries,
  marginWords,
  marginZone,
  type MarginZone,
} from '../lib/rockReadings.js'
import { useNow } from '../hooks/useNow.js'
import { bleed, keyInset, sectCard } from './charts/DayCharts.js'
import { chartColorsV2 } from './charts/chartStyle.js'
import {
  Bead,
  KeyRow,
  Label,
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
 * its dew point over the next 42 hours, in three named zones (owner,
 * 2026-11-02, variant A): dew on rock under 0°, close to dew under the edge.
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
  // Not `lastRainText`: that names a shower of any size, and this card is the real rain's.
  const noRealRain =
    summary === null || recent === undefined || summary.endingLocal === null
      ? null
      : `None in ${precipDays(recent.hours).length} days`
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
  // Printed to the tenth the zones use (2 °C is 3.6°F), so an hour at 3.8°F is never called "more than 4°F".
  const edge = Number(CONDENSATION_EDGE_F.toFixed(1))
  // The ticks' figures stand at the left, as every chart's do; the zones are named inside the chart.
  const axis = timeAxis(first.t, Math.max(last.t, first.t + 3_600_000), {
    left: Math.max(0, ...ticks.map((v) => `${v}°`.length)),
    right: 0,
  })
  const lo = ticks[0] ?? 0
  const hi = ticks[ticks.length - 1] ?? CONDENSATION_EDGE_F * 2
  const y = scale(lo, hi, H - BOTTOM, TOP + 4)
  const instants = series.map((h) => h.t)
  const nowHour = instants.reduce<number | null>((b, t) => (b === null || Math.abs(t - now) < Math.abs(b - now) ? t : b), null)
  const read = readMs !== null && instants.includes(readMs) ? readMs : nowHour
  const readHour = series.find((h) => h.t === read) ?? null
  const zone = readHour === null || readHour.marginF === null ? null : marginZone(readHour.marginF)
  // A zone's band and its name, drawn only where the scale reaches it and there is room for the name.
  const bands: { zone: MarginZone; top: number; bottom: number; color: string }[] = [
    { zone: 'dew', top: y(0), bottom: y(lo), color: colorsV2.poorInk },
    { zone: 'near', top: y(CONDENSATION_EDGE_F), bottom: y(0), color: colorsV2.fairInk },
  ]
  const runs = runsOf(
    series.map((h) => ({ t: h.t, v: h.marginF })),
    (h) => h.v !== null,
  ).map((run) => run.map((h) => [axis.x(h.t), y(h.v ?? 0)] as Pt))

  return (
    <section style={sectCard}>
      <Sect title="Condensation" aside={`°F rock vs dew point · next ${MARGIN_AHEAD_HOURS} h`} />
      <p style={{ ...typeV2.lead, color: colorsV2.txt1, fontWeight: '600', margin: '0 0 8px' }}>
        {condensationHeadline(series, now, utcOffsetSeconds)}
      </p>
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
          title={`How far the rock sits above or below its dew point, now and ${MARGIN_AHEAD_HOURS} hours ahead: under 0° dew on rock, under ${edge}° close to dew`}
          readout={[
            {
              label: zone === null ? 'rock vs dew' : MARGIN_ZONE_LABELS[zone],
              value:
                readHour === null || readHour.marginF === null
                  ? EM_DASH
                  : marginWords(readHour.marginF),
              color: colorsV2.dewMargin,
            },
          ]}
        >
          {bands.map((b) =>
            b.bottom - b.top <= 0 ? null : (
              <rect
                key={b.zone}
                x={axis.left}
                y={b.top}
                width={axis.right - axis.left}
                height={b.bottom - b.top}
                fill={b.color}
                opacity={0.14}
                data-zone={b.zone}
              />
            ),
          )}
          {ticks.map((v) => (
            <g key={v}>
              <line x1={axis.left} x2={axis.right} y1={y(v)} y2={y(v)} stroke={chartColorsV2.grid} />
              <ScaleFigure side="start" y={y(v)}>{`${v}°`}</ScaleFigure>
            </g>
          ))}
          <line x1={axis.left} x2={axis.right} y1={y(0)} y2={y(0)} stroke={colorsV2.poorInk} strokeWidth={1.2} opacity={0.8} />
          <line
            x1={axis.left}
            x2={axis.right}
            y1={y(CONDENSATION_EDGE_F)}
            y2={y(CONDENSATION_EDGE_F)}
            stroke={colorsV2.fairInk}
            strokeWidth={1.2}
            strokeDasharray="4 4"
            opacity={0.8}
          />
          {bands.map((b) =>
            b.bottom - b.top < 14 ? null : (
              <Label key={b.zone} x={axis.right - 4} y={b.bottom - 4} anchor="end" color={b.color}>
                {MARGIN_ZONE_LABELS[b.zone]}
              </Label>
            ),
          )}
          {y(CONDENSATION_EDGE_F) - TOP < 14 ? null : (
            <Label x={axis.right - 4} y={TOP + 10} anchor="end">
              {MARGIN_ZONE_LABELS.clear}
            </Label>
          )}
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
              { label: 'rock above or below dew point', swatch: { kind: 'line', background: colorsV2.dewMargin } },
            ]}
          />
        </div>
      </div>
      <p style={{ ...typeV2.rowSmall, margin: '12px 0 0' }}>
        {`Under ${edge}°F the score counts condensation against grip. The rock temperature is modelled, so the zones are likely, not certain.`}
      </p>
      {/* Said once in the app, here (owner, 2026-10-29: it left the Overview). */}
      {readings?.hours.some((h) => h.friction != null) === true ? (
        <p style={{ ...typeV2.keyRow, lineHeight: '16px', margin: '8px 0 0' }}>{FRICTION_MECHANISM}</p>
      ) : null}
    </section>
  )
}
