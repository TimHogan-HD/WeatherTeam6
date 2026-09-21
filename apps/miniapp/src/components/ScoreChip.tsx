import { colors, radius, spacing } from '@weatherteam6/design/tokens'
import { readingsUnavailableLine, type ReadingsUnavailableReason } from '@weatherteam6/types'
import { type, withOpacity } from '../theme/tokens.css.js'
import { row } from '../theme/styles.js'
import { scoreColor } from './charts/chartStyle.js'

/**
 * A score, as a chip.
 *
 * **Shared by the readings section and the Hourly day pager**, because a score
 * that means one thing at the top of the screen and another halfway down it is
 * two scores. The chip took its colour from `goodTint` wherever it appeared
 * until this was extracted — a lime 34 under the word "Mixed".
 *
 * ## It is a renderer, not a decision
 *
 * It used to hold the suppression rules as well, and take a whole
 * `ForecastSnapshot` to read them from. Under the v2 model the suppression
 * decision belongs with the words — `summarizeReadings` drops the number under
 * a Severe+ alert, because the number is the part that reads as actionable —
 * and a second copy of that rule here could only disagree with the first.
 *
 * So this draws three states and decides none of them:
 *
 * - a number, coloured by `SCORE_BANDS`;
 * - **withheld**, when `unavailableReason` says the model could not read the
 *   rock — never as a low score, which is a real and different answer;
 * - **nothing at all**, for a null score with no reason. That covers the date
 *   being outside the window, a suppressed number, and an alerts query that has
 *   not settled. The caller passes `null` for all three.
 */

export type ScoreChipProps = {
  /**
   * 0-100, or `null` for "do not draw one".
   *
   * **`undefined` is not a score either**, and is treated as null: the API and
   * the Mini App deploy separately, so a response from before a field existed
   * arrives with it absent rather than null.
   */
  score: number | null | undefined
  /**
   * Why there is no score, when it was withheld rather than simply absent.
   * Only read when `score` is null.
   */
  unavailableReason?: ReadingsUnavailableReason | null
}

export function ScoreChip({ score, unavailableReason }: ScoreChipProps) {
  if (score === null || score === undefined) {
    // Withheld, not low. A reason means the model could not read this spot;
    // no reason means there is nothing to say at all.
    if (unavailableReason === null || unavailableReason === undefined) return null
    return (
      <span style={{ ...type.bodySm, color: colors.txt4 }}>
        {readingsUnavailableLine(unavailableReason)}
      </span>
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
    </span>
  )
}
