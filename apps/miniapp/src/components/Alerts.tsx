import { colors, spacing } from '@weatherteam6/design/tokens'
import { isSevereAlert, type WeatherAlert } from '@weatherteam6/types'
import { type } from '../theme/tokens.css.js'
import { alertSurface, stack } from '../theme/styles.js'
import { sortBySeverity } from '../lib/forecast.js'

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

/** Full-width banner for the detail screen. Event, severity, and the NWS headline. */
export function AlertBanner({ alerts }: { alerts: readonly WeatherAlert[] }) {
  if (alerts.length === 0) return null

  return (
    <div style={stack(spacing.listGapSm)}>
      {sortBySeverity(alerts).map((alert) => (
        <div key={alert.id} style={alertSurface}>
          <p style={{ ...type.labelSm, color: colors.poor }}>
            {alert.event} · {alert.severity}
          </p>
          {alert.headline !== null && alert.headline !== '' ? (
            <p style={{ ...type.bodySm, marginTop: `${spacing.micro}px` }}>{alert.headline}</p>
          ) : null}
        </div>
      ))}
    </div>
  )
}

/**
 * The list card's pill: event name only (§3). Tapping the card, not the pill,
 * opens detail — so this is not interactive.
 */
export function AlertPill({ alerts }: { alerts: readonly WeatherAlert[] }) {
  const alert = sortBySeverity(alerts)[0]
  if (alert === undefined) return null

  return (
    <span
      style={{
        ...alertSurface,
        display: 'inline-block',
        padding: `${spacing.micro}px ${spacing.inlineGap}px`,
        ...type.labelSm,
        color: colors.poor,
      }}
    >
      {alert.event}
    </span>
  )
}

/** Whether any of these alerts triggers §7's suppression rule. */
export function hasSevereAlert(alerts: readonly WeatherAlert[] | undefined): boolean {
  return alerts?.some((a) => isSevereAlert(a.severity)) ?? false
}
