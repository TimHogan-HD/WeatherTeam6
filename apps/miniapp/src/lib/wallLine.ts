import {
  sunShadeAt,
  sunShadeOnDay,
  type SunShadeGroup,
  type WallReadings,
} from '@weatherteam6/types'

/**
 * The Overview's sun and shade walls (#445, Phase 2), apart from their markup:
 * the line under the hero (idea 4), the wall sheet's rows, the pinned wall
 * remembered on this device, and Next days' pairs. Pure except for storage, so
 * each rule is reachable by a test.
 *
 * **The pairing is `packages/types`'s** (`sunShadeAt`, `sunShadeOnDay`), so
 * the API and this side cannot group or compare walls differently. A withheld
 * group is a gap, never the other group's number, and the crag's own score
 * stays Crag A's.
 */

/** What the line under the hero says. */
export type WallLine =
  /** Rule 1: the best wall in sun and the best in shade within `SUN_SHADE_ALIKE_POINTS`. */
  | { kind: 'alike' }
  /** The two groups' best walls. A group with no walls, or a withheld one, still takes its half, as a gap. */
  | { kind: 'pair'; sun: SunShadeGroup; shade: SunShadeGroup }
  /** A wall the reader pinned: its own score and whether the sun is on it at that hour. */
  | { kind: 'pinned'; name: string; score: number | null; inSun: boolean | null }

/**
 * The line for the hour the hero prints. `null` when the crag has no walls,
 * or the hour is missing from any wall (`sunShadeAt`'s rule) — nothing is
 * said rather than a pair read from some walls. A pinned wall the response no
 * longer carries reads as Auto.
 */
export function wallLine(walls: readonly WallReadings[], validAt: string, pinned: string | null): WallLine | null {
  if (walls.length === 0) return null
  const wall = pinned === null ? undefined : walls.find((w) => w.name === pinned)
  if (wall !== undefined) {
    const t = Date.parse(validAt)
    const hour = wall.hours.find((h) => Date.parse(h.valid_at) === t)
    return { kind: 'pinned', name: wall.name, score: hour?.score ?? null, inSun: hour === undefined ? null : hour.in_sun }
  }
  const pair = sunShadeAt(walls, validAt)
  if (pair === null) return null
  return pair.alike === true ? { kind: 'alike' } : { kind: 'pair', sun: pair.sun, shade: pair.shade }
}

/** One wall in the sheet. */
export type WallOption = {
  name: string
  /** Wall A's score at the hero's hour; null when unscored or the hour is missing. */
  score: number | null
  /** Null when the hour is missing. */
  inSun: boolean | null
  treeShaded: boolean
  /** Sun hours inside the reader's climbing hours today, from the server's `WallDay`; null without today's row. */
  sunHoursToday: number | null
}

/**
 * Every wall for the sheet, in sun first, then by score, highest first, an
 * unscored wall last in its group. Walls carry no area yet (#293), so the
 * sheet groups by sun and shade at the hour rather than by area.
 */
export function wallOptions(walls: readonly WallReadings[], validAt: string, todayDate: string | null): WallOption[] {
  const t = Date.parse(validAt)
  const rows = walls.map((w): WallOption => {
    const hour = w.hours.find((h) => Date.parse(h.valid_at) === t)
    const day = todayDate === null ? undefined : w.days.find((d) => d.local_date === todayDate)
    return {
      name: w.name,
      score: hour?.score ?? null,
      inSun: hour === undefined ? null : hour.in_sun,
      treeShaded: w.tree_shaded,
      sunHoursToday: day === undefined ? null : day.sun_hours,
    }
  })
  const rank = (o: WallOption) => (o.inSun === true ? 0 : o.inSun === false ? 1 : 2)
  return rows.sort((a, b) => rank(a) - rank(b) || (b.score ?? -1) - (a.score ?? -1) || a.name.localeCompare(b.name))
}

/**
 * `4 sun hours`, `1 sun hour`, `No sun left`, `Under trees`; null without
 * today's row. Today's `sun_hours` counts only hours still ahead.
 */
export function sunHoursText(o: WallOption): string | null {
  if (o.treeShaded) return 'Under trees'
  if (o.sunHoursToday === null) return null
  if (o.sunHoursToday === 0) return 'No sun left'
  return `${o.sunHoursToday} sun ${o.sunHoursToday === 1 ? 'hour' : 'hours'}`
}

/** A day in Next days. */
export type WallDayPair =
  | { kind: 'alike' }
  | { kind: 'pair'; sun: number | null; shade: number | null }

/**
 * A day's pair for Next days (`sunShadeOnDay`, owner's day rule). `alike` and
 * `null` both leave the column on the crag's own day score: `null` when the
 * crag has no walls, the day is missing from any wall, or every wall falls in
 * one group — with nothing to set it against, a lone group is not a pair. A
 * withheld group is a gap.
 */
export function wallDayPair(walls: readonly WallReadings[], localDate: string): WallDayPair | null {
  const pair = sunShadeOnDay(walls, localDate)
  if (pair === null || pair.sun.walls === 0 || pair.shade.walls === 0) return null
  if (pair.alike === true) return { kind: 'alike' }
  return { kind: 'pair', sun: pair.sun.best?.score ?? null, shade: pair.shade.best?.score ?? null }
}

/**
 * The wall pinned per crag on this device (owner, #445: `localStorage`). A
 * wall's name, as `WallReadings.name` gives it. Storage can throw or come back
 * empty (`authToken.ts`); either way the line is on Auto.
 */
const STORAGE_KEY = 'wt6.pinnedWalls'

function readPins(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string') out[k] = v
    return out
  } catch {
    return {}
  }
}

export function pinnedWall(locationId: string): string | null {
  return readPins()[locationId] ?? null
}

/** `null` returns the crag to Auto. */
export function pinWall(locationId: string, name: string | null): void {
  const pins = readPins()
  if (name === null) delete pins[locationId]
  else pins[locationId] = name
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pins))
  } catch {
    // Unavailable storage costs only the pin on the next open.
  }
}
