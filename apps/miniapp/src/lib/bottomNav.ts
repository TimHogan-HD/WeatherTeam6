import { bottomNav } from '@weatherteam6/design/tokens'

export type NavTab = (typeof bottomNav.tabs)[number]
export type SectionKey = NavTab['key']

/**
 * Which section a path belongs to, and whether the bar shows over it.
 *
 * A saved location and its guidebook screens are inside Conditions, which is
 * where they are opened from. `/add`, `/feedback` and a location's editor are
 * tasks you finish and leave (`miniapp-design-v1.md` §9), so they carry their
 * own back control and no bar; `null` is that answer. Anything unrecognised is
 * Conditions, because `App` sends an unknown path to `/`.
 */
export function sectionFor(pathname: string): SectionKey | null {
  if (pathname === '/add' || pathname === '/feedback' || /^\/location\/[^/]+\/edit$/.test(pathname)) return null
  for (const tab of bottomNav.tabs) {
    if (tab.route !== '/' && (pathname === tab.route || pathname.startsWith(`${tab.route}/`))) return tab.key
  }
  return 'conditions'
}

/** A section's first screen: the path its tab opens. */
export function isSectionRoot(pathname: string): boolean {
  return bottomNav.tabs.some((t) => t.route === pathname)
}

/**
 * Where a screen opens, given the scroll position it was last left at.
 *
 * A section's first screen keeps its place however you come back to it, as a
 * phone app's tabs do: the list after a location, by the lit tab or by the
 * phone's back. Any other screen keeps its place only on back (`POP`) and
 * otherwise opens at its top, so a wall opened from far down the Crag tab
 * does not land halfway down its own route list.
 */
export function arrivalScrollY(pathname: string, navigation: 'POP' | 'PUSH' | 'REPLACE', saved: number | undefined): number {
  if (saved === undefined) return 0
  return navigation === 'POP' || isSectionRoot(pathname) ? saved : 0
}

export type NavGeometry = {
  /** Each tab's width, in `bottomNav.tabs` order. */
  widths: number[]
  /** The lit pill's left and right insets inside the row. */
  pill: { left: number; right: number }
}

/**
 * The lit tab is exactly as wide as its pill — icon, label and padding
 * (`pillW`) — and the other four share what is left. So the pill has somewhere
 * definite to slide to, which a row of equal tabs would not give it: an equal
 * slot is too narrow for "Conditions" and too wide for "Map".
 *
 * A row too narrow for the pill leaves the unlit tabs at zero rather than
 * negative; nothing that narrow is a phone this app supports.
 */
export function navGeometry(rowWidth: number, active: SectionKey): NavGeometry {
  const tabs = bottomNav.tabs
  const lit = tabs.find((t) => t.key === active) ?? tabs[0]
  const rest = Math.max(0, (rowWidth - lit.pillW - bottomNav.gap * (tabs.length - 1)) / (tabs.length - 1))
  const widths = tabs.map((t) => (t.key === lit.key ? lit.pillW : rest))
  let left = 0
  for (const t of tabs) {
    if (t.key === lit.key) break
    left += rest + bottomNav.gap
  }
  return { widths, pill: { left, right: rowWidth - left - lit.pillW } }
}
