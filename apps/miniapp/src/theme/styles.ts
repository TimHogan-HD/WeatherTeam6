import type { CSSProperties } from 'react'
import { colors, components, radius, spacing } from '@weatherteam6/design/tokens'
import { boxStyle, textStyle, withOpacity } from './tokens.css.js'

/**
 * The `components` entries this app actually uses, converted per-entry.
 *
 * §0a says to audit `components` entry by entry rather than converting the
 * whole object, because several entries mix text and box properties. This is
 * that audit: every entry below was checked against `boxStyle`'s or
 * `textStyle`'s key set, and the converters throw rather than silently drop an
 * unmapped property, so a new token property surfaces here as an error.
 */

export const card: CSSProperties = boxStyle(components.card)
export const cardActive: CSSProperties = boxStyle(components.cardActive)
export const inputBox: CSSProperties = boxStyle(components.input)
export const chip: CSSProperties = boxStyle(components.layerChip)
export const chipActive: CSSProperties = boxStyle(components.layerChipActive)
export const btnPrimary: CSSProperties = boxStyle(components.btnPrimary)
export const btnPrimaryText: CSSProperties = textStyle(components.btnPrimaryText)
export const sourceBadge: CSSProperties = boxStyle(components.sourceBadge)

/**
 * The alert surface. The palette has `goodTint`, `fairTint` and `sunTint` but
 * no `poorTint`, so the tint and the border are derived from `colors.poor` at
 * the same opacities the other tints use (0.10 fill, 0.28 border) rather than
 * written out as new colour literals.
 */
export const alertSurface: CSSProperties = {
  backgroundColor: withOpacity(colors.poor, 0.1),
  borderStyle: 'solid',
  borderWidth: '1px',
  borderColor: withOpacity(colors.poor, 0.28),
  borderRadius: `${radius.chipMd}px`,
  padding: `${spacing.cellPad}px ${spacing.cardPadSm}px`,
}

/** Vertical rhythm helpers. Values come from `spacing`; nothing here invents one. */
export const stack = (gap: number): CSSProperties => ({
  display: 'flex',
  flexDirection: 'column',
  gap: `${gap}px`,
})

export const row = (gap: number): CSSProperties => ({
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'center',
  gap: `${gap}px`,
})

/**
 * A plain `<button>` with the UA chrome removed. Not a token — it neutralises
 * browser defaults so the token styles applied on top are what renders, the
 * same reason `globals.css` resets margins.
 */
export const bareButton: CSSProperties = {
  appearance: 'none',
  background: 'none',
  border: 'none',
  padding: 0,
  margin: 0,
  font: 'inherit',
  color: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  width: '100%',
}
