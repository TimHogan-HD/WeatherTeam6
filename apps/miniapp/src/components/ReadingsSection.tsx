import type { CSSProperties } from 'react'
import { colors, spacing } from '@weatherteam6/design/tokens'
import { summarizeReadings } from '@weatherteam6/types'
import type {
  ConditionsWindow,
  HourlyReading,
  ReadingField,
  ReadingsUnavailableReason,
} from '@weatherteam6/types'
import { type } from '../theme/tokens.css.js'
import { card, row, stack } from '../theme/styles.js'
import { scoreColor } from './charts/chartStyle.js'

/**
 * The readings — **the thing this screen is for**, at the top of the Daily tab
 * and again beside the Hourly tab's day pager.
 *
 * It replaces `ScoreSection`, which showed one number and a five-row breakdown
 * of the components behind it. Two things changed and only one of them is
 * layout:
 *
 * - **The words are no longer derived from the number.** `stateLabel(88)` said
 *   *"Dry, settled"* for a 103 °F day, because heat could cost at most 12 of
 *   100 points. What is on screen here *is* the rock and friction readings, so
 *   a greasy day cannot be given a reassuring phrase by an arithmetic step
 *   downstream.
 * - **The breakdown is gone rather than restyled.** Its five rows were the five
 *   components, which no longer exist; the model has two factors and publishing
 *   their magnitudes is forbidden — the friction one rests on a step nobody has
 *   measured (see `readingsCopy.ts`).
 *
 * ## It is a gauge, not a paragraph — owner decision 2026-09-21
 *
 * The first version led with a sentence: *"Dry rock · Great friction"*, over
 * two caveat sentences. **Too wordy, and it read as fact.** Three labelled
 * values in a row read the way an instrument reads, which is what these are:
 * `Dryness`, `Friction`, `Score`. The window follows as a fourth labelled fact
 * rather than as advice, and the caveats are fragments on one line.
 *
 * Every copy decision — including the labels — is `summarizeReadings`, shared
 * with the bot, so the two surfaces cannot drift about the same crag on the
 * same day.
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
  /**
   * What these readings are about — the day on screen, on the Hourly tab.
   *
   * `null` when the caller has already named the block this sits in: the
   * Conditions now card heads its weather line and these readings with one
   * label, and a second one halfway down the same card would split "now" into
   * two claims again — the thing that card was built to stop.
   */
  label: string | null
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
   * Whether the alerts query has settled. **The number waits for it**, and the
   * waiting is done by `summarizeReadings` rather than here — this only reports
   * the state. `severeAlertEvent` is `null` for a query in flight exactly as it
   * is for "no severe alert", so a surface that drew the score on its own would
   * show an unsuppressed number under a warning that has not arrived yet
   * (defect class 7).
   */
  alertsPending: boolean
  /**
   * Drops the card surface, for a placement already inside one. A card nested
   * in a card is two borders and two paddings around one claim.
   */
  bare?: boolean
}

/**
 * One labelled reading. The label is small and the value is not — a reader
 * scanning this row is looking for the values, and the labels are what stop
 * them being mistaken for a verdict.
 */
function Stat({ field, valueColor }: { field: ReadingField; valueColor?: string }) {
  return (
    <span style={stack(spacing.micro)}>
      <span style={type.label}>{field.label}</span>
      <span style={{ ...type.scoreMd, color: valueColor ?? colors.txt1 }}>{field.value}</span>
    </span>
  )
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
    alertsPending,
    unavailableReason,
  })

  const surface: CSSProperties = bare ? {} : card

  // Both are null together — the score field exists only when there is a score
  // to put in it — and checking both is what lets the colour be computed from a
  // number TypeScript can see is present.
  const { score, scoreField } = summary

  return (
    <section style={{ ...surface, ...stack(spacing.cellPad) }}>
      {label === null ? null : <span style={type.label}>{label}</span>}

      {summary.unavailableLine !== null ? (
        // A statement about us, never one about the rock. It must not read as
        // "conditions are bad" — that was the whole of issue #34.
        <span style={type.bodyMd}>{summary.unavailableLine}</span>
      ) : (
        <>
          {/*
            The readings, then the number. **The order is the phase's design
            rather than a styling preference**: the score is the third gauge on
            the panel, not the headline the other two explain. Under a Severe+
            alert, and until the alerts query settles, there is no third gauge
            at all and the qualifier below names the alert.

            Nothing at all when there is nothing to read — a row of dashes reads
            as a measurement of nothing.
          */}
          {summary.readings.length === 0 && scoreField === null ? null : (
            <div style={{ ...row(spacing.sectionGap), flexWrap: 'wrap' }}>
              {summary.readings.map((field) => (
                <Stat key={field.label} field={field} />
              ))}
              {score === null || scoreField === null ? null : (
                <Stat field={scoreField} valueColor={scoreColor(score)} />
              )}
            </div>
          )}

          {/*
            The window is a fact about the day, not about this hour, so it is
            labelled separately rather than joining the row above.
          */}
          {summary.window === null ? null : (
            <span style={{ ...row(spacing.chipGap), alignItems: 'baseline' }}>
              <span style={type.label}>{summary.window.label}</span>
              <span style={type.bodyMd}>{summary.window.value}</span>
            </span>
          )}

          {summary.qualifier === null ? null : (
            <span style={type.bodyMd}>{summary.qualifier}</span>
          )}

          {/*
            Required copy, not decoration. The friction estimate note is a Phase
            3 acceptance criterion, and the aspect note is what keeps an
            unqualified reading from being read as a measured one. One line,
            because two sentences stacked under a gauge is the wordiness this
            rework was for.
          */}
          {summary.notes.length === 0 ? null : (
            <span style={type.sourceBadge}>{summary.notes.join(' · ')}</span>
          )}
        </>
      )}
    </section>
  )
}
