import { useState } from 'react'
import { spacing } from '@weatherteam6/design/tokens'
import {
  EM_DASH,
  SCORE_COMPONENT_MAX,
  summarizeConditions,
  type ConditionsScore,
} from '@weatherteam6/types'
import { type } from '../theme/tokens.css.js'
import { bareButton, card, row, stack } from '../theme/styles.js'

/**
 * The score and its breakdown — **the last section on the detail screen, and
 * collapsed by default.** This is the one place a score is allowed to be
 * prominent, because the user has scrolled to it deliberately (§3).
 *
 * The section is not rendered at all for a non-climbing location. A rock-drying
 * score for a city is meaningless, and presenting one is the same class of
 * error the copy rules exist to prevent. That decision is the caller's — this
 * component is only mounted when it applies.
 *
 * The state label and suppression come from `@weatherteam6/types` so the bot
 * and the Mini App share one implementation (§7). Nothing here re-derives them.
 */

const COMPONENT_ROWS: { key: keyof typeof SCORE_COMPONENT_MAX; label: string }[] = [
  { key: 'drying', label: 'Drying time' },
  { key: 'rain', label: 'Upcoming rain' },
  { key: 'wind', label: 'Wind' },
  { key: 'temp', label: 'Temperature' },
  { key: 'humidity', label: 'Humidity' },
]

function componentValue(
  score: ConditionsScore,
  key: keyof typeof SCORE_COMPONENT_MAX,
): number | null {
  switch (key) {
    case 'drying':
      return score.component_drying_time
    case 'rain':
      return score.component_upcoming_rain
    case 'wind':
      return score.component_wind
    case 'temp':
      return score.component_temp
    case 'humidity':
      return score.component_humidity
  }
}

export function ScoreSection({
  score,
  severeAlertEvent,
}: {
  score: ConditionsScore
  severeAlertEvent: string | null
}) {
  const [open, setOpen] = useState(false)

  const summary = summarizeConditions({
    score: score.score,
    confidence: score.confidence,
    components: {
      drying: score.component_drying_time,
      rain: score.component_upcoming_rain,
      wind: score.component_wind,
      temp: score.component_temp,
      humidity: score.component_humidity,
    },
    severeAlertEvent,
  })

  return (
    <section style={{ ...card, ...stack(spacing.cellPad) }}>
      <span style={type.label}>Conditions score</span>

      {/* When suppression is in force `label` is null and must stay unrendered —
          substituting a label here is exactly what the rule prevents. */}
      {summary.label === null ? null : <span style={type.cardTitle}>{summary.label}</span>}
      {summary.scoreLine === null ? null : <span style={type.bodyMd}>{summary.scoreLine}</span>}


      <button type="button" style={{ ...bareButton, ...type.label }} onClick={() => setOpen(!open)}>
        {open ? 'Hide breakdown' : 'Show breakdown'}
      </button>

      {open ? (
        <div style={stack(spacing.listGapSm)}>
          {COMPONENT_ROWS.map(({ key, label }) => {
            const value = componentValue(score, key)
            return (
              <div key={key} style={{ ...row(spacing.chipGapMd), justifyContent: 'space-between' }}>
                <span style={type.bodyMd}>{label}</span>
                <span style={type.calDay}>
                  {value === null ? EM_DASH : value} / {SCORE_COMPONENT_MAX[key]}
                </span>
              </div>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
