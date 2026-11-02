/**
 * **Sun and shade walls** (#445): Wall A's score for each lidar wall of a crag
 * the owner has confirmed (`sunWallsFor`), and the rules that turn them into
 * two numbers — the best wall in sun and the best wall in shade. Shared so the
 * API and the client cannot pair or compare them differently.
 *
 * Walls are regrouped every hour by whether the sun is on them then, not by a
 * fixed side. "In sun" is geometry only (the sun above the wall's skyline and in
 * front of it, and no trees): an overcast hour still has walls in sun, and
 * their scores converge because Wall A's sun warming reads the shortwave.
 */

/** One wall's hour. `in_sun` is false at night and always false under trees. */
export type WallHour = {
  /** UTC instant, ISO 8601: the end of the hour, as every reading. */
  readonly valid_at: string
  /** Wall A's score; null when any input was missing, never Crag A's. */
  readonly score: number | null
  readonly in_sun: boolean
}

/** One wall's local day. */
export type WallDay = {
  readonly local_date: string
  /** `dayRepresentative` over the wall's hours: the day score rule. */
  readonly score: number | null
  /** Hours inside the reader's climbing hours with the sun on the wall; today's count only hours ahead. */
  readonly sun_hours: number
}

/** One lidar wall, scored by Wall A. */
export type WallReadings = {
  /** The nearest OpenBeta wall's name (`SunWall.name`). */
  readonly name: string
  readonly aspect_deg: number
  /** Trees keep the sun off it (`KnownCrag.tree_shaded`): never in sun, no sun warming. */
  readonly tree_shaded: boolean
  /** The readings' window, ordered by `valid_at`. Joined by instant, never by index. */
  readonly hours: readonly WallHour[]
  readonly days: readonly WallDay[]
}

/**
 * **Rule 1, "only when it matters"** (owner, #445): the best sunny wall and the
 * best shaded wall within this many points read alike, and the Overview says
 * so in one quiet line rather than showing two numbers.
 */
export const SUN_SHADE_ALIKE_POINTS = 10

/**
 * A wall counts as a sunny wall for a day once it has this many sun hours
 * inside the climbing hours (owner, #445).
 */
export const SUN_DAY_MIN_HOURS = 2

/**
 * One group's answer. `walls` is how many walls are in it; `best` is the
 * highest-scoring of them, or null — with `walls` 0 there is no such wall,
 * otherwise a wall in the group was not scored and the group is withheld,
 * because the missing one could be the best.
 */
export type SunShadeGroup = {
  readonly walls: number
  readonly best: { readonly name: string; readonly score: number } | null
}

export type SunShadePair = {
  readonly sun: SunShadeGroup
  readonly shade: SunShadeGroup
  /**
   * True when both groups have a best wall within `SUN_SHADE_ALIKE_POINTS`,
   * false when the gap is larger, null when either group has no answer.
   */
  readonly alike: boolean | null
}

function group(members: readonly { name: string; score: number | null }[]): SunShadeGroup {
  if (members.some((m) => m.score === null || !Number.isFinite(m.score))) {
    return { walls: members.length, best: null }
  }
  let best: { name: string; score: number } | null = null
  for (const m of members) if (best === null || m.score! > best.score) best = { name: m.name, score: m.score! }
  return { walls: members.length, best }
}

function pair(sun: SunShadeGroup, shade: SunShadeGroup): SunShadePair {
  const alike =
    sun.best === null || shade.best === null
      ? null
      : Math.abs(sun.best.score - shade.best.score) <= SUN_SHADE_ALIKE_POINTS
  return { sun, shade, alike }
}

/**
 * The pair at one hour, grouped by whether the sun is on each wall then. Null
 * when there are no walls or any wall lacks that hour: a pair read from some
 * walls could miss the best one.
 */
export function sunShadeAt(walls: readonly WallReadings[], validAt: string): SunShadePair | null {
  if (walls.length === 0) return null
  const t = Date.parse(validAt)
  const rows = walls.map((w) => ({ name: w.name, hour: w.hours.find((h) => Date.parse(h.valid_at) === t) }))
  if (rows.some((r) => r.hour === undefined)) return null
  const at = (inSun: boolean) =>
    rows.filter((r) => r.hour!.in_sun === inSun).map((r) => ({ name: r.name, score: r.hour!.score }))
  return pair(group(at(true)), group(at(false)))
}

/**
 * The pair for one local day (owner, #445): the sun group's day score is the
 * best wall with at least `SUN_DAY_MIN_HOURS` sun hours in the climbing hours,
 * the shade group's the best of the rest. Each wall's day score is its own
 * `dayRepresentative`. Null when there are no walls or any wall lacks the day.
 */
export function sunShadeOnDay(walls: readonly WallReadings[], localDate: string): SunShadePair | null {
  if (walls.length === 0) return null
  const rows = walls.map((w) => ({ name: w.name, day: w.days.find((d) => d.local_date === localDate) }))
  if (rows.some((r) => r.day === undefined)) return null
  const sunny = (r: (typeof rows)[number]) => r.day!.sun_hours >= SUN_DAY_MIN_HOURS
  const of = (rs: typeof rows) => rs.map((r) => ({ name: r.name, score: r.day!.score }))
  return pair(group(of(rows.filter(sunny))), group(of(rows.filter((r) => !sunny(r)))))
}
