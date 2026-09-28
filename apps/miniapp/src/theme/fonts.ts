import { fonts } from '@weatherteam6/design/tokens'

/**
 * `fonts.display` / `fonts.body` are `expo-font` family names — `BarlowCondensed`,
 * `Barlow`. The CSS family names have a space in them, and passing the token value
 * straight into `font-family` matches nothing and falls back to the system font
 * without saying so (miniapp-design-v1.md §0a).
 *
 * The CSS name is derived from the token rather than restated, so a rename in
 * `packages/design` carries through instead of silently diverging here.
 */
export function toCssFamilyName(expoFamily: string): string {
  // Two splits: an acronym before a word (`IBMPlex` → `IBM Plex`), then a
  // lower-case letter before a capital (`PlexMono` → `Plex Mono`). The first
  // alone would leave `BarlowCondensed` whole; the second alone gives
  // `IBMPlex Mono`, which matches no font and falls back silently.
  return expoFamily
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
}

function quoted(family: string): string {
  return `"${toCssFamilyName(family)}"`
}

/**
 * Real fallback stacks, not a bare family name: Google Fonts can fail to load
 * on a slow or filtered network, and the layout has to stay legible when it does.
 * The display face is condensed, so its fallbacks are condensed too.
 */
export const fontStacks = {
  display: `${quoted(fonts.display)}, "Arial Narrow", "Helvetica Neue Condensed", system-ui, sans-serif`,
  body: `${quoted(fonts.body)}, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
  mono: `${quoted(fonts.mono)}, ui-monospace, "SF Mono", Menlo, Consolas, monospace`,
} as const

/**
 * Maps an `expo-font` family token onto the stack the web should use for it.
 *
 * Throws on anything else rather than defaulting to the body stack. Defaulting
 * would reintroduce exactly what this module exists to prevent: a third or
 * renamed family in `packages/design` would silently drop headings to the
 * non-condensed face, and nothing would report it.
 */
export function stackForFamily(expoFamily: string): string {
  if (expoFamily === fonts.display) return fontStacks.display
  if (expoFamily === fonts.body) return fontStacks.body
  if (expoFamily === fonts.mono) return fontStacks.mono
  throw new Error(
    `No web font stack for family "${expoFamily}". Add one to fontStacks — falling back silently renders the wrong face with no error.`,
  )
}
