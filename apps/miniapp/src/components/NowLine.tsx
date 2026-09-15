import { colors, spacing, radius } from '@weatherteam6/design/tokens'
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
 */

export type NowLineProps = {
  /** The hour covering now, or `null` when the run does not reach it. */
  hour: HourlySample | null
  /** Today's row, for the high and low. `null` when the feed starts tomorrow. */
  today: ForecastSnapshot | null
  /**
   * Suppresses the score chip. Non-null means a Severe+ alert is active.
   *
   * **The chip is dropped entirely, not recoloured.** A score beside an active
   * warning is the exact state §7's suppression rule exists to prevent — a
   * 103 °F day under an Excessive Heat Warning reading as a number a climber
   * might act on. The banner directly above says what is happening instead.
   */
  severeAlertEvent: string | null
  /**
   * Whether the alerts query has settled.
   *
   * **The chip waits for it, and that is not a nicety.** `severeAlertEvent`
   * answers `null` for a query still in flight exactly as it does for "no
   * severe alert", and `AlertBanner` renders nothing in that window — so a
   * location under an Excessive Heat Warning would show a lime score chip with
   * no banner above it, and then have both change. Defect class 7, and the
   * score section below already guards on the same thing for the same reason.
   */
  alertsPending: boolean
  /** Hides the chip for a location that has no score at all — a city. */
  showScore: boolean
}

function Chip({ score, confidence }: { score: number; confidence?: string }) {
  return (
    <span
      style={{
        ...row(spacing.chipGap),
        alignItems: 'baseline',
        backgroundColor: colors.goodTint,
        borderStyle: 'solid',
        borderWidth: '1px',
        borderColor: colors.goodTintBorder,
        borderRadius: `${radius.chipMd}px`,
        padding: `${spacing.tight}px ${spacing.inlineGap}px`,
      }}
    >
      <span style={{ ...type.cardTitle, color: colors.good }}>{score}</span>
      {confidence === undefined ? null : (
        <span style={{ ...type.labelSm }}>{confidence}</span>
      )}
    </span>
  )
}

export function NowLine({
  hour,
  today,
  severeAlertEvent,
  alertsPending,
  showScore,
}: NowLineProps) {
  const score = today?.score
  const chipVisible =
    showScore &&
    !alertsPending &&
    severeAlertEvent === null &&
    score !== null &&
    score !== undefined

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

      {chipVisible ? <Chip score={score} {...(today?.confidence === undefined ? {} : { confidence: today.confidence })} /> : null}
    </section>
  )
}
