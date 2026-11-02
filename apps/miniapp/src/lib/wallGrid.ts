import { clock12, type ClimbHours, type WallReadings } from '@weatherteam6/types'

/**
 * The Crag tab's walls × hours grid (#445, Phase 3, `ideas.html` idea 1),
 * apart from its markup: one row per lidar wall, one column per climbing hour
 * of a day, each cell Wall A's score and whether the sun is on the wall then.
 * Pure, so each rule is reachable by a test.
 *
 * Display only, like the line under the hero: the crag's score stays Crag A's.
 */

/** One wall's hour. A wall missing the hour is `null` — a gap, never a neighbour's figure. */
export type GridCell = { score: number | null; inSun: boolean } | null

export type GridRow = { name: string; treeShaded: boolean; cells: GridCell[] }

export type WallGrid = {
  localDate: string
  /** Each column's instant (`valid_at`, the end of its hour) and its tick, `1p`. */
  columns: { validAt: string; label: string }[]
  rows: GridRow[]
}

const HOUR_MS = 3_600_000

const localOf = (validAt: string, utcOffsetSeconds: number) => new Date(Date.parse(validAt) + utcOffsetSeconds * 1000)

/**
 * The grid for the first day from `todayDate` with a climbing hour not yet
 * over — today, or tomorrow once today's climbing hours have ended. An hour is
 * placed by its stamp's local hour, the way `inClimbHours` counts sun hours
 * and the day score, so the grid's columns are the hours a day score reads.
 * Walls are listed A–Z: they carry no area yet (#293). Null with no walls, no
 * today, or no such day in the window.
 */
export function wallGrid(
  walls: readonly WallReadings[],
  todayDate: string | null,
  climbHours: ClimbHours,
  utcOffsetSeconds: number,
  nowMs: number,
): WallGrid | null {
  if (walls.length === 0 || todayDate === null) return null
  const inHours = (validAt: string) => {
    const h = localOf(validAt, utcOffsetSeconds).getUTCHours()
    return h >= climbHours.first && h <= climbHours.last
  }
  // Every wall's instants, so one wall short an hour still leaves the column for the rest.
  const byDate = new Map<string, Set<string>>()
  for (const w of walls) {
    for (const h of w.hours) {
      if (!Number.isFinite(Date.parse(h.valid_at)) || !inHours(h.valid_at)) continue
      const date = localOf(h.valid_at, utcOffsetSeconds).toISOString().slice(0, 10)
      if (date < todayDate) continue
      const set = byDate.get(date) ?? new Set<string>()
      set.add(new Date(Date.parse(h.valid_at)).toISOString())
      byDate.set(date, set)
    }
  }
  // An hour stamped at its end is still open until that stamp.
  const open = (iso: string) => Date.parse(iso) > nowMs
  const localDate = [...byDate.keys()].sort().find((d) => [...byDate.get(d)!].some(open))
  if (localDate === undefined) return null

  const instants = [...byDate.get(localDate)!].sort()
  const columns = instants.map((validAt) => ({
    validAt,
    label: clock12(localOf(validAt, utcOffsetSeconds).getUTCHours(), 'tick'),
  }))
  const rows = [...walls]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((w): GridRow => {
      const at = new Map(w.hours.map((h) => [Date.parse(h.valid_at), h]))
      return {
        name: w.name,
        treeShaded: w.tree_shaded,
        cells: instants.map((iso) => {
          const h = at.get(Date.parse(iso))
          return h === undefined ? null : { score: h.score, inSun: h.in_sun }
        }),
      }
    })
  return { localDate, columns, rows }
}

/** `Walls today`, `Walls tomorrow`, or the weekday: the grid can skip a day the window does not cover. */
export function gridTitle(localDate: string, todayDate: string | null): string {
  if (localDate === todayDate) return 'Walls today'
  const day = (d: string) => Date.parse(`${d}T12:00:00Z`)
  if (todayDate !== null && day(localDate) - day(todayDate) === 24 * HOUR_MS) return 'Walls tomorrow'
  return `Walls on ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(day(localDate)).getUTCDay()]}`
}

/** The column covering `nowMs`, or -1: the hour whose stamp is the first still ahead, within the hour. */
export function nowColumn(grid: WallGrid, nowMs: number): number {
  return grid.columns.findIndex((c) => {
    const t = Date.parse(c.validAt)
    return t > nowMs && t - HOUR_MS <= nowMs
  })
}
