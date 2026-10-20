import type { CSSProperties } from 'react'
import { colors, colorsV2, components, glass as glassTokens, radius, spacing } from '@weatherteam6/design/tokens'
import { boxStyle, textStyle, typeV2, withOpacity } from './tokens.css.js'
import { glassCard } from './glass.js'

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
export const btnPrimary: CSSProperties = boxStyle(components.btnPrimary)
export const btnPrimaryText: CSSProperties = textStyle(components.btnPrimaryText)

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

/**
 * A section card: since the hybrid look (owner, 2026-10-19), a frosted glass
 * pane over the still ground (`theme/glass.ts`), with its 16px padding.
 */
export const cardV2: CSSProperties = glassCard

/**
 * A text, date, select or textarea field on the glass (the mockup's
 * `.phone input`). 16px, because iOS zooms the page into any focused control
 * under that.
 */
export const fieldV2: CSSProperties = {
  ...typeV2.body,
  fontSize: '16px',
  color: colorsV2.txt1,
  width: '100%',
  minHeight: '44px',
  boxSizing: 'border-box',
  padding: `${spacing.cellPad}px ${spacing.listGapLg}px`,
  backgroundColor: colorsV2.surface,
  ...hairline(colorsV2.line),
  borderRadius: `${radius.chipMd}px`,
  colorScheme: 'dark',
}

/** A pill-shaped well one step darker than the card — chips, the legend, the sort control. */
export const wellV2: CSSProperties = {
  backgroundColor: colorsV2.surface,
  ...hairline(colorsV2.line),
  borderRadius: `${radius.full}px`,
}

/**
 * The mockup's `.pills`: one choice among a few — a route filter, a sort, a
 * trend view. The chosen one is the hybrid's aqua (owner, 2026-10-19).
 */
export function choicePill(chosen: boolean): CSSProperties {
  return {
    ...bareButton,
    width: 'auto',
    flex: '0 0 auto',
    minHeight: '34px',
    padding: `${spacing.tight}px ${spacing.cellPad}px`,
    borderRadius: `${radius.full}px`,
    border: `1px solid ${chosen ? withOpacity(colorsV2.brandInk, 0.5) : 'transparent'}`,
    backgroundColor: chosen ? withOpacity(colorsV2.brand, 0.14) : colorsV2.surface,
    color: chosen ? colorsV2.brandInk : colorsV2.txt2,
  }
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

/** The mockup's `.pbtn`: a filled aqua pill for a section's main action — "+ New trip", "Create trip". */
export const brandButton: CSSProperties = {
  ...bareButton,
  ...typeV2.brandButton,
  width: 'auto',
  minHeight: '44px',
  padding: `${spacing.listGap}px 18px`,
  borderRadius: `${radius.full}px`,
  backgroundColor: colorsV2.brand,
  textAlign: 'center',
}

/** A lesser action beside or under a `brandButton` — Cancel, Done, Sign out: the unchosen pill. */
export const quietButton: CSSProperties = { ...choicePill(false), ...typeV2.dayPick, color: colorsV2.txt1, textAlign: 'center' }

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
 * Room under a crag's screen for its floating dock: the lift, the dock
 * (a 40px tab, its 4px padding either side, and a 1px rim each side) and a
 * card gap, **plus** the home-indicator inset. The dock sits above the inset
 * rather than in it, so `navClearance`'s larger-of rule left the last line
 * under the dock on a phone with a home indicator.
 */
export const dockClearance = `calc(${glassTokens.dockLift + spacing.cellPad * 4 + spacing.tight * 2 + 2 + spacing.listGapLg}px + env(safe-area-inset-bottom, 0px))`

/** The bottom bar's own height, past the home indicator: where a screen that fills the viewport stops. */
export const navBarHeight = `calc(${spacing.bottomNavH}px + env(safe-area-inset-bottom, 0px))`

/**
 * The top of a section's first screen — Conditions and the bar's other
 * sections. Since the hybrid look it has no fill of its own: the title sits on
 * the still ground. It still runs up under the status bar (`#root` pads by the
 * safe-area inset, and this takes it back) so the content clears the notch.
 */
export const headerBand: CSSProperties = {
  ...stack(spacing.sectionGap),
  marginTop: 'calc(-1 * env(safe-area-inset-top, 0px))',
  paddingTop: `calc(env(safe-area-inset-top, 0px) + ${spacing.topWeb}px)`,
  paddingInline: `${spacing.screenH}px`,
  paddingBottom: `${spacing.sectionGap}px`,
}
