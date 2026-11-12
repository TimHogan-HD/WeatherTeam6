import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { colorsV2, spacing } from '@weatherteam6/design/tokens'
import {
  EM_DASH,
  formatPrecipIn,
  hourLabel,
  OBSERVED_CONDITIONS_LABEL,
  riverHeightNear,
  riverState,
  type RainGaugeReadings,
  type RiverGaugeReading,
  type Visit,
} from '@weatherteam6/types'
import { typeV2, withOpacity } from '../theme/tokens.css.js'
import { stack } from '../theme/styles.js'
import {
  compareGauges,
  gaugeGaps,
  MATCH_MM,
  MATCH_SHARE,
  miles,
  type ModelDay,
  verdictHeadline,
} from '../lib/gaugeLines.js'
import {
  cellShade,
  cellText,
  localDateOf,
  rainGrid,
  rainTabWord,
  sideNote,
  totalText,
  type GridCell,
} from '../lib/gaugeGrid.js'
import { changeLine, formatFt, readingClock, readingWhen, riverTabWord, spotLine, worstRiverState } from '../lib/riverGauge.js'
import { localDaySpan, riverChartModel } from '../lib/riverChart.js'
import { weekdayOf } from '../lib/precipHistory.js'
import { sectCard } from './charts/DayCharts.js'
import { Sect } from './charts/liquid.js'
import { InlineError, Skeleton } from './States.js'

/**
 * The Precip tab's Gauges card (#589; owner, 2026-11-12, mockup version 13):
 * one card, a tab per kind of gauge the crag has. Rain wherever a gauge is in
 * reach; the River only at a crag in `RIVER_GAUGES`. A crag with one kind gets
 * no tab strip, and the caller draws no card for a crag with none.
 *
 * **Readings beside the score, never part of it.** Nothing here feeds Crag A.
 * Each tab's status word is said on the tab, so every kind reads without
 * switching. The reader's own visits (their forecast checks here) are marked
 * on the charts and listed under the tabs.
 */

export type GaugeQuery<T> = {
  data: T | undefined
  isPending: boolean
  isError: boolean
  refetch: () => void
}

export type GaugesCardProps = {
  /** Absent: no rain gauge in reach, so no Rain tab. */
  rain?: GaugeQuery<RainGaugeReadings>
  /** Absent: the crag has no river gauge, so no River tab. */
  river?: { data: RiverGaugeReading[] | undefined; isError: boolean }
  /** The reader's own visits here. Absent or failed draws no marks and says so once. */
  visits?: { data: Visit[] | undefined; isError: boolean }
  /** The models' per-day rain, from the hours the tab draws (`modelDays`). */
  models: ReadonlyMap<string, ModelDay>
  /** The crag's today, `YYYY-MM-DD`. */
  today: string
  /** The crag's clock. */
  utcOffsetSeconds: number
  nowMs: number
}

type Kind = 'rain' | 'river'

const RAIN_LOADING_H = 160
const NAME_COL_W = 68

export function GaugesCard({ rain, river, visits, models, today, utcOffsetSeconds, nowMs }: GaugesCardProps) {
  const kinds: Kind[] = [...(rain === undefined ? [] : ['rain' as const]), ...(river === undefined ? [] : ['river' as const])]
  const [picked, setPicked] = useState<Kind>(kinds[0] ?? 'rain')
  const baseId = useId()
  const active: Kind = kinds.includes(picked) ? picked : (kinds[0] ?? 'rain')
  if (kinds.length === 0) return null

  const visitList = visits?.data ?? []
  const rainData = rain?.data
  const sides =
    rainData === undefined
      ? []
      : compareGauges(rainData, (date) => {
          const m = models.get(date)
          return m?.kind === 'value' ? m.mm : null
        })
  const riverStates = (river?.data ?? []).map((r) => riverState(r, nowMs))
  const worst = worstRiverState(riverStates)

  const status: Record<Kind, { word: string; color: string }> = {
    rain: {
      word: rain === undefined || rain.isPending || rain.isError || rainData === undefined ? EM_DASH : rainTabWord(sides),
      color: colorsV2.txt2,
    },
    river: {
      word: river?.isError === true ? 'No reading' : worst === null ? EM_DASH : riverTabWord(worst),
      color:
        worst?.kind === 'reachable' ? colorsV2.goodInk : worst?.kind === 'high' ? colorsV2.poorInk : colorsV2.txt2,
    },
  }
  const title = kinds.length === 1 && kinds[0] === 'rain' ? 'Rain gauges' : kinds.length === 1 ? 'River gauge' : 'Gauges'

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    e.preventDefault()
    const next = kinds[(i + step + kinds.length) % kinds.length]
    if (next === undefined) return
    setPicked(next)
    document.getElementById(`${baseId}-tab-${next}`)?.focus()
  }

  const panel =
    active === 'rain' && rain !== undefined ? (
      <RainPanel rain={rain} models={models} today={today} visits={visitList} utcOffsetSeconds={utcOffsetSeconds} />
    ) : active === 'river' && river !== undefined ? (
      <RiverPanel river={river} visits={visitList} utcOffsetSeconds={utcOffsetSeconds} nowMs={nowMs} />
    ) : null

  return (
    <section style={{ ...sectCard, ...stack(spacing.listGapLg) }}>
      <Sect title={title} />
      {kinds.length < 2 ? (
        panel
      ) : (
        <>
          <div
            role="tablist"
            aria-label="Gauges"
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${kinds.length}, minmax(0, 1fr))`,
              gap: spacing.tight,
              background: colorsV2.surface,
              border: `1px solid ${colorsV2.line}`,
              borderRadius: 16,
              padding: spacing.tight,
            }}
          >
            {kinds.map((k, i) => {
              const on = k === active
              return (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  id={`${baseId}-tab-${k}`}
                  aria-selected={on}
                  aria-controls={`${baseId}-panel-${k}`}
                  tabIndex={on ? 0 : -1}
                  onClick={() => setPicked(k)}
                  onKeyDown={(e) => onKey(e, i)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: 1,
                    minWidth: 0,
                    minHeight: 44,
                    padding: '8px 10px',
                    border: 0,
                    borderRadius: 12,
                    cursor: 'pointer',
                    textAlign: 'left',
                    background: on ? colorsV2.raised : 'transparent',
                    boxShadow: on ? `inset 0 0 0 1px ${withOpacity(colorsV2.brand, 0.45)}` : 'none',
                  }}
                >
                  <span style={{ ...typeV2.sect, color: on ? colorsV2.brandInk : colorsV2.txtTab }}>
                    {k === 'rain' ? 'Rain' : 'River'}
                  </span>
                  <span
                    style={{
                      ...typeV2.rowSmall,
                      fontWeight: 500,
                      color: status[k].color,
                      maxWidth: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {status[k].word}
                  </span>
                </button>
              )
            })}
          </div>
          <div role="tabpanel" id={`${baseId}-panel-${active}`} aria-labelledby={`${baseId}-tab-${active}`}>
            {panel}
          </div>
        </>
      )}
      <Visits visits={visits} river={river?.data} utcOffsetSeconds={utcOffsetSeconds} />
    </section>
  )
}

/* ------------------------------------------------------------------ rain */

function RainPanel({
  rain,
  models,
  today,
  visits,
  utcOffsetSeconds,
}: {
  rain: GaugeQuery<RainGaugeReadings>
  models: ReadonlyMap<string, ModelDay>
  today: string
  visits: readonly Visit[]
  utcOffsetSeconds: number
}) {
  if (rain.isPending) return <Skeleton height={RAIN_LOADING_H} />
  if (rain.isError || rain.data === undefined) {
    return <InlineError message="Couldn't load the rain gauges." onRetry={rain.refetch} />
  }
  const data = rain.data
  const gaps = gaugeGaps(data)
  const sides = compareGauges(data, (date) => {
    const m = models.get(date)
    return m?.kind === 'value' ? m.mm : null
  })
  const headline = verdictHeadline(sides)
  const grid = rainGrid(data, models)
  const visitDates = new Set(visits.flatMap((v) => localDateOf(v.observed_at, utcOffsetSeconds) ?? []))
  const visitCols = grid.dates.map((d) => visitDates.has(d))

  // The volunteer named once: by distance when every report came from one gauge, else as the nearest reporting.
  const volunteers = data.days.flatMap((d) => (d.volunteer_gauge == null ? [] : [d.volunteer_gauge]))
  const oneVolunteer = new Set(volunteers.map((v) => v.station)).size === 1 ? volunteers[0] : undefined
  const readHours = [...new Set(volunteers.map((v) => v.obs_hour))]
  const readAt = readHours.length === 1 && readHours[0] !== undefined ? ` at ${hourLabel(readHours[0])}` : ' once a day'
  const where = [
    data.airport === null ? null : `Airport ${data.airport.station} ${miles(data.airport.distance_km)} mi`,
    data.volunteer.stations === 0
      ? null
      : oneVolunteer === undefined
        ? 'volunteer: nearest reporting'
        : `volunteer ${miles(oneVolunteer.distance_km)} mi`,
  ].filter((s): s is string => s !== null)
  const footnote = [
    `Inches.${where.length === 0 ? '' : ` ${where.join(' · ')}.`}`,
    '“part” days are left out of the total; a dash is a day with no figure, and withholds the total.',
    data.volunteer.stations > 0 ? `Volunteers read${readAt}, so overnight rain can land a day off.` : null,
    `Matched means within ${formatPrecipIn(MATCH_MM)} or ${Math.round(MATCH_SHARE * 100)}% of the larger total.`,
    'Each gauge is one spot, which a passing shower can miss.',
  ]
    .filter((s): s is string => s !== null)
    .join(' ')

  const visitBg = withOpacity(colorsV2.txt1, 0.05)
  const cellBase = { padding: '8px 0', textAlign: 'center' as const }
  const totalBorder = `1px solid ${colorsV2.line}`

  return (
    <div style={stack(spacing.listGapLg)}>
      <div style={stack(spacing.micro)}>
        {headline === null ? (
          <span style={typeV2.rowSmall}>No whole day at a gauge to set beside the models yet.</span>
        ) : (
          <>
            <span style={typeV2.cardName}>{headline}</span>
            <span style={typeV2.note}>Past {grid.dates.length} days</span>
            {sides.map((s) => (
              <span key={s.kind} style={typeV2.note}>
                {sideNote(s)}
              </span>
            ))}
          </>
        )}
      </div>
      {gaps.length === 0 ? null : <p style={{ ...typeV2.rowSmall, color: colorsV2.txtMuted }}>{gaps.join(' ')}</p>}
      <table
        style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', fontVariantNumeric: 'tabular-nums' }}
      >
        <caption style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          Rain by day, in inches, from each source
        </caption>
        <colgroup>
          <col style={{ width: NAME_COL_W }} />
          {grid.dates.map((d) => (
            <col key={d} />
          ))}
          <col />
        </colgroup>
        <thead>
          {visitCols.some(Boolean) ? (
            <tr>
              <td />
              {grid.dates.map((d, i) => (
                <td
                  key={d}
                  style={{
                    padding: '4px 0 0',
                    textAlign: 'center',
                    lineHeight: '10px',
                    background: visitCols[i] === true ? visitBg : undefined,
                    borderRadius: '6px 6px 0 0',
                  }}
                >
                  {visitCols[i] === true ? <VisitTag /> : null}
                </td>
              ))}
              <td style={{ borderLeft: totalBorder }} />
            </tr>
          ) : null}
          <tr>
            <td />
            {grid.dates.map((d, i) => (
              <th
                key={d}
                scope="col"
                style={{
                  ...cellBase,
                  ...typeV2.dayPick,
                  fontSize: 13,
                  paddingTop: 0,
                  color: visitCols[i] === true ? colorsV2.brandInk : colorsV2.txtMuted,
                  background: visitCols[i] === true ? visitBg : undefined,
                }}
              >
                {d === today ? 'Today' : weekdayOf(d)}
              </th>
            ))}
            <th
              scope="col"
              style={{ ...cellBase, ...typeV2.dayPick, fontSize: 13, paddingTop: 0, color: colorsV2.txt1, borderLeft: totalBorder }}
            >
              {grid.dates.length} days
            </th>
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((r, ri) => {
            const rule = ri === 0 ? 'none' : `1px solid ${colorsV2.line}`
            return (
              <tr key={r.key}>
                <th
                  scope="row"
                  style={{ ...typeV2.rowSmall, fontWeight: 500, textAlign: 'left', whiteSpace: 'nowrap', padding: '8px 0', borderTop: rule }}
                >
                  {r.name}
                </th>
                {r.cells.map((c, i) => (
                  <Cell key={grid.dates[i] ?? i} cell={c} visit={visitCols[i] === true} borderTop={rule} />
                ))}
                <td
                  style={{
                    ...cellBase,
                    ...typeV2.axisTick,
                    fontSize: 12,
                    fontWeight: 600,
                    color: colorsV2.txt1,
                    borderLeft: totalBorder,
                    borderTop: rule,
                  }}
                  aria-label={r.totalMm === null ? 'total withheld: a day has no figure' : undefined}
                >
                  {totalText(r)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p style={typeV2.note}>{footnote}</p>
    </div>
  )
}

function Cell({ cell, visit, borderTop }: { cell: GridCell; visit: boolean; borderTop: string }) {
  const shade = cellShade(cell)
  const text = cellText(cell)
  const word = cell.kind === 'part' || text === 'trace'
  const zero = cell.kind === 'value' && cell.mm === 0
  return (
    <td
      aria-label={cell.kind === 'gap' ? cell.why : undefined}
      style={{
        padding: '8px 0',
        textAlign: 'center',
        borderTop,
        ...(word ? { ...typeV2.legendSm, fontSize: 12, fontStyle: 'italic' } : { ...typeV2.axisTick, fontSize: 12 }),
        color: zero || cell.kind === 'gap' ? colorsV2.txtTab : word ? colorsV2.txtMuted : colorsV2.txt1,
        background:
          shade !== null ? withOpacity(colorsV2.rainAmount, shade) : visit ? withOpacity(colorsV2.txt1, 0.05) : undefined,
      }}
    >
      {text}
    </td>
  )
}

function VisitTag() {
  return <span style={{ ...typeV2.sect, fontSize: 10, letterSpacing: 0.8, color: colorsV2.brandInk }}>Visit</span>
}

/* ----------------------------------------------------------------- river */

function RiverPanel({
  river,
  visits,
  utcOffsetSeconds,
  nowMs,
}: {
  river: NonNullable<GaugesCardProps['river']>
  visits: readonly Visit[]
  utcOffsetSeconds: number
  nowMs: number
}) {
  if (river.isError) return <InlineError message="Couldn't load the river gauge." />
  if (river.data === undefined) return <Skeleton height={RAIN_LOADING_H} />
  return (
    <div style={stack(spacing.listGapLg * 2)}>
      {river.data.map((r) => (
        <RiverReading key={r.site + r.spot} reading={r} visits={visits} utcOffsetSeconds={utcOffsetSeconds} nowMs={nowMs} />
      ))}
    </div>
  )
}

function RiverReading({
  reading,
  visits,
  utcOffsetSeconds,
  nowMs,
}: {
  reading: RiverGaugeReading
  visits: readonly Visit[]
  utcOffsetSeconds: number
  nowMs: number
}) {
  const state = riverState(reading, nowMs)
  const height = state.kind === 'reachable' || state.kind === 'high' ? state.height_ft : null
  const clock = state.kind === 'reachable' || state.kind === 'high' ? readingClock(state.at, utcOffsetSeconds) : null
  const change = state.kind === 'reachable' || state.kind === 'high' ? changeLine(reading) : null
  const spot = spotLine(reading, state)
  const wordColor =
    state.kind === 'reachable' ? colorsV2.goodInk : state.kind === 'high' ? colorsV2.poorInk : colorsV2.txtMuted
  const sub =
    state.kind === 'unavailable'
      ? `${reading.river} · USGS did not answer`
      : state.kind === 'stale'
        ? `${reading.river} · last reading ${readingWhen(state.at, utcOffsetSeconds) ?? 'at an unknown time'}, too old to show`
        : [reading.river, clock, change === null ? null : change.toLowerCase()].filter((s): s is string => s !== null).join(' · ')
  // A stale or missing reading is a gap, never its last figure.
  const figure = height === null ? EM_DASH : formatFt(height).replace(/ ft$/, '')

  return (
    <div style={stack(spacing.listGapLg)}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
        <span style={{ ...typeV2.statFigure, color: height === null ? colorsV2.txtMuted : colorsV2.txt1 }}>
          {figure}
          {height === null ? null : <small style={{ fontSize: 18, fontWeight: 600, color: colorsV2.txtMuted, marginLeft: 2 }}>ft</small>}
        </span>
        <span style={typeV2.note}>{sub}</span>
      </div>
      <p style={{ ...typeV2.rowSmall, fontSize: 14 }}>
        <span style={{ color: wordColor, fontWeight: 600 }}>{spot.word}</span> · {spot.line}
      </p>
      <RiverChart reading={reading} visits={visits} utcOffsetSeconds={utcOffsetSeconds} nowMs={nowMs} />
      <p style={typeV2.note}>
        {reading.spot}. {reading.line_source}. USGS data is provisional; check the water before you cross.
      </p>
    </div>
  )
}

const CW = 440
const CH = 150
const CL = 30
const CR = 8
const CT = 10
const CB = 22

function RiverChart({
  reading,
  visits,
  utcOffsetSeconds,
  nowMs,
}: {
  reading: RiverGaugeReading
  visits: readonly Visit[]
  utcOffsetSeconds: number
  nowMs: number
}) {
  const model = riverChartModel(reading.points, reading.reachable_at_or_below_ft, nowMs)
  if (model === null) return null
  const pw = CW - CL - CR
  const ph = CH - CT - CB
  const x = (ms: number) => CL + ((ms - model.fromMs) / (model.toMs - model.fromMs)) * pw
  const y = (ft: number) => CT + (1 - (ft - model.lo) / (model.hi - model.lo)) * ph
  const lineY = y(reading.reachable_at_or_below_ft)
  const shown = visits
    .map((v) => ({ v, ms: Date.parse(v.observed_at) }))
    .filter((p) => Number.isFinite(p.ms) && p.ms >= model.fromMs && p.ms <= model.toMs)
  const newest = shown[shown.length - 1]
  const dayLabel = (ms: number) =>
    new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(ms + utcOffsetSeconds * 1000)
  const places = model.hi - model.lo < 0.5 ? 2 : 1

  return (
    <div style={stack(spacing.listGapSm)}>
      <svg
        viewBox={`0 0 ${CW} ${CH}`}
        role="img"
        aria-label={`${reading.river} gage height, ${dayLabel(model.fromMs)} to ${dayLabel(model.toMs)}, with your ${formatFt(reading.reachable_at_or_below_ft)} line`}
        style={{ display: 'block', width: '100%', height: 'auto' }}
      >
        {shown.map(({ v, ms }) => {
          const span = localDaySpan(ms, utcOffsetSeconds)
          const x0 = Math.max(CL, x(span.startMs))
          const x1 = Math.min(CW - CR, x(span.endMs))
          return <rect key={`band-${v.id}`} x={x0} y={CT} width={Math.max(0, x1 - x0)} height={ph} fill={colorsV2.txt1} fillOpacity={0.07} />
        })}
        {/* Above the line the spot is cut off: a faint band, so the dashed line reads as an edge. */}
        {lineY > CT ? <rect x={CL} y={CT} width={pw} height={lineY - CT} fill={colorsV2.poorInk} fillOpacity={0.06} /> : null}
        {model.ticks.map((t) => (
          <text key={t} x={CL - 6} y={y(t) + 3.5} textAnchor="end" style={{ ...typeV2.axisTick, fill: colorsV2.txtTab }}>
            {t.toFixed(places)}
          </text>
        ))}
        <line x1={CL} x2={CW - CR} y1={CT + ph} y2={CT + ph} stroke={colorsV2.line} strokeWidth={1} />
        <line
          x1={CL}
          x2={CW - CR}
          y1={lineY}
          y2={lineY}
          stroke={colorsV2.goodInk}
          strokeWidth={1}
          strokeDasharray="3 4"
          strokeOpacity={0.8}
        />
        {model.runs.map((run) =>
          run.length === 1 && run[0] !== undefined ? (
            <circle key={run[0].ms} cx={x(run[0].ms)} cy={y(run[0].ft)} r={1.5} fill={colorsV2.river} />
          ) : (
            <path
              key={run[0]?.ms}
              d={run.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.ms).toFixed(1)} ${y(p.ft).toFixed(1)}`).join('')}
              fill="none"
              stroke={colorsV2.river}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ),
        )}
        {model.latest === null ? null : (
          <circle cx={x(model.latest.ms)} cy={y(model.latest.ft)} r={4.5} fill={colorsV2.river} stroke={colorsV2.card} strokeWidth={2.5} />
        )}
        {shown.map(({ v, ms }) => (
          <line key={`line-${v.id}`} x1={x(ms)} x2={x(ms)} y1={CT} y2={CT + ph} stroke={colorsV2.brandInk} strokeWidth={1.5} />
        ))}
        {newest === undefined ? null : (
          <text
            x={x(newest.ms) > CW - 140 ? x(newest.ms) - 5 : x(newest.ms) + 5}
            y={CT + 10}
            textAnchor={x(newest.ms) > CW - 140 ? 'end' : 'start'}
            style={{ ...typeV2.sect, fontSize: 10, letterSpacing: 0.6, fill: colorsV2.brandInk }}
          >
            {`Your visit · ${dayLabel(newest.ms)}`}
          </text>
        )}
        <text x={CL} y={CH - 6} textAnchor="start" style={{ ...typeV2.axisTick, fill: colorsV2.txtTab }}>
          {dayLabel(model.fromMs)}
        </text>
        <text x={CW - CR} y={CH - 6} textAnchor="end" style={{ ...typeV2.axisTick, fill: colorsV2.txtTab }}>
          {dayLabel(model.toMs)}
        </text>
      </svg>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }} aria-hidden="true">
        <Key swatch={<i style={{ width: 14, height: 3, borderRadius: 2, background: colorsV2.river, display: 'inline-block' }} />}>
          Gage height
        </Key>
        <Key
          swatch={
            <i style={{ width: 14, height: 0, borderTop: `2px dashed ${colorsV2.goodInk}`, display: 'inline-block' }} />
          }
        >
          Your {formatFt(reading.reachable_at_or_below_ft)} line
        </Key>
      </div>
    </div>
  )
}

function Key({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <span style={{ ...typeV2.legendSm, fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {swatch}
      {children}
    </span>
  )
}

/* ---------------------------------------------------------------- visits */

function Visits({
  visits,
  river,
  utcOffsetSeconds,
}: {
  visits: GaugesCardProps['visits']
  river: readonly RiverGaugeReading[] | undefined
  utcOffsetSeconds: number
}) {
  if (visits === undefined) return null
  if (visits.isError) return <p style={typeV2.note}>Couldn&rsquo;t load your visits, so none are marked.</p>
  const list = visits.data ?? []
  if (list.length === 0) return null
  const dateOf = (iso: string) =>
    new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
      Date.parse(iso) + utcOffsetSeconds * 1000,
    )
  return (
    <div style={{ ...stack(spacing.listGapSm), borderTop: `1px solid ${colorsV2.line}`, paddingTop: spacing.listGapLg }}>
      <span style={{ ...typeV2.gaugeLabel, color: colorsV2.txtMuted }}>Your visits</span>
      {[...list].reverse().map((v) => {
        const at = Date.parse(v.observed_at)
        const rivers = (river ?? []).map((r) => {
          const ft = riverHeightNear(r.points, at)
          return `River ${ft === null ? EM_DASH : formatFt(ft)}`
        })
        const facts = [`You saw ${OBSERVED_CONDITIONS_LABEL[v.observed_conditions].toLowerCase()}`, ...rivers].join(' · ')
        return (
          <div key={v.id} style={stack(spacing.micro)}>
            <span style={{ ...typeV2.rowSmall, fontSize: 14, fontWeight: 600, color: colorsV2.txt1 }}>
              <i
                aria-hidden="true"
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 12,
                  marginRight: 6,
                  verticalAlign: -1,
                  background: withOpacity(colorsV2.txt1, 0.1),
                  borderLeft: `2px solid ${colorsV2.brandInk}`,
                }}
              />
              {dateOf(v.observed_at)}
            </span>
            <span style={{ ...typeV2.axisTick, fontSize: 12, color: colorsV2.txt2 }}>{facts}</span>
            {v.message === null ? null : <span style={typeV2.note}>{v.message}</span>}
          </div>
        )
      })}
    </div>
  )
}
