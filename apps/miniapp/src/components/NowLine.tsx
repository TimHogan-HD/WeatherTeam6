import { colors, spacing } from '@weatherteam6/design/tokens'
import {
  formatHumidity,
  formatTempF,
  formatWindMph,
  type ForecastSnapshot,
  type HourlySample,
} from '@weatherteam6/types'
import { type } from '../theme/tokens.css.js'
import { card, row } from '../theme/styles.js'
import { tempColor } from './charts/chartStyle.js'

/**
 * Current conditions as **one line**, not a 36px hero.
 *
 * The hero it replaces led with `temp_c_max` at `type.bigStat` — the largest
 * element on the screen, and a daily *maximum* rather than a present reading.
 * Now the present reading leads, at a size that does not shout, with the day's
 * high and low beside it as the secondary figures they are.
 *
 * **Everything here is labelled as what it is.** `now` comes from the hour of
 * the forecast run covering this moment; `high`/`low` are the day's extremes.
 * The two are never merged into one unlabelled number.
 *
 * **The score chip left this line in Phase 3b** and it was not a layout
 * preference. `ReadingsSection` sits directly below and carries the same
 * number beside the two readings it is derived from; a chip up here repeated it
 * with nothing to read it against, which is how a bare number comes to look
 * like the answer. This line is weather, and the reading is a separate claim.
 */

export type NowLineProps = {
  /** The hour covering now, or `null` when the run does not reach it. */
  hour: HourlySample | null
  /** Today's row, for the high and low. `null` when the feed starts tomorrow. */
  today: ForecastSnapshot | null
}

export function NowLine({ hour, today }: NowLineProps) {
  // Each part is omitted when its value is missing rather than rendered as an
  // em dash: this is a sentence of conditions, and a dash inside one reads as a
  // broken screen where a shorter sentence reads as less to say.
  const meta = [
    hour?.wind_kmh == null ? null : formatWindMph(hour.wind_kmh),
    hour?.humidity_pct == null ? null : `RH ${formatHumidity(hour.humidity_pct)}`,
    hour?.cloud_pct == null ? null : `cloud ${Math.round(hour.cloud_pct)}%`,
  ].filter((s): s is string => s !== null)

  return (
    <section style={{ ...card, ...row(spacing.cellPad), flexWrap: 'wrap' }}>
      {/*
        The present temperature, or nothing at all. A run that does not reach
        this hour has no "now" to show, and borrowing the daily high for the
        slot is the factual error this component was built to stop.
      */}
      {hour?.temp_c == null ? null : (
        <span style={{ ...type.bigStat, fontSize: '22px', color: tempColor(hour.temp_c) }}>
          {formatTempF(hour.temp_c)}
        </span>
      )}

      {meta.length === 0 ? null : (
        <span style={{ ...type.bodySm, flex: 1, minWidth: '110px' }}>{meta.join(' · ')}</span>
      )}

      {/*
        **Labelled, always.** The mockup leaves this pair bare because its
        current temperature is always present to the left, so the two read as
        secondary figures. Ours can be absent — a pending hourly query, the
        `/add` preview, a run that does not reach this hour — and then a bare
        `103°F 79°F` sits alone at the top of the screen with `temp_c_max`
        first, in the slot the 36px hero used to occupy. That is precisely the
        §3 factual error this component exists to stop, distinguished only by
        opacity.
      */}
      {today === null ? null : (
        <span style={{ ...row(spacing.chipGap), ...type.calDay }}>
          <span style={type.labelSm}>High</span>
          <span style={{ color: colors.txt1 }}>{formatTempF(today.temp_c_max)}</span>
          <span style={type.labelSm}>Low</span>
          <span style={{ color: colors.txt4 }}>{formatTempF(today.temp_c_min)}</span>
        </span>
      )}
    </section>
  )
}
