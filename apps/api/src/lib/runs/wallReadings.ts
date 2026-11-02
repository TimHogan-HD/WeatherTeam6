/**
 * **Each lidar wall's Wall A score for the readings' window** (#445) — the
 * `walls` block of `HourlyReadings`. Pure, beside `hourlyReadings.ts`, which
 * calls it with the same weather hours Crag A walked.
 *
 * Display only. The crag's score stays Crag A's; these are the numbers behind
 * "best wall in sun" and "best wall in shade" (`sunShadeAt`, `sunShadeOnDay`
 * in `packages/types`).
 */
import type { ClimbHours, RockType, SunWall, WallDay, WallHour, WallReadings } from '@weatherteam6/types'
import type { WeatherHour } from '../scoring/hourlyConditions.js'
import {
  dayRepresentative,
  evaluateWallA,
  inClimbHours,
  sunShareOfHour,
  type TempRangeC,
} from '../scoring/cragModel.js'
import { localDateString } from '../weather/openMeteo.js'

/** A wall to score: its lidar face and skyline, and whether trees shade it. */
export type ScoringWall = { skyline: SunWall; treeShaded: boolean }

/** The sun is on the wall for an hour when it is there for at least this share of it. */
export const IN_SUN_SHARE = 0.5

export type WallReadingsInput = {
  /** Every hour Crag A walked, oldest first: `T_mass` and the drying clock need the history. */
  weather: readonly WeatherHour[]
  walls: readonly ScoringWall[]
  rockType: RockType
  dates: readonly string[]
  utcOffsetSeconds: number
  now: Date
  climbHours: ClimbHours
  range?: TempRangeC
}

export function buildWallReadings(input: WallReadingsInput): WallReadings[] {
  const lastDate = input.dates[input.dates.length - 1]
  if (input.walls.length === 0 || lastDate === undefined) return []
  const dateOf = (validAt: string) => localDateString(new Date(validAt), input.utcOffsetSeconds)
  // The model only looks back, so hours past the window cannot change one inside it.
  const weather = input.weather.filter((h) => dateOf(h.valid_at) <= lastDate)
  const inWindow = new Set(input.dates)
  const firstOpenHourMs = input.now.getTime() - 3_600_000

  return input.walls.map(({ skyline, treeShaded }) => {
    const evaluated = evaluateWallA(weather, {
      rockType: input.rockType,
      // A lidar face is treated as vertical (`SunWall`): no overhang exists in an elevation model.
      wall: { lat: skyline.foot.lat, lon: skyline.foot.lon, aspectDeg: skyline.aspect_deg, cliffAngleDeg: 0 },
      skyline,
      treeShaded,
      ...(input.range === undefined ? {} : { range: input.range }),
    })
    const scored = evaluated
      .filter((h) => inWindow.has(dateOf(h.valid_at)))
      .map((h) => ({
        h,
        in_sun: !treeShaded && sunShareOfHour(skyline, Date.parse(h.valid_at)) >= IN_SUN_SHARE,
      }))
    const hours: WallHour[] = scored.map(({ h, in_sun }) => ({ valid_at: h.valid_at, score: h.score, in_sun }))
    // As the crag's days: today counts only the hours not yet over.
    const days: WallDay[] = input.dates.map((local_date) => {
      const open = scored.filter(
        ({ h }) => dateOf(h.valid_at) === local_date && Date.parse(h.valid_at) > firstOpenHourMs,
      )
      const best = dayRepresentative(
        open.map(({ h }) => h),
        input.utcOffsetSeconds,
        input.climbHours,
      )
      const sun_hours = open.filter(
        ({ h, in_sun }) => in_sun && inClimbHours(h.valid_at, input.utcOffsetSeconds, input.climbHours),
      ).length
      return { local_date, score: best?.score ?? null, sun_hours }
    })
    return { name: skyline.name, aspect_deg: skyline.aspect_deg, tree_shaded: treeShaded, hours, days }
  })
}
