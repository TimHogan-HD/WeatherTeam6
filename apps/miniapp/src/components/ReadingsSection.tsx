import type { CSSProperties } from 'react'
import { spacing } from '@weatherteam6/design/tokens'
import { summarizeReadings } from '@weatherteam6/types'
import type {
  ConditionsWindow,
  HourlyReading,
  ReadingsUnavailableReason,
} from '@weatherteam6/types'
import { type } from '../theme/tokens.css.js'
import { card, row, stack } from '../theme/styles.js'
import { ScoreChip } from './ScoreChip.js'

/**
 * The two readings — **the thing this screen is for**, at the top of the Daily
 * tab and again beside the Hourly tab's day pager.
 *
 * It replaces `ScoreSection`, which showed one number and a five-row breakdown
 * of the components behind it. Two things changed and only one of them is
 * layout:
 *
 * - **The words are no longer derived from the number.** `stateLabel(88)` said
 *   *"Dry, settled"* for a 103 °F day, because heat could cost at most 12 of
 *   100 points. The headline here *is* the rock and friction readings, so a
 *   greasy day cannot be given a reassuring phrase by an arithmetic step
 *   downstream.
 * - **The breakdown is gone rather than restyled.** Its five rows were the
 *   five components, which no longer exist; the model has two factors and
 *   publishing their magnitudes is forbidden — the friction one rests on a step
 *   nobody has measured (see `readingsCopy.ts`). What a reader can act on —
 *   when the good hours are — is the window line instead.
 *
 * Every copy decision is `summarizeReadings`, shared with the bot, so the two
 * surfaces cannot drift about the same crag on the same day.
 *
 * **One component for both placements, because they are the same claim about
 * different hours.** The Daily tab describes the hour covering now; the Hourly
 * tab describes the day on screen, through the hour the *server* chose to
 * represent it. Rendering those two differently is how a reader comes to
 * believe they are different kinds of answer.
 *
 * Not rendered at all for a non-climbing location. A rock reading for a city is
 * meaningless; that decision is the caller's and this is only mounted when it
 * applies.
 */

export type ReadingsSectionProps = {
  /** What these readings are about — `Conditions now`, or the day on screen. */
  label: string
  /**
   * The hour being described. `null` when there is none: the run does not reach
   * now, or the day carries no scored hour. **Never substituted** — the day's
   * best hour standing in for a missing "now" would put the sunniest hour of a
   * wet morning on screen as the present reading.
   */
  reading: HourlyReading | null
  /** The day's best contiguous run. `null` when no run cleared the minimum. */
  window: ConditionsWindow | null
  /** Set when there are no readings at all. `reading` and `window` are then null. */
  unavailableReason: ReadingsUnavailableReason | null
  /** The location's own offset, for the window's clock times. Never the viewer's. */
  utcOffsetSeconds: number
  /**
   * Non-null means an active Severe+ alert. It suppresses the **number** and
   * names the alert; the readings stay, because they are the same fact the
   * warning is about. See `summarizeReadings`.
   */
  severeAlertEvent: string | null
  /**
   * Whether the alerts query has settled. **The number waits for it.**
   * `severeAlertEvent` is `null` for a query in flight exactly as it is for "no
   * severe alert", so drawing the score before it settles shows an unsuppressed
   * number under a warning that has not arrived — defect class 7.
   */
  alertsPending: boolean
  /**
   * Drops the card surface, for a placement already inside one. A card nested
   * in a card is two borders and two paddings around one claim.
   */
  bare?: boolean
}

export function ReadingsSection({
  label,
  reading,
  window,
  unavailableReason,
  utcOffsetSeconds,
  severeAlertEvent,
  alertsPending,
  bare = false,
}: ReadingsSectionProps) {
  const summary = summarizeReadings({
    reading,
    window,
    utcOffsetSeconds,
    severeAlertEvent,
    unavailableReason,
  })

  /**
   * The readings themselves are not suppressed by an alert, so they have
   * nothing to wait for: the qualifier arrives beside them a moment later,
   * which adds to what is on screen rather than reversing it. The number is the
   * part that reads as actionable, and it is what waits.
   */
  const score = alertsPending ? null : summary.score

  const surface: CSSProperties = bare ? {} : card

  return (
    <section style={{ ...surface, ...stack(spacing.cellPad) }}>
      <span style={type.label}>{label}</span>

      {summary.unavailableLine !== null ? (
        // A statement about us, never one about the rock. It must not read as
        // "conditions are bad" — that was the whole of issue #34.
        <span style={type.bodyMd}>{summary.unavailableLine}</span>
      ) : (
        <>
          {/*
            The headline is absent when there is no hour to describe. The window
            line below is a different fact about a different span, so it still
            renders — dropping both would leave an empty card.
          */}
          {summary.headline === null ? null : (
            <span style={type.cardTitle}>{summary.headline}</span>
          )}
          {summary.qualifier === null ? null : (
            <span style={type.bodyMd}>{summary.qualifier}</span>
          )}

          {/*
            **The number is secondary, and that is the phase's design rather
            than a styling preference.** It sits at the end of the window line,
            in a chip, at a size the headline above dwarfs. Under a Severe+
            alert `score` is null and the chip draws nothing — the qualifier has
            already named the alert.
          */}
          <div style={{ ...row(spacing.chipGapMd), justifyContent: 'space-between' }}>
            {summary.window === null ? null : (
              <span style={type.bodyMd}>{summary.window}</span>
            )}
            <ScoreChip score={score} />
          </div>

          {/*
            Required copy, not decoration. The friction estimate note is a Phase
            3 acceptance criterion, and the aspect note is what keeps an
            unqualified reading from being read as a measured one.
          */}
          {summary.notes.map((note) => (
            <span key={note} style={type.sourceBadge}>
              {note}
            </span>
          ))}
        </>
      )}
    </section>
  )
}
