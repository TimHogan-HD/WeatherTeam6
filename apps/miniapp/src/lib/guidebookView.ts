import {
  ROCK_LABELS,
  windowValue,
  type Guidebook,
  type GuidebookRoute,
  type GuidebookWall,
  type HourlySeries,
  type RockLevel,
  type RouteKind,
} from '@weatherteam6/types'
import { shortDay } from './overview.js'

/**
 * The guidebook screens' decisions, apart from their layout so a node test can
 * reach them (`vitest.config.ts` has no DOM).
 */

/** One numbered dot on the crag's position strip, each axis 0-1. */
export type WallMarker = { id: string; number: number; x: number; y: number }

/**
 * Where each wall sits, from OpenBeta's own coordinates, scaled into a strip.
 * **Numbered in the list's order** (west to east), so a dot and a row share a
 * number. A wall with no point gets no dot, and keeps its number in the list.
 *
 * Both axes share one scale, so the strip keeps the crag's real shape instead
 * of stretching a 300 m bluff to fill the width; `y` runs north at the top.
 * One wall, or walls on a single point, sit in the middle.
 */
export function wallMarkers(walls: readonly GuidebookWall[]): WallMarker[] {
  const placed = walls
    .map((w, i) => ({ w, number: i + 1 }))
    .filter((p): p is { w: GuidebookWall & { lat: number; lon: number }; number: number } =>
      p.w.lat !== null && p.w.lon !== null,
    )
  if (placed.length === 0) return []
  const lat0 = placed.reduce((s, p) => s + p.w.lat, 0) / placed.length
  const kx = Math.cos((lat0 * Math.PI) / 180)
  const xs = placed.map((p) => p.w.lon * kx)
  const ys = placed.map((p) => p.w.lat)
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  const midX = (Math.max(...xs) + Math.min(...xs)) / 2
  const midY = (Math.max(...ys) + Math.min(...ys)) / 2
  const markers = placed.map((p, i) => ({
    id: p.w.id,
    number: p.number,
    x: span === 0 ? 0.5 : 0.5 + ((xs[i] ?? midX) - midX) / span,
    y: span === 0 ? 0.5 : 0.5 - ((ys[i] ?? midY) - midY) / span,
  }))
  // Two walls a few dozen metres apart (Winter Wall and the East End) land on
  // one another and hide a number. Step a later one down, then up, until it is
  // clear — a dot's worth of drift, which the strip is too coarse to misstate.
  for (let i = 1; i < markers.length; i++) {
    const m = markers[i]
    if (m === undefined) continue
    const clashes = () => markers.slice(0, i).some((o) => Math.abs(o.x - m.x) < MIN_GAP && Math.abs(o.y - m.y) < MIN_GAP * 3)
    for (let step = 1; step <= 4 && clashes(); step++) {
      m.y = Math.min(1, Math.max(0, m.y + (step % 2 === 1 ? 1 : -1) * step * MIN_GAP * 1.5))
    }
  }
  return markers
}

/** How close two dots may sit, as a share of the strip's width, before one is moved. */
const MIN_GAP = 0.1

/** The kinds a wall's filter offers, in a fixed order, only those it has. */
export const FILTER_KINDS: readonly RouteKind[] = ['sport', 'trad', 'tr', 'boulder']

export type KindFilter = 'all' | RouteKind

export function filterByKind(routes: readonly GuidebookRoute[], kind: KindFilter): GuidebookRoute[] {
  return kind === 'all' ? [...routes] : routes.filter((r) => r.kinds.includes(kind))
}

/** A wall and its 1-based place on the crag, or null when the id is not one of its walls. */
export function findWall(
  guide: Guidebook,
  wallId: string,
): { wall: GuidebookWall; number: number } | null {
  const i = guide.walls.findIndex((w) => w.id === wallId)
  const wall = guide.walls[i]
  return wall === undefined ? null : { wall, number: i + 1 }
}

/**
 * The Mountain Project page OpenBeta imported this route or area from. Null
 * when there is no id — and **no link is drawn then**, rather than a search
 * that might land on a different route of the same name.
 */
export function mountainProjectUrl(mpId: string | null, kind: 'route' | 'area'): string | null {
  if (mpId === null || !/^\d+$/.test(mpId)) return null
  return `https://www.mountainproject.com/${kind}/${mpId}`
}

export const openBetaClimbUrl = (id: string): string => `https://openbeta.io/climbs/${id}`

/** One day of "Climb it this week": its good hours and how dry the rock reads. */
export type WeekRow = { local_date: string; title: string; hours: string; rock: RockLevel | null; rockLabel: string | null }

/**
 * The days the readings reach, from today. **The good hours are the crag's**,
 * the same `window` the Daily tab reads, and the dryness is the day's
 * representative hour — never recomputed here. A day before today is dropped:
 * the run's first local day is routinely the tail of one already past.
 */
export function weekRows(series: HourlySeries, todayDate: string): WeekRow[] {
  const days = series.readings?.days ?? []
  return days
    .filter((d) => d.local_date >= todayDate)
    .map((d) => {
      const rock = d.best?.rock?.level ?? null
      return {
        local_date: d.local_date,
        title: shortDay(d.local_date, todayDate),
        hours: windowValue(d.window, series.utc_offset_seconds),
        rock,
        rockLabel: rock === null ? null : ROCK_LABELS[rock],
      }
    })
}
