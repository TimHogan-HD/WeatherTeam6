import type { CSSProperties } from 'react'
import { colors, colorsV2, components, radius, spacing } from '@weatherteam6/design/tokens'
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

// ─────────────────────────────────────────────
// V2 — opaque surfaces on the `colorsV2` ground
// ─────────────────────────────────────────────

const hairline = (color: string): CSSProperties => ({
  borderStyle: 'solid',
  borderWidth: '1px',
  borderColor: color,
})

/** A v2 card: opaque fill, hairline, 16px corners and padding. */
export const cardV2: CSSProperties = {
  backgroundColor: colorsV2.card,
  ...hairline(colorsV2.line),
  borderRadius: `${radius.cardV2}px`,
  padding: `${spacing.sectionGap}px`,
}

/** A pill-shaped well one step darker than the card — chips, the legend, the sort control. */
export const wellV2: CSSProperties = {
  backgroundColor: colorsV2.surface,
  ...hairline(colorsV2.line),
  borderRadius: `${radius.full}px`,
}

/** The status ladder's rungs, as colour. Only ever beside the word or number they colour. */
export type ToneName = 'good' | 'fair' | 'poor'

const TONE: Record<ToneName, { base: string; ink: string }> = {
  good: { base: colors.good, ink: colorsV2.goodInk },
  fair: { base: colors.fair, ink: colorsV2.fairInk },
  poor: { base: colors.poor, ink: colorsV2.poorInk },
}

/**
 * A tinted surface and its two inks: `label` for the word naming the gauge,
 * `value` for what it reads. Lime is the brightest hue, so its tint is lighter
 * than amber's or red's to sit at the same visual weight — the Figma's own
 * 0.10 / 0.16 against 0.18.
 */
export function toneColors(tone: ToneName, surface: 'pill' | 'badge') {
  const { base, ink } = TONE[tone]
  const tint = tone === 'good' ? (surface === 'pill' ? 0.1 : 0.16) : 0.18
  return {
    background: withOpacity(base, tint),
    label: withOpacity(ink, 0.75),
    value: ink,
  }
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

/**
 * The space under a screen's last content: the design's bottom inset, or the
 * phone's home-indicator inset where that is larger — **never both stacked**.
 * `#root` used to add the inset beneath every screen's own padding, which left
 * about 74px of nothing under the last control on an iPhone.
 *
 * The `0px` fallback stays: without it a browser lacking the inset drops the
 * whole declaration, and the design inset with it.
 */
export const bottomClearance = `max(${spacing.bottomInset}px, env(safe-area-inset-bottom, 0px))`

/**
 * The same space on a screen the bottom bar sits over: the bar's own height on
 * top. The bar pads itself past the home indicator, so the larger-of rule above
 * still covers the inset once — this adds the bar, not a second inset.
 */
export const navClearance = `calc(${spacing.bottomNavH}px + ${bottomClearance})`

/**
 * The top band of a section's first screen — Conditions and the bar's other
 * sections. It runs up under the status bar: `#root` pads by the safe-area
 * inset, and this takes it back so the colour reaches the top edge while the
 * content still clears the notch.
 */
export const headerBand: CSSProperties = {
  ...stack(spacing.sectionGap),
  backgroundColor: colorsV2.surface,
  marginTop: 'calc(-1 * env(safe-area-inset-top, 0px))',
  paddingTop: `calc(env(safe-area-inset-top, 0px) + ${spacing.topWeb}px)`,
  paddingInline: `${spacing.screenH}px`,
  paddingBottom: `${spacing.sectionGap}px`,
}
