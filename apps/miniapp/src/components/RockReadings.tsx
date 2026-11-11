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
import {
  MARGIN_AHEAD_HOURS,
  ROCK_DEW_WORDS,
  condensationHeadline,
  dampRuns,
  drynessNow,
  marginSeries,
  marginZone,
  spreadSeries,
  spreadWords,
  type DampRun,
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
 * the rock's Dryness and its drying window, and the Condensation card: the
 * air's temperature minus its dew point over the next 42 hours, with the hours
 * the model reads the rock near or under its dew point shaded (#436).
 *
 * **The shading's edge is the score's own**: `SCORE_MODEL_FACTS
 * .condensationClearMarginC`, under which Crag A starts taking grip away. The
 * rock's gap behind it prints nowhere as a figure: it is modelled, and misses
 * ground-surface sensors by about 9°F in daytime (`compare:rock-temp`).
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

/** A shaded run's colour: the model's rock near its dew point, or under it. */
const DAMP_COLOR: Record<DampRun['zone'], string> = { near: colorsV2.fairInk, dew: colorsV2.poorInk }

/**
 * The card's footnote: what the figure is, what it cannot say about the rock,
 * and that the shaded hours are the model's. `source` is the forecast's name
 * over the chart's span (`seamlessModelName`), or `null` when the response
 * named none, and then none is printed (defect class 3).
 */
export function condensationNote(source: string | null): string {
  return (
    `Air temperature minus dew point, from the ${source === null ? '' : `${source} `}forecast. ` +
    'Rock colder than the dew point gets wet with no rain, and rock lags the air, so after a cold night it can be wet while the air reads a few degrees clear. ' +
    'Shaded hours are where the score counts condensation against grip: an estimate, because the rock’s temperature is modelled, not measured.'
  )
}

/**
 * The Condensation card (#436, option 1). The figure is the air's temperature
 * minus its dew point, two forecast values; the model's rock appears only as
 * words and shaded hours, never as a number, because nothing measures rock.
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
  const margins = marginSeries(readings, now)
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
  // The rock at the read hour, joined on the instant: an hour the readings lack is a dash, never "clear".
  const rockAt = margins.find((h) => h.t === read)?.marginF ?? null
  const rockZone = rockAt === null ? null : marginZone(rockAt)
  const runs = runsOf(
    series.map((h) => ({ t: h.t, v: h.spreadF })),
    (h) => h.v !== null,
  ).map((run) => run.map((h) => [axis.x(h.t), y(Math.max(lo, h.v ?? 0))] as Pt))
  // Each damp run covers its hours' whole width, clipped to the plot.
  const clip = (x: number) => Math.min(axis.right, Math.max(axis.left, x))
  const damp = dampRuns(margins).map((r) => ({
    ...r,
    x0: clip(axis.x(r.fromMs - HOUR_MS / 2)),
    x1: clip(axis.x(r.toMs + HOUR_MS / 2)),
  }))
  const zones = new Set(damp.map((r) => r.zone))
  const source =
    model === null ? null : seamlessModelName(model, hrrrThrough, new Date(first.t).toISOString(), new Date(last.t).toISOString())

  return (
    <section style={sectCard}>
      <Sect title="Condensation" aside={`°F air above dew point · next ${MARGIN_AHEAD_HOURS} h`} />
      <p style={{ ...typeV2.lead, color: colorsV2.txt1, fontWeight: '600', margin: '0 0 8px' }}>
        {condensationHeadline(margins, now, utcOffsetSeconds)}
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
          title={`Air temperature minus dew point, now and ${MARGIN_AHEAD_HOURS} hours ahead, with the hours the model reads the rock near or under its dew point shaded`}
          readout={[
            { label: 'air above dew', value: spreadWords(readHour?.spreadF ?? null), color: colorsV2.dewMargin },
            {
              label: 'rock (estimate)',
              value: rockZone === null ? EM_DASH : ROCK_DEW_WORDS[rockZone],
              ...(rockZone === null || rockZone === 'clear' ? {} : { valueColor: DAMP_COLOR[rockZone] }),
            },
          ]}
        >
          {damp.map((r) =>
            r.x1 - r.x0 <= 0 ? null : (
              <rect
                key={r.fromMs}
                x={r.x0}
                y={TOP}
                width={r.x1 - r.x0}
                height={H - BOTTOM - TOP}
                fill={DAMP_COLOR[r.zone]}
                opacity={0.16}
                data-damp={r.zone}
              />
            ),
          )}
          {ticks.map((v) => (
            <g key={v}>
              <line x1={axis.left} x2={axis.right} y1={y(v)} y2={y(v)} stroke={chartColorsV2.grid} />
              <ScaleFigure side="start" y={y(v)}>{`${v}°`}</ScaleFigure>
            </g>
          ))}
          {damp.map((r) =>
            // Named only where the word fits inside its run.
            r.x1 - r.x0 < ROCK_DEW_WORDS[r.zone].length * 6 + 8 ? null : (
              <Label key={r.fromMs} x={(r.x0 + r.x1) / 2} y={TOP + 10} anchor="middle" color={DAMP_COLOR[r.zone]}>
                {ROCK_DEW_WORDS[r.zone]}
              </Label>
            ),
          )}
          {runs.map((pts, i) => (
            <Tube key={i} d={smoothPath(pts)} stroke={colorsV2.dewMargin} width={4} />
          ))}
          {readHour === null || readHour.spreadF === null ? null : (
            <Bead x={axis.x(readHour.t)} y={y(Math.max(lo, readHour.spreadF))} color={colorsV2.dewMargin} />
          )}
        </LiquidFrame>
        <div style={keyInset}>
          <KeyRow
            keys={[
              { label: 'air above dew point', swatch: { kind: 'line', background: colorsV2.dewMargin } },
              ...(zones.has('near')
                ? [{ label: 'rock near dew (estimate)', swatch: { kind: 'block' as const, background: colorsV2.fairInk, opacity: 0.35 } }]
                : []),
              ...(zones.has('dew')
                ? [{ label: 'dew likely (estimate)', swatch: { kind: 'block' as const, background: colorsV2.poorInk, opacity: 0.35 } }]
                : []),
            ]}
          />
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
