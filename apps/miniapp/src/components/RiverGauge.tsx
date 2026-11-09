import { colors, colorsV2, spacing } from '@weatherteam6/design/tokens'
import { riverState, type RiverGaugeReading } from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { alertSurface, cardV2, row, stack } from '../theme/styles.js'
import { changeLine, formatFt, overviewLine, overviewShows, readingClock, spotWord } from '../lib/riverGauge.js'

/**
 * A river gauge a crag's climbing depends on (`RIVER_GAUGES`): the Rock tab's
 * card, always, and the Overview's line, only when the river is above the
 * spot's line or the reading is missing (owner, 2026-11-09).
 *
 * **A reading beside the score, never part of it.** Gage height from USGS,
 * provisional, said on the card.
 */
export function RiverGaugeCard({
  reading,
  nowMs,
  utcOffsetSeconds,
}: {
  reading: RiverGaugeReading
  nowMs: number
  utcOffsetSeconds: number | null
}) {
  const state = riverState(reading, nowMs)
  const height = state.kind === 'unavailable' ? null : state.height_ft
  const clock = state.kind === 'unavailable' ? null : readingClock(state.at, utcOffsetSeconds)
  const change = state.kind === 'unavailable' ? null : changeLine(reading)
  const wordColor =
    state.kind === 'reachable' ? colorsV2.goodInk : state.kind === 'high' ? colorsV2.poorInk : colorsV2.txtMuted

  return (
    <section style={{ ...cardV2, ...stack(spacing.listGapLg) }}>
      <h2 style={typeV2.cardTitle}>{reading.river}</h2>
      <div style={{ ...row(spacing.listGapLg), alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ ...typeV2.statFigure, color: colorsV2.txt1 }}>{formatFt(height)}</span>
        <span style={{ ...typeV2.note, color: colorsV2.txtMuted }}>
          {state.kind === 'unavailable'
            ? 'USGS did not answer'
            : `Gage height${clock === null ? '' : ` at ${clock}`}${state.kind === 'stale' ? ', too old to stand for now' : ''}`}
        </span>
      </div>
      {change === null ? null : <p style={{ ...typeV2.body, color: colorsV2.txt2 }}>{change}</p>}
      <div style={stack(spacing.micro)}>
        <span style={{ ...typeV2.gaugeLabel, color: colorsV2.txtMuted }}>
          {reading.spot} · line {formatFt(reading.reachable_at_or_below_ft)}
        </span>
        <p style={{ ...typeV2.body, color: wordColor }}>{spotWord(state)}</p>
      </div>
      <p style={typeV2.note}>
        {reading.line_source}. USGS readings are provisional. A guide from one day, not a safety call — look at the
        water before you cross.
      </p>
    </section>
  )
}

/** The Overview's line: one per gauge that `overviewShows`, nothing otherwise. */
export function RiverOverviewLines({
  readings,
  nowMs,
  utcOffsetSeconds,
}: {
  readings: readonly RiverGaugeReading[]
  nowMs: number
  utcOffsetSeconds: number | null
}) {
  const shown = readings.filter((r) => overviewShows(riverState(r, nowMs)))
  if (shown.length === 0) return null
  return (
    <div style={stack(spacing.listGapSm)}>
      {shown.map((r) => {
        const { label, value } = overviewLine(r, nowMs, utcOffsetSeconds)
        const high = riverState(r, nowMs).kind === 'high'
        return (
          <div key={r.site + r.spot} style={high ? alertSurface : { ...cardV2 }}>
            <p style={{ ...typeV2.gaugeLabel, color: high ? colors.poor : colorsV2.txtMuted }}>{label}</p>
            <p style={{ ...typeV2.body, marginTop: `${spacing.micro}px` }}>{value}</p>
          </div>
        )
      })}
    </div>
  )
}
