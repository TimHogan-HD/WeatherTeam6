/**
 * **Stored runs → how sunny each daylight hour and day is, in words.**
 *
 * Pure, like `hourlySeries.ts` and `hourlyReadings.ts` beside it.
 *
 * Each daylight hour's forecast sunlight is compared with what a cloudless sky
 * would give at that place and hour, and the share sorts it into `sunny`,
 * `partly_cloudy` or `cloudy`. The reader sees only the word (owner decision
 * 2026-10-16); the ratio never leaves this file.
 *
 * **The sunlight is `THERMAL_MODEL`'s**, the same series the drying clock runs
 * on, so the sky on screen is the one the score saw — and never `gem_seamless`,
 * whose shortwave runs ~3× high past day 4 (#155).
 *
 * **Why a cloudless-sky ratio and not cloud cover.** `cloud_pct` counts thin
 * high cloud the sun shines straight through, and it says nothing about how
 * low the sun is. The ratio answers the question asked — how much sun reaches
 * the rock — and needs no input the score does not already read.
 */
import type { SkyCondition, SkyDay, SkyDaySummary, SkyHour, SkySeries } from '@weatherteam6/types'
import { MAX_PLAUSIBLE_SHORTWAVE_WM2, solarPosition } from '../scoring/rockThermal.js'
import { localDateString } from '../weather/openMeteo.js'
import { THERMAL_MODEL } from './hourlyReadings.js'
import type { DeterministicRuns } from './latestRuns.js'

const HOUR_MS = 3_600_000
const DEG = Math.PI / 180

/**
 * **An hour is shown when the sun is this high at its middle.** Below it the
 * cloudless figure is a few tens of W/m² and GFS's low-sun sunlight runs under
 * it: at 5°, real GFS for Sandstone on a cloudless 17 October 2026 (0% cloud)
 * read its last hour, 57 W/m², as partly cloudy. So the strip is the hours with
 * sun worth having, not sunrise to sunset.
 */
export const SKY_MIN_ELEVATION_DEG = 10

/**
 * The share of cloudless sunshine at or above which an hour is `sunny`, and
 * the share below which it is `cloudy`. **A starting guess**, to be tuned
 * against what the owner sees at the crag; nothing has been measured.
 */
export const SUNNY_MIN_RATIO = 0.75
export const CLOUDY_MAX_RATIO = 0.4

/** A day is `sunny` or `cloudy` outright when this share of its hours is. */
const DAY_OUTRIGHT_SHARE = 0.75
/** A half-day is sunny at this share of sunny hours, and not sunny below `HALF_NOT_SHARE`. */
const HALF_SUNNY_SHARE = 0.6
const HALF_NOT_SHARE = 0.4

/**
 * Haurwitz's cloudless-sky global horizontal irradiance, W/m², for a sun this
 * far above the horizon. The simplest of the standard clear-sky models and
 * close enough for three words; 0 with the sun down.
 */
export function clearSkyWm2(elevationDeg: number): number {
  if (!(elevationDeg > 0)) return 0
  const cosZ = Math.sin(elevationDeg * DEG)
  return 1098 * cosZ * Math.exp(-0.057 / cosZ)
}

/**
 * The cloudless figure averaged over the hour ending at `at`, because
 * Open-Meteo's `shortwave_radiation` is the mean over the **preceding** hour.
 * Sampled at four quarter-hour midpoints, so an hour the sun rose inside is
 * not compared with a sun that was up all hour.
 */
function clearSkyHourMeanWm2(at: Date, lat: number, lon: number): number | null {
  let sum = 0
  for (const minutesBack of [52.5, 37.5, 22.5, 7.5]) {
    const sun = solarPosition(new Date(at.getTime() - minutesBack * 60_000), lat, lon)
    if (sun === null) return null
    sum += clearSkyWm2(sun.elevationDeg)
  }
  return sum / 4
}

/** One hour's word, or null when its sunlight is missing or not a measurement. */
export function skyCondition(shortwaveWm2: number | null, clearWm2: number | null): SkyCondition | null {
  if (shortwaveWm2 === null || !Number.isFinite(shortwaveWm2)) return null
  if (shortwaveWm2 < 0 || shortwaveWm2 > MAX_PLAUSIBLE_SHORTWAVE_WM2) return null
  if (clearWm2 === null || !(clearWm2 > 0)) return null
  const ratio = shortwaveWm2 / clearWm2
  if (ratio >= SUNNY_MIN_RATIO) return 'sunny'
  if (ratio < CLOUDY_MAX_RATIO) return 'cloudy'
  return 'partly_cloudy'
}

/**
 * A day from its daylight hours, in order. **Null if any hour is a gap**: the
 * missing one could be the only sunny hour, and "cloudy" said over it would
 * be a guess.
 */
export function summarizeSkyDay(hours: readonly (SkyCondition | null)[]): SkyDaySummary | null {
  if (hours.length === 0) return null
  const known = hours.filter((h): h is SkyCondition => h !== null)
  if (known.length !== hours.length) return null

  const share = (xs: readonly SkyCondition[], k: SkyCondition): number =>
    xs.length === 0 ? 0 : xs.filter((x) => x === k).length / xs.length
  if (share(known, 'sunny') >= DAY_OUTRIGHT_SHARE) return 'sunny'
  if (share(known, 'cloudy') >= DAY_OUTRIGHT_SHARE) return 'cloudy'

  const half = Math.floor(known.length / 2)
  const am = share(known.slice(0, half), 'sunny')
  const pm = share(known.slice(half), 'sunny')
  if (am >= HALF_SUNNY_SHARE && pm < HALF_NOT_SHARE) return 'sunny_morning'
  if (pm >= HALF_SUNNY_SHARE && am < HALF_NOT_SHARE) return 'sunny_afternoon'
  return 'partly_cloudy'
}

export type BuildSkyInput = {
  deterministic: DeterministicRuns
  /** The local dates the published series covers, in order. */
  dates: readonly string[]
  utcOffsetSeconds: number
  lat: number
  lon: number
}

/**
 * **Daylight is decided by the sun, not by which hours the run returned.** An
 * hour the model did not reach is still daylight, so it goes out as a gap
 * rather than vanishing and leaving a day that looks complete.
 */
export function buildSkySeries(input: BuildSkyInput): SkySeries {
  const run = input.deterministic.models.find((m) => m.model === THERMAL_MODEL)
  const shortwaveAt = new Map<number, number | null>()
  if (run !== undefined) for (const h of run.hours) shortwaveAt.set(h.valid_at.getTime(), h.shortwave_wm2)

  const hours: SkyHour[] = []
  const days: SkyDay[] = []
  for (const local_date of input.dates) {
    const midnightUtc = Date.parse(`${local_date}T00:00:00Z`) - input.utcOffsetSeconds * 1000
    const dayHours: (SkyCondition | null)[] = []
    // Stamps 01:00 through the next midnight: each covers the hour before it.
    for (let h = 1; h <= 24; h++) {
      const at = new Date(midnightUtc + h * HOUR_MS)
      if (localDateString(new Date(at.getTime() - HOUR_MS / 2), input.utcOffsetSeconds) !== local_date) continue
      const mid = solarPosition(new Date(at.getTime() - HOUR_MS / 2), input.lat, input.lon)
      if (mid === null || mid.elevationDeg < SKY_MIN_ELEVATION_DEG) continue
      const sky = skyCondition(
        shortwaveAt.get(at.getTime()) ?? null,
        clearSkyHourMeanWm2(at, input.lat, input.lon),
      )
      dayHours.push(sky)
      hours.push({ valid_at: at.toISOString(), local_date, sky })
    }
    days.push({ local_date, summary: summarizeSkyDay(dayHours) })
  }

  return { model: run === undefined ? null : THERMAL_MODEL, hours, days }
}
