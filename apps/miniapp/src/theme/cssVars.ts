/**
 * Emits the design tokens once as CSS custom properties on `:root`.
 *
 * §Design System's "no CSS vars" rule is React Native implementation detail and
 * is replaced for the Mini App by miniapp-design-v1.md §8 — custom properties
 * are required here, because Telegram injects its own `--tg-*` set alongside.
 *
 * This module is imported by `vite.config.ts` and served to the app through the
 * `virtual:wt6-tokens.css` module, so the block lands in the bundled stylesheet
 * in `<head>` rather than being injected after first paint. It must therefore
 * stay free of DOM and React imports.
 */
import { colors, radius, spacing } from '@weatherteam6/design/tokens'
import { fontStacks } from './fonts.js'
import { shadow } from './tokens.css.js'

const PREFIX = '--wt6'

function kebab(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

function declarations(group: string, entries: Record<string, string>): string[] {
  return Object.entries(entries).map(
    ([name, value]) => `${PREFIX}-${group}-${kebab(name)}: ${value};`,
  )
}

function asPx(entries: Record<string, number>): Record<string, string> {
  return Object.fromEntries(Object.entries(entries).map(([name, value]) => [name, `${value}px`]))
}

/** The `:root` block, derived entirely from `@weatherteam6/design/tokens`. */
export function renderTokenCss(): string {
  const lines = [
    ...declarations('color', colors),
    ...declarations('space', asPx(spacing)),
    ...declarations('radius', asPx(radius)),
    ...declarations('shadow', shadow),
    ...declarations('font', fontStacks),
  ]
  return `:root {\n${lines.map((line) => `  ${line}`).join('\n')}\n}\n`
}

/** `var(--wt6-color-good)` etc. — for the rare case a value is needed from TS. */
export function cssVar(group: string, name: string): string {
  return `var(${PREFIX}-${group}-${kebab(name)})`
}
