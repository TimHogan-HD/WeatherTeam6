import { useState } from 'react'
import { colorsV2 } from '@weatherteam6/design/tokens'
import {
  EM_DASH,
  FRICTION_MECHANISM,
  MAX_HOURS,
  MIN_HOURS,
  rockTypeLabel,
  seamlessModelName,
  type HourlyReadings,
  type HourlySample,
  type RecentPrecip,
  type RockType,
} from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { niceTicks } from '../lib/chartTicks.js'
import { formatSince, precipDays, precipSummary } from '../lib/precipHistory.js'
import { MARGIN_AHEAD_HOURS, drynessNow, spreadSeries, spreadWords } from '../lib/rockReadings.js'
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
 * the rock's Dryness and its drying window, and the Condensation card: the
 * air's temperature minus its dew point over the next 42 hours (#436).
 *
 * **The model's rock near its dew point is not drawn** (2026-11-28, after
 * 2026-11-27 took it out of the score): no headline, no shaded hours, no rock
 * word in the read chip. It called dew on Sandstone for a dry Saturday, both
 * forecast checks that met it found climbable rock, and
 * `compare:condensation-margin` found it flagging 2–8% of climbing hours
 * against measured surfaces under the dew point in 0–2%. Bring it back only
 * with a measurement that it predicts wet rock (`scoring.md`).
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
const HOUR_MS = 3_600_000

/**
 * The card's footnote: what the figure is, and what it cannot say about the
 * rock. `source` is the forecast's name
 * over the chart's span (`seamlessModelName`), or `null` when the response
 * named none, and then none is printed (defect class 3).
 */
export function condensationNote(source: string | null): string {
  return (
    `Air temperature minus dew point, from the ${source === null ? '' : `${source} `}forecast. ` +
    'Rock colder than the dew point gets wet with no rain, and rock lags the air, so after a cold night it can be wet while the air reads a few degrees clear. ' +
    'The app doesn’t guess the rock’s own temperature here: its estimate called dew far more often than the rock was wet.'
  )
}

/**
 * The Condensation card (#436, option 1). The figure is the air's temperature
 * minus its dew point, two forecast values. Nothing measures the rock, so
 * the card says nothing about it beyond the footnote.
 */
export function CondensationCard({
  readings,
  hours,
  model,
  hrrrThrough,
  utcOffsetSeconds,
}: {
  readings: HourlyReadings | undefined
  /** `/hourly`'s weather hours: the air and dew point the chart draws. */
  hours: readonly HourlySample[]
  /** `HourlySeries.model`, the model those hours came from; `null` names none. */
  model: string | null
  /** `HourlySeries.hrrr_through`: where `gfs_seamless` hands over from HRRR (#473). */
  hrrrThrough: string | null | undefined
  utcOffsetSeconds: number
}) {
  const now = useNow()
  const [readMs, setReadMs] = useState<number | null>(null)
  const series = spreadSeries(hours, now)
  const values = series.map((h) => h.spreadF).filter((v): v is number => v !== null)
  const first = series[0]
  const last = series[series.length - 1]
  if (values.length === 0 || first === undefined || last === undefined) return null

  const ticks = niceTicks(0, Math.max(10, ...values))
  const axis = timeAxis(first.t, Math.max(last.t, first.t + HOUR_MS), {
    left: Math.max(0, ...ticks.map((v) => `${v}°`.length)),
    right: 0,
  })
  const lo = ticks[0] ?? 0
  const hi = ticks[ticks.length - 1] ?? 10
  const y = scale(lo, hi, H - BOTTOM, TOP + 4)
  const instants = series.map((h) => h.t)
  const nowHour = instants.reduce<number | null>((b, t) => (b === null || Math.abs(t - now) < Math.abs(b - now) ? t : b), null)
  const read = readMs !== null && instants.includes(readMs) ? readMs : nowHour
  const readHour = series.find((h) => h.t === read) ?? null
  const runs = runsOf(
    series.map((h) => ({ t: h.t, v: h.spreadF })),
    (h) => h.v !== null,
  ).map((run) => run.map((h) => [axis.x(h.t), y(Math.max(lo, h.v ?? 0))] as Pt))
  const source =
    model === null ? null : seamlessModelName(model, hrrrThrough, new Date(first.t).toISOString(), new Date(last.t).toISOString())

  return (
    <section style={sectCard}>
      <Sect title="Condensation" aside={`°F air above dew point · next ${MARGIN_AHEAD_HOURS} h`} />
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
          title={`Air temperature minus dew point, now and ${MARGIN_AHEAD_HOURS} hours ahead`}
          readout={[{ label: 'air above dew', value: spreadWords(readHour?.spreadF ?? null), color: colorsV2.dewMargin }]}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={axis.left} x2={axis.right} y1={y(v)} y2={y(v)} stroke={chartColorsV2.grid} />
              <ScaleFigure side="start" y={y(v)}>{`${v}°`}</ScaleFigure>
            </g>
          ))}
          {runs.map((pts, i) => (
            <Tube key={i} d={smoothPath(pts)} stroke={colorsV2.dewMargin} width={4} />
          ))}
          {readHour === null || readHour.spreadF === null ? null : (
            <Bead x={axis.x(readHour.t)} y={y(Math.max(lo, readHour.spreadF))} color={colorsV2.dewMargin} />
          )}
        </LiquidFrame>
        <div style={keyInset}>
          <KeyRow keys={[{ label: 'air above dew point', swatch: { kind: 'line', background: colorsV2.dewMargin } }]} />
        </div>
      </div>
      <p style={{ ...typeV2.rowSmall, margin: '12px 0 0' }}>{condensationNote(source)}</p>
      {/* Said once in the app, here (owner, 2026-10-29: it left the Overview). */}
      {readings?.hours.some((h) => h.friction != null) === true ? (
        <p style={{ ...typeV2.keyRow, lineHeight: '16px', margin: '8px 0 0' }}>{FRICTION_MECHANISM}</p>
      ) : null}
    </section>
  )
}
