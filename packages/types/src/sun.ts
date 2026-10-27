import { knownCragBySlug } from './knownCrags.js'
import { SUN_WALLS } from './sunWallsData.js'

const DEG = Math.PI / 180

/**
 * **Where the sun is, from coordinates and a UTC instant.** NOAA's general
 * solar position equations (Spencer's Fourier series for declination and the
 * equation of time), good to well under a degree — far inside everything else
 * the rock-thermal model is uncertain about.
 *
 * Azimuth is degrees clockwise from north, the same convention as `aspect`.
 * `elevationDeg` is negative at night. Shared so the API's irradiance and the
 * client's sun-on-the-wall hours put the sun in one place.
 */
export function solarPosition(at: Date, lat: number, lon: number): {
  elevationDeg: number
  azimuthDeg: number
} | null {
  const t = at.getTime()
  if (!Number.isFinite(t) || !Number.isFinite(lat) || !Number.isFinite(lon)) return null

  const yearStart = Date.UTC(at.getUTCFullYear(), 0, 1)
  const dayOfYear = Math.floor((t - yearStart) / 86_400_000) + 1
  const utcHours = at.getUTCHours() + at.getUTCMinutes() / 60 + at.getUTCSeconds() / 3600
  const g = ((2 * Math.PI) / 365) * (dayOfYear - 1 + (utcHours - 12) / 24)

  const eqTimeMin =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g))
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g)

  const trueSolarMin = utcHours * 60 + eqTimeMin + 4 * lon
  const hourAngle = (trueSolarMin / 4 - 180) * DEG
  const phi = lat * DEG

  const cosZenith = Math.min(
    1,
    Math.max(-1, Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(hourAngle)),
  )
  const elevationDeg = 90 - Math.acos(cosZenith) / DEG

  // Measured from south, positive westward, then turned to clockwise-from-north.
  const fromSouth = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi),
  )
  const azimuthDeg = (((fromSouth / DEG + 180) % 360) + 360) % 360

  return { elevationDeg, azimuthDeg }
}

/**
 * **One cliff face found in USGS 1 m lidar, and the skyline seen from its foot**
 * (#415). Written by `npm run sun:walls` (`apps/api`) into `sunWallsData.ts`,
 * never by hand.
 *
 * - `name` is the nearest OpenBeta wall's. OpenBeta's points are wrong on the
 *   ground (owner, 2026-09-29), so it is a pointer, not a survey; the owner
 *   chose to show every face under that name (2026-10-27).
 * - `aspect_deg` is the way the face looks, the mean of its cells' downslope
 *   directions. The face is treated as vertical: every face kept is steeper
 *   than 60°, and no overhang exists in an elevation model at all.
 * - `horizon_deg[a]` is the terrain's height above level, in degrees, looking
 *   toward azimuth `a` from 1.5 m above the foot. Lidar near, Terrarium far.
 *   **Terrain only** — trees are in the lidar's first returns and not here.
 */
export type SunWall = {
  readonly name: string
  readonly aspect_deg: number
  readonly height_m: number
  readonly foot: { readonly lat: number; readonly lon: number }
  readonly horizon_deg: readonly number[]
}

export type SunWalls = {
  /** The crag's IANA zone: the local day and the printed times are its. */
  readonly time_zone: string
  /** The date the lidar was read, `YYYY-MM-DD`. */
  readonly computed: string
  readonly walls: readonly SunWall[]
}

/**
 * The crag's walls, **only where the owner has confirmed sun and shade on the
 * ground** — the `KNOWN_CRAGS` entry's `sun_confirmed` (owner, 2026-10-05:
 * today only Red Wing). Data sitting in `SUN_WALLS` is not enough to show it.
 */
export function sunWallsFor(knownCrag: string | null | undefined): SunWalls | null {
  const crag = knownCragBySlug(knownCrag)
  if (crag === null || crag.sun_confirmed !== true) return null
  return SUN_WALLS[crag.slug] ?? null
}

/** Minutes between the instants a day is sampled at. */
export const SUN_STEP_MINUTES = 5

const STEP_MS = SUN_STEP_MINUTES * 60_000

/**
 * Every `SUN_STEP_MINUTES` instant of a local day, as epoch ms. Built from the
 * zone, never a fixed offset, so a day across a clock change is 23 or 25 hours.
 */
export function localDayInstants(ymd: string, timeZone: string): number[] {
  const noonUtc = Date.parse(`${ymd}T12:00:00Z`)
  if (!Number.isFinite(noonUtc)) return []
  const day = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const out: number[] = []
  // ±14 h around 12:00 UTC is every zone's whole local day, plus margin.
  for (let t = noonUtc - 28 * 3_600_000; t <= noonUtc + 28 * 3_600_000; t += STEP_MS) {
    if (day.format(t) === ymd) out.push(t)
  }
  return out
}

/** A span of direct sun: the first lit instant, and the end of the last lit step. */
export type SunSpan = { readonly from: number; readonly to: number }

/**
 * Whether the sun is on a vertical face at one instant: above the horizon,
 * in front of the face, and above the skyline in its direction.
 */
export function sunOnWallAt(wall: SunWall, t: number): boolean {
  const sun = solarPosition(new Date(t), wall.foot.lat, wall.foot.lon)
  if (sun === null || sun.elevationDeg <= 0) return false
  if (Math.cos((sun.azimuthDeg - wall.aspect_deg) * DEG) <= 0) return false
  const sky = wall.horizon_deg[Math.round(sun.azimuthDeg) % 360]
  // A skyline missing its value is a gap: the sun is not called on the wall.
  return sky !== undefined && sun.elevationDeg > sky
}

/** The spans of direct sun on a wall over the given instants. */
export function sunSpans(wall: SunWall, instants: readonly number[]): SunSpan[] {
  return spansWhere(instants, (t) => sunOnWallAt(wall, t))
}

/** The spans when the sun is above a level horizon at the wall's foot — daylight, lit or not. */
export function daylightSpans(wall: SunWall, instants: readonly number[]): SunSpan[] {
  return spansWhere(instants, (t) => (solarPosition(new Date(t), wall.foot.lat, wall.foot.lon)?.elevationDeg ?? 0) > 0)
}

function spansWhere(instants: readonly number[], lit: (t: number) => boolean): SunSpan[] {
  const spans: { from: number; to: number }[] = []
  for (const t of instants) {
    if (!lit(t)) continue
    const last = spans[spans.length - 1]
    if (last !== undefined && last.to === t) last.to = t + STEP_MS
    else spans.push({ from: t, to: t + STEP_MS })
  }
  return spans
}
