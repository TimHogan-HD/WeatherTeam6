import type { CSSProperties, ReactNode } from 'react'
import { radius, spacing } from '@weatherteam6/design/tokens'
import { typeV2 } from '../theme/tokens.css.js'
import { row, stack, wellV2 } from '../theme/styles.js'

/**
 * A figure with its name printed under it — "9 mph" over "Peak wind". One of a
 * row of equal cells, on the list card and in Conditions now. The label is
 * printed rather than keyed by a legend (owner, 2026-09-29): a reader should
 * not have to look elsewhere to learn what a number is.
 *
 * `spoken` replaces both lines for a screen reader when the label alone is too
 * terse to say which figure it is — "Wind today up to 9 mph".
 */
export function LabelledFigure({
  value,
  label,
  color,
  icon,
  spoken,
  labelColor,
  surface = wellV2,
}: {
  value: string
  label: string
  color: string
  icon?: ReactNode
  spoken?: string
  labelColor?: string
  surface?: CSSProperties
}) {
  return (
    <span
      {...(spoken === undefined ? {} : { role: 'img', 'aria-label': spoken })}
      style={{
        ...surface,
        ...stack(spacing.micro),
        borderRadius: `${radius.card}px`,
        flex: '1 1 0',
        minWidth: 0,
        alignItems: 'center',
        padding: `${spacing.chipGapMd}px ${spacing.tight}px`,
      }}
    >
      <span style={row(spacing.tight)}>
        {icon}
        <span style={{ ...typeV2.chip, color, whiteSpace: 'nowrap' }}>{value}</span>
      </span>
      <span style={{ ...typeV2.tileLabel, ...(labelColor === undefined ? {} : { color: labelColor }) }}>{label}</span>
    </span>
  )
}
