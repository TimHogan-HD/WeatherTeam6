import type { ReactNode } from 'react'
import { colorsV2, radius, spacing } from '@weatherteam6/design/tokens'
import type { ConditionsScore, WeatherAlert } from '@weatherteam6/types'
import { typeV2 } from '../theme/tokens.css.js'
import { cardV2, row, toneColors, wellV2, type ToneName } from '../theme/styles.js'
import { cardSummary, readingTone, scoreTone } from '../lib/locationList.js'

/**
 * A reading as a label-and-value pill — never colour alone. A reading with no
 * tone is a neutral well rather than borrowing a hue; a toned one needs no
 * hairline, the tint is its edge.
 */
export function ReadingPill({ label, value, tone }: { label: string; value: string; tone: ToneName | null }) {
  const c = tone === null ? null : toneColors(tone, 'pill')
  return (
    <span
      style={{
        ...row(spacing.tight),
        ...(c === null ? wellV2 : { borderRadius: `${radius.full}px`, backgroundColor: c.background }),
        padding: `${spacing.tight}px ${spacing.listGap}px`,
      }}
    >
      <span style={{ ...typeV2.pill, color: c?.label ?? colorsV2.txtMuted }}>{label}</span>
      <span style={{ ...typeV2.pillValue, color: c?.value ?? colorsV2.txt1 }}>{value}</span>
    </span>
  )
}

/**
 * The crag's readings now, as one line — the guidebook screens' link back to
 * the conditions. **From `/conditions`, through `cardSummary`**, the list
 * card's own path, so a crag cannot read one way on its card and another here;
 * the score is already withheld under a Severe+ alert and while alerts load.
 *
 * Renders nothing while `/conditions` is in flight or has no readings: the
 * strip is a pointer to the Overview, which is where a failure is explained.
 */
export function NowStrip({
  label,
  conditions,
  alerts,
  alertsPending,
  trailing,
}: {
  label: string
  conditions: ConditionsScore | null | undefined
  alerts: readonly WeatherAlert[] | undefined
  alertsPending: boolean
  /** The Overview link, or the day's good hours. */
  trailing: ReactNode
}) {
  const summary = cardSummary(conditions, alerts, alertsPending)
  if (summary === null || summary.readings.length === 0) return null
  const reading = conditions?.readings?.now ?? null
  return (
    <section
      style={{
        ...cardV2,
        ...row(spacing.listGap),
        flexWrap: 'wrap',
        padding: `${spacing.cardPad}px ${spacing.sectionGap}px`,
      }}
    >
      <span style={{ ...typeV2.factLabel, color: colorsV2.txtMuted }}>{label}</span>
      {summary.readings.map((field) => (
        <ReadingPill key={field.label} label={field.label} value={field.value} tone={readingTone(field, reading)} />
      ))}
      {summary.score === null || summary.scoreField === null ? null : (
        <ReadingPill label={summary.scoreField.label} value={summary.scoreField.value} tone={scoreTone(summary.score)} />
      )}
      <span style={{ marginLeft: 'auto' }}>{trailing}</span>
    </section>
  )
}
