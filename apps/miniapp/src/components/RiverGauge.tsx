import { colors, colorsV2, spacing } from '@weatherteam6/design/tokens'
import { riverState, type RiverGaugeReading } from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { alertSurface, cardV2, stack } from '../theme/styles.js'
import { overviewLine, overviewShows } from '../lib/riverGauge.js'

/**
 * A river gauge's Overview line (#589 moved the card itself to the Precip
 * tab's Gauges card): shown only when the river is above the spot's line or
 * the reading is missing (owner, 2026-11-09). A reading beside the score,
 * never part of it. One line per gauge that `overviewShows`, nothing otherwise.
 */
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
