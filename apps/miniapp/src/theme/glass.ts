/**
 * The hybrid look's glass, composed for the web from `glass` in
 * `@weatherteam6/design/tokens` (`docs/handoffs/miniapp-hybrid-transition-v1.md`).
 *
 * Every pane's fill and blur is a custom property, not an inline value, so one
 * `prefers-reduced-transparency` block in `cssVars.ts` turns every pane opaque
 * at once. Light and shadow stay inline: they read the same either way.
 *
 * Imported by `vite.config.ts` through `cssVars.ts`, so it stays free of DOM
 * and React runtime imports.
 */
import type { CSSProperties } from 'react'
import { glass, radius, spacing } from '@weatherteam6/design/tokens'
import { withOpacity } from './tokens.css.js'

type Pane = 'card' | 'header' | 'dock' | 'bar'
type Layer = { inset: boolean; y: number; blur: number; spread: number; of: 'light' | 'shade'; alpha: number }

const PANE_COLOUR: Record<Pane, string> = {
  card: glass.tint,
  dock: glass.tint,
  header: glass.ground,
  bar: glass.groundMid,
}

function fill(pane: Pane): string {
  const { fillTop, fillBottom } = glass[pane]
  const colour = PANE_COLOUR[pane]
  return `linear-gradient(${withOpacity(colour, fillTop)}, ${withOpacity(colour, fillBottom)})`
}

function layers(list: readonly Layer[]): string {
  return list
    .map((l) => {
      const colour = withOpacity(l.of === 'light' ? glass.light : glass.shade, l.alpha)
      return `${l.inset ? 'inset ' : ''}0 ${l.y}px ${l.blur}px ${l.spread}px ${colour}`
    })
    .join(', ')
}

/** The custom properties, as `glass-*` names: the see-through set, and the one for less transparency. */
export function glassVars(): { normal: Record<string, string>; opaque: Record<string, string> } {
  const panes: Pane[] = ['card', 'header', 'dock', 'bar']
  const normal: Record<string, string> = {
    // The ground is still: a glow at the top of the screen falling to near-black.
    ground: `radial-gradient(130% 60% at 50% -8%, ${glass.groundGlow} 0%, ${glass.groundMid} 48%, ${glass.ground} 100%)`,
  }
  const opaque: Record<string, string> = {}
  for (const pane of panes) {
    const { blurPx, saturatePct } = glass[pane]
    normal[`${pane}Fill`] = fill(pane)
    normal[`${pane}Filter`] = `blur(${blurPx}px) saturate(${saturatePct}%)`
    const solid = withOpacity(PANE_COLOUR[pane], glass.opaqueFill)
    opaque[`${pane}Fill`] = `linear-gradient(${solid}, ${solid})`
    opaque[`${pane}Filter`] = 'none'
  }
  return { normal, opaque }
}

const v = (name: string) => `var(--wt6-glass-${name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()})`

function pane(name: Pane): CSSProperties {
  return {
    backgroundImage: v(`${name}Fill`),
    backdropFilter: v(`${name}Filter`),
    WebkitBackdropFilter: v(`${name}Filter`),
  }
}

const sheen = `radial-gradient(140% 90% at 25% -25%, ${withOpacity(glass.light, glass.sheen)}, ${withOpacity(glass.light, 0)} 58%), radial-gradient(90% 60% at 100% 115%, ${withOpacity(glass.light, glass.sheenLow)}, ${withOpacity(glass.light, 0)} 60%)`

/**
 * A section card: frosted, lit along its top edge, a hairline rim. The rim is
 * a real border rather than a shadow so a chosen card (a trip's crag) can
 * recolour it; a card that sets `backgroundColor` keeps the glass over its tint.
 */
export const glassCard: CSSProperties = {
  ...pane('card'),
  backgroundImage: `${sheen}, ${v('cardFill')}`,
  borderStyle: 'solid',
  borderWidth: '1px',
  borderColor: withOpacity(glass.light, glass.rim),
  borderRadius: `${radius.glassCard}px`,
  boxShadow: layers(glass.cardLayers),
  padding: `${spacing.sectionGap}px`,
}

/** The slim header that sticks to the top of a crag's tabs. */
export const glassHeader: CSSProperties = { ...pane('header'), boxShadow: layers(glass.headerLayers) }

/** The crag's floating dock. */
export const glassDock: CSSProperties = {
  ...pane('dock'),
  borderRadius: `${radius.full}px`,
  boxShadow: layers(glass.dockLayers),
}

/** The app's bottom bar. */
export const glassBar: CSSProperties = { ...pane('bar'), boxShadow: layers(glass.barLayers) }
