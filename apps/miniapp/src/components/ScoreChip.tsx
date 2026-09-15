import { colors, radius, spacing } from '@weatherteam6/design/tokens'
import { scoreUnavailableLine, type ForecastSnapshot } from '@weatherteam6/types'
import { type, withOpacity } from '../theme/tokens.css.js'
import { row } from '../theme/styles.js'
import { scoreColor } from './charts/chartStyle.js'

/**
 * A day's climbing score, as a chip.
 *
 * **Shared by the now-line and the Hourly day pager**, because a score that
 * means one thing at the top of the screen and another halfway down it is two
 * scores. The chip took its colour from `goodTint` wherever it appeared until
 * this was extracted — a lime 34 under the word "Mixed".
 *
 * Three states, and they are three different sentences:
 *
 * - a number, coloured by `SCORE_BANDS`;
 * - **withheld**, when `unavailable_reason` says an input could not be
 *   measured — `scoreUnavailableLine` has the copy, and a withheld day must
 *   never render as a low score;
 * - **nothing at all**, when the date is simply outside the scoring window, or
 *   a Severe+ alert suppresses it, or the alerts query has not settled.
 *
 * The suppression arguments are the caller's because the caller is the thing
 * that knows about alerts; the rules for what to do with them are here, so the
 * two surfaces cannot drift.
 */

export type ScoreChipProps = {
  /** The day this chip is about. `null` when there is no row for it. */
  day: ForecastSnapshot | null | undefined
  /**
   * Non-null means a Severe+ alert is active, and the chip is dropped
   * entirely rather than recoloured. A score beside an active warning is the
   * state §7's suppression rule exists to prevent.
   */
  severeAlertEvent: string | null
  /**
   * Whether the alerts query has settled. **The chip waits for it.**
   * `severeAlertEvent` answers `null` for a query in flight exactly as it does
   * for "no severe alert", so rendering before it settles shows an
   * unsuppressed score under a warning that has not arrived — defect class 7.
   */
  alertsPending: boolean
  /** Hides the chip for a location that has no score at all — a city. */
  showScore: boolean
  /** Written under the number. Omitted where the row above already says it. */
  showConfidence?: boolean
}

export function ScoreChip({
  day,
  severeAlertEvent,
  alertsPending,
  showScore,
  showConfidence = true,
}: ScoreChipProps) {
  if (!showScore || alertsPending || severeAlertEvent !== null || day == null) return null

  const score = day.score
  const reason = day.unavailable_reason

  // Withheld, not low. `null` **with** a reason means an input could not be
  // measured; `null` without one means the date is past the scoring window and
  // there is nothing to say at all.
  if (score === null || score === undefined) {
    if (reason === null || reason === undefined) return null
    return (
      <span style={{ ...type.bodySm, color: colors.txt4 }}>{scoreUnavailableLine(reason)}</span>
    )
  }

  const hue = scoreColor(score)
  return (
    <span
      style={{
        ...row(spacing.chipGap),
        alignItems: 'baseline',
        backgroundColor: withOpacity(hue, 0.1),
        borderStyle: 'solid',
        borderWidth: '1px',
        borderColor: withOpacity(hue, 0.28),
        borderRadius: `${radius.chipMd}px`,
        padding: `${spacing.tight}px ${spacing.inlineGap}px`,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ ...type.cardTitle, color: hue }}>{score}</span>
      {showConfidence && day.confidence !== undefined ? (
        <span style={type.labelSm}>{day.confidence}</span>
      ) : null}
    </span>
  )
}
