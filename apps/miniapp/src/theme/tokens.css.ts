/**
 * Web adapter for `@weatherteam6/design/tokens`.
 *
 * `packages/design` targets React Native (its own header says so). `colors`,
 * `spacing`, `radius`, `uvScale` and `units` are plain data and are imported
 * directly by app code; `type`, `shadow` and `layout` are RN-shaped and are
 * re-expressed here (miniapp-design-v1.md §0a).
 *
 * Every value below **derives** from an import. Nothing restates a literal —
 * that is what keeps this compatible with the architecture rule "never redefine
 * colors, spacing, or type scale in an app".
 */
import type { CSSProperties } from 'react'
import {
  layout as rnLayout,
  shadow as rnShadow,
  type as rnType,
} from '@weatherteam6/design/tokens'
import { stackForFamily } from './fonts.js'

function px(n: number): string {
  return `${n}px`
}

// ─────────────────────────────────────────────
// COLOR MATH (for shadow → box-shadow)
// ─────────────────────────────────────────────

type Rgba = { r: number; g: number; b: number; a: number }

function parseColor(color: string): Rgba | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(color)
  if (hex) {
    const [, body] = hex
    if (body === undefined) return null
    const v = Number.parseInt(body, 16)
    return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff, a: 1 }
  }

  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(color)
  if (rgb) {
    const [, r, g, b, a] = rgb
    if (r === undefined || g === undefined || b === undefined) return null
    return { r: Number(r), g: Number(g), b: Number(b), a: a === undefined ? 1 : Number(a) }
  }

  return null
}

/**
 * RN carries opacity as a separate `shadowOpacity` prop; CSS has to fold it into
 * the color. An alpha already present in the token colour is multiplied, not
 * replaced, so `goodDot` (a 0.6-alpha colour at opacity 1) keeps its 0.6.
 */
function withOpacity(color: string, opacity: number): string {
  const parsed = parseColor(color)
  if (parsed === null) return color
  const alpha = Number((parsed.a * opacity).toFixed(3))
  return `rgba(${parsed.r},${parsed.g},${parsed.b},${alpha})`
}

// ─────────────────────────────────────────────
// TYPE — RN text styles → CSSProperties
// ─────────────────────────────────────────────

type RnTextStyle = {
  fontFamily?: string
  fontSize?: number
  /** RN wants a string; CSS is happier with the number. */
  fontWeight?: string
  /** RN measures tracking in points, CSS in px at the same scale. */
  letterSpacing?: number
  lineHeight?: number
  color?: string
  textTransform?: 'uppercase'
  marginTop?: number
}

export function textStyle(t: RnTextStyle): CSSProperties {
  const out: CSSProperties = {}
  if (t.fontFamily !== undefined) out.fontFamily = stackForFamily(t.fontFamily)
  if (t.fontSize !== undefined) out.fontSize = px(t.fontSize)
  if (t.fontWeight !== undefined) out.fontWeight = Number(t.fontWeight)
  if (t.letterSpacing !== undefined) out.letterSpacing = px(t.letterSpacing)
  if (t.lineHeight !== undefined) out.lineHeight = px(t.lineHeight)
  if (t.color !== undefined) out.color = t.color
  if (t.textTransform !== undefined) out.textTransform = t.textTransform
  if (t.marginTop !== undefined) out.marginTop = px(t.marginTop)
  return out
}

export const type: { [K in keyof typeof rnType]: CSSProperties } = Object.fromEntries(
  Object.entries(rnType).map(([name, style]) => [name, textStyle(style)]),
) as { [K in keyof typeof rnType]: CSSProperties }

// ─────────────────────────────────────────────
// BOX — RN view styles → CSSProperties
// ─────────────────────────────────────────────

type RnBoxStyle = {
  flex?: number
  flexDirection?: 'row' | 'column'
  alignItems?: 'center' | 'flex-start' | 'flex-end' | 'stretch'
  justifyContent?: 'center' | 'flex-start' | 'flex-end' | 'space-between'
  gap?: number
  padding?: number
  paddingHorizontal?: number
  paddingVertical?: number
  paddingTop?: number
  marginTop?: number
  width?: number
  height?: number
  borderWidth?: number
  borderColor?: string
  borderRadius?: number
  backgroundColor?: string
}

/**
 * Exported so Task 6 can convert individual `components` entries as it needs
 * them. `components` is deliberately *not* pre-converted here: several entries
 * mix text and box props (`btnPrimaryText` spreads `type.navLabel`), so §0a's
 * "audit per-entry" applies and a blanket conversion would be wrong.
 */
export function boxStyle(b: RnBoxStyle): CSSProperties {
  const out: CSSProperties = {}
  if (b.flex !== undefined) out.flex = b.flex
  if (b.flexDirection !== undefined) out.flexDirection = b.flexDirection
  if (b.alignItems !== undefined) out.alignItems = b.alignItems
  if (b.justifyContent !== undefined) out.justifyContent = b.justifyContent
  if (b.gap !== undefined) out.gap = px(b.gap)
  if (b.padding !== undefined) out.padding = px(b.padding)
  if (b.paddingHorizontal !== undefined) out.paddingInline = px(b.paddingHorizontal)
  if (b.paddingVertical !== undefined) out.paddingBlock = px(b.paddingVertical)
  if (b.paddingTop !== undefined) out.paddingTop = px(b.paddingTop)
  if (b.marginTop !== undefined) out.marginTop = px(b.marginTop)
  if (b.width !== undefined) out.width = px(b.width)
  if (b.height !== undefined) out.height = px(b.height)
  if (b.borderWidth !== undefined) out.borderWidth = px(b.borderWidth)
  if (b.borderColor !== undefined) out.borderColor = b.borderColor
  if (b.borderRadius !== undefined) out.borderRadius = px(b.borderRadius)
  if (b.backgroundColor !== undefined) out.backgroundColor = b.backgroundColor
  // RN views are flex containers by default; CSS blocks are not. Any style that
  // sets a flex property has to say `display: flex` for it to mean anything.
  if (
    b.flexDirection !== undefined ||
    b.alignItems !== undefined ||
    b.justifyContent !== undefined ||
    b.gap !== undefined
  ) {
    out.display = 'flex'
  }
  return out
}

export const layout: { [K in keyof typeof rnLayout]: CSSProperties } = Object.fromEntries(
  Object.entries(rnLayout).map(([name, style]) => [name, boxStyle(style)]),
) as { [K in keyof typeof rnLayout]: CSSProperties }

// ─────────────────────────────────────────────
// SHADOW — RN shadow props → box-shadow
// ─────────────────────────────────────────────

type RnShadow = {
  shadowColor: string
  shadowOffset: { width: number; height: number }
  shadowOpacity: number
  shadowRadius: number
}

/**
 * These are glows, not drop shadows — zero offset, zero spread. `shadowRadius`
 * maps to the CSS blur radius 1:1; the two are not identical in general, but at
 * zero offset the difference is not visible at these sizes.
 */
export function boxShadow(s: RnShadow): string {
  return `${px(s.shadowOffset.width)} ${px(s.shadowOffset.height)} ${px(s.shadowRadius)} ${withOpacity(s.shadowColor, s.shadowOpacity)}`
}

export const shadow: { [K in keyof typeof rnShadow]: string } = Object.fromEntries(
  Object.entries(rnShadow).map(([name, value]) => [name, boxShadow(value)]),
) as { [K in keyof typeof rnShadow]: string }
