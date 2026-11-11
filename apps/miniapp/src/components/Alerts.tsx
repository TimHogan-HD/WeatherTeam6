import { colors, colorsV2, spacing } from '@weatherteam6/design/tokens'
import type { WeatherAlert } from '@weatherteam6/types'
import { type } from '../theme/tokens.css.js'
import { alertSurface, stack } from '../theme/styles.js'
import { ALERTS_UNCHECKED_LINE, alertParagraphs, alertUntil, sortBySeverity } from '../lib/forecast.js'

/**
 * Alerts outrank everything and render above the score on every surface (§7
 * rule 5). A Severe+ alert is never omitted for space.
 *
 * The mockup's alert card uses its own orange hex; the palette has no such
 * token, and the token-source rule outranks the mockup's raw value. The tint
 * and border are derived from `colors.poor` at the same opacities the other
 * tints use — see `theme/styles.ts`.
 *
 * No icon: `alert-triangle` is outside the mockup's 1:1 icon map, and
 * §Design System requires matching it exactly (§8).
 */

/**
 * Full-width banner for the detail screen. Event, severity, the NWS headline,
 * and the hazard's end on the crag's clock (#482). An alert with a description
 * or an instruction opens on a tap to show them; one with neither is a plain
 * card, never a disclosure that opens on nothing.
 *
 * `utcOffsetSeconds` is the crag's, from `/hourly`; null withholds the end
 * time rather than print it on the reader's clock. `unchecked` adds one quiet
 * line under the banners (`alertsUnchecked`), so a missing check never reads
 * as "no warnings".
 */
export function AlertBanner({
  alerts,
  unchecked = false,
  utcOffsetSeconds = null,
  now,
}: {
  alerts: readonly WeatherAlert[]
  unchecked?: boolean
  utcOffsetSeconds?: number | null
  now: number
}) {
  if (alerts.length === 0 && !unchecked) return null

  return (
    <div style={stack(spacing.listGapSm)}>
      {sortBySeverity(alerts).map((alert) => (
        <AlertCard key={alert.id} alert={alert} utcOffsetSeconds={utcOffsetSeconds} now={now} />
      ))}
      {unchecked ? <p style={{ ...type.bodySm, color: colorsV2.txtMuted }}>{ALERTS_UNCHECKED_LINE}</p> : null}
    </div>
  )
}

function AlertCard({ alert, utcOffsetSeconds, now }: { alert: WeatherAlert; utcOffsetSeconds: number | null; now: number }) {
  const until = alertUntil(alert.ends ?? null, utcOffsetSeconds, now)
  const description = alertParagraphs(alert.description)
  const instruction = alertParagraphs(alert.instruction ?? null)

  const head = (
    <div style={{ flex: 1, minWidth: 0 }}>
      <p style={{ ...type.labelSm, color: colors.poor }}>
        {alert.event} · {alert.severity}
      </p>
      {alert.headline !== null && alert.headline !== '' ? (
        <p style={{ ...type.bodySm, marginTop: `${spacing.micro}px` }}>{alert.headline}</p>
      ) : null}
      {until !== null ? <p style={{ ...type.bodySm, marginTop: `${spacing.micro}px` }}>{until}</p> : null}
    </div>
  )

  if (description.length === 0 && instruction.length === 0) {
    return <div style={alertSurface}>{head}</div>
  }

  return (
    <details className="wt6-alert" style={alertSurface}>
      <summary style={{ display: 'flex', alignItems: 'center', gap: `${spacing.listGapSm}px`, cursor: 'pointer' }}>{head}</summary>
      <div style={{ ...stack(spacing.listGapSm), marginTop: `${spacing.listGapSm}px` }}>
        {description.map((p, i) => (
          <p key={`d${i}`} style={type.bodySm}>
            {p}
          </p>
        ))}
        {instruction.length > 0 ? (
          <>
            <p style={{ ...type.labelSm, color: colors.poor, marginTop: `${spacing.micro}px` }}>What to do</p>
            {instruction.map((p, i) => (
              <p key={`i${i}`} style={type.bodySm}>
                {p}
              </p>
            ))}
          </>
        ) : null}
      </div>
    </details>
  )
}
