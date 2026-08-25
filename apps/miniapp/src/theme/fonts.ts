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
function toCssFamilyName(expoFamily: string): string {
  return expoFamily.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
}

function quoted(family: string): string {
  return `"${toCssFamilyName(family)}"`
}

/**
 * Real fallback stacks, not a bare family name: Google Fonts can fail to load
 * inside a Telegram webview and the layout has to stay legible when it does.
 * The display face is condensed, so its fallbacks are condensed too.
 */
export const fontStacks = {
  display: `${quoted(fonts.display)}, "Arial Narrow", "Helvetica Neue Condensed", system-ui, sans-serif`,
  body: `${quoted(fonts.body)}, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`,
} as const

/** Maps an `expo-font` family token onto the stack the web should use for it. */
export function stackForFamily(expoFamily: string): string {
  return expoFamily === fonts.display ? fontStacks.display : fontStacks.body
}
