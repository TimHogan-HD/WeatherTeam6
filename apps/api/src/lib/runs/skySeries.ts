/**
 * **Stored runs → how sunny each hour and day is.**
 *
 * Pure, like `hourlySeries.ts` and `hourlyReadings.ts` beside it.
 *
 * Everything reads Open-Meteo's `sunshine_duration`: the seconds of each hour
 * with direct sun of at least 120 W/m², the WMO definition of sunshine. It
 * replaced a cloudless-sky ratio of `shortwave_radiation` (#472), whose 0.75 /
 * 0.4 cut-offs nothing had checked; sunshine minutes are a defined, measured
 * quantity a reader can picture ("40 minutes of the hour").
 *
 * **The sun is `THERMAL_MODEL`'s**, the same run the drying clock reads, so the
 * sky on screen is the one the score saw — and never `gem_seamless`, whose
 * shortwave (and so its sunshine) runs ~3× high past day 4 (#155). The other
 * global models are read only to say when the forecasts differ (#470).
 */
import { solarPosition, type SkyCondition, type SkyDay, type SkyDaySummary, type SkyHour, type SkySeries, type SunHour, type SunWindow } from '@weatherteam6/types'
import { MAX_PLAUSIBLE_SHORTWAVE_WM2 } from '../scoring/rockThermal.js'
import { localDateString } from '../weather/openMeteo.js'
import { THERMAL_MODEL } from './hourlyReadings.js'
import type { DeterministicRuns, RunHour } from './latestRuns.js'

const HOUR_MS = 3_600_000

/**
 * **An hour gets a sky word when the sun is this high at its middle.** Below it
 * a clear sky's beam is weak and short, and a sunless hour there says little
 * about the day. The Sun card and the day's total count every hour.
 */
export const SKY_MIN_ELEVATION_DEG = 10

/** An hour with at least this many minutes of sun is `sunny`; under `CLOUDY_MAX_SUN_MIN` it is `cloudy`. */
export const SUNNY_MIN_SUN_MIN = 45
export const CLOUDY_MAX_SUN_MIN = 15

/** An hour belongs to a sunny window with at least half of it in sun. */
export const WINDOW_MIN_SUN_MIN = 30

/**
 * The models compared for "forecasts differ". The four global models less
 * `gem_seamless` (#155); HRRR and NBM stop inside two days and would compare
 * only the near days, so a crag abroad would get a different statistic.
 */
export const SUN_AGREEMENT_MODELS = ['gfs_seamless', 'ecmwf_ifs025', 'icon_seamless'] as const

/** A day is `sunny` or `cloudy` outright when this share of its hours is. */
const DAY_OUTRIGHT_SHARE = 0.75
/** A half-day is sunny at this share of sunny hours, and not sunny below `HALF_NOT_SHARE`. */
const HALF_SUNNY_SHARE = 0.6
const HALF_NOT_SHARE = 0.4

/**
 * Seconds of sunshine → minutes, or null when it is not a measurement. A small
 * overrun is rounding upstream; anything past it is a broken value, not sun.
 */
export function sunMinutes(seconds: number | null): number | null {
  if (seconds === null || !Number.isFinite(seconds)) return null
  if (seconds < 0 || seconds > 3660) return null
  return Math.min(60, seconds / 60)
}

/** Sunlight on flat ground, or null when it is not a measurement. 0 (night) survives. */
function plausibleShortwave(wm2: number | null): number | null {
  if (wm2 === null || !Number.isFinite(wm2)) return null
  if (wm2 < 0 || wm2 > MAX_PLAUSIBLE_SHORTWAVE_WM2) return null
  return wm2
}

/** One hour's word from its minutes of sun, or null for a gap. */
export function skyCondition(sunMin: number | null): SkyCondition | null {
  if (sunMin === null || !Number.isFinite(sunMin)) return null
  if (sunMin >= SUNNY_MIN_SUN_MIN) return 'sunny'
  if (sunMin < CLOUDY_MAX_SUN_MIN) return 'cloudy'
  return 'partly_cloudy'
}

/**
 * A day from its sky-word hours, in order. **Null if any hour is a gap**: the
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

/**
 * Runs of consecutive hours with at least `WINDOW_MIN_SUN_MIN` of sun, as local
 * wall-clock hours. `hours` is the day's daylight hours, in order, each with
 * the local hour its span starts at; none may be a gap (the caller checks).
 */
export function sunWindows(hours: readonly { startHour: number; sunMin: number }[]): SunWindow[] {
  const out: SunWindow[] = []
  let open: SunWindow | null = null
  for (const h of hours) {
    const sunny = h.sunMin >= WINDOW_MIN_SUN_MIN
    if (sunny && open !== null && open.end_hour === h.startHour) {
      open.end_hour = h.startHour + 1
    } else if (sunny) {
      open = { start_hour: h.startHour, end_hour: h.startHour + 1 }
      out.push(open)
    } else {
      open = null
    }
  }
  return out
}

export type BuildSkyInput = {
  deterministic: DeterministicRuns
  /** The local dates the published series covers, in order. */
  dates: readonly string[]
  utcOffsetSeconds: number
  lat: number
  lon: number
}

type ByStamp = Map<number, RunHour>

function indexRun(deterministic: DeterministicRuns, model: string): ByStamp | null {
  const run = deterministic.models.find((m) => m.model === model)
  if (run === undefined) return null
  const out: ByStamp = new Map()
  for (const h of run.hours) out.set(h.valid_at.getTime(), h)
  return out
}

/**
 * **Daylight is decided by the sun, not by which hours the run returned.** An
 * hour the model did not reach is still daylight, so it goes out as a gap
 * rather than vanishing and leaving a day that looks complete.
 */
export function buildSkySeries(input: BuildSkyInput): SkySeries {
  const thermal = indexRun(input.deterministic, THERMAL_MODEL)
  const others = SUN_AGREEMENT_MODELS.map((model) => ({ model, at: indexRun(input.deterministic, model) }))

  const hours: SkyHour[] = []
  const sun: SunHour[] = []
  const days: SkyDay[] = []
  for (const local_date of input.dates) {
    const midnightUtc = Date.parse(`${local_date}T00:00:00Z`) - input.utcOffsetSeconds * 1000
    const words: (SkyCondition | null)[] = []
    const daylightStamps: number[] = []
    const windowHours: { startHour: number; sunMin: number }[] = []
    let total: number | null = 0

    // Stamps 01:00 through the next midnight: each covers the hour before it.
    for (let h = 1; h <= 24; h++) {
      const at = new Date(midnightUtc + h * HOUR_MS)
      const mid = new Date(at.getTime() - HOUR_MS / 2)
      if (localDateString(mid, input.utcOffsetSeconds) !== local_date) continue
      const start = solarPosition(new Date(at.getTime() - HOUR_MS), input.lat, input.lon)
      const end = solarPosition(at, input.lat, input.lon)
      const atMid = solarPosition(mid, input.lat, input.lon)
      const daylight = start !== null && end !== null && Math.max(start.elevationDeg, end.elevationDeg) > 0

      const row = thermal?.get(at.getTime())
      const sunMin = sunMinutes(row?.sunshine_s ?? null)
      sun.push({
        valid_at: at.toISOString(),
        local_date,
        daylight,
        sun_min: sunMin,
        shortwave_wm2: plausibleShortwave(row?.shortwave_wm2 ?? null),
        cloud_pct: row?.cloud_pct ?? null,
      })

      if (!daylight) continue
      daylightStamps.push(at.getTime())
      if (sunMin === null) total = null
      else if (total !== null) total += sunMin
      // The local hour this span starts at; a DST day shifts the label, not the sum.
      const startHour = new Date(at.getTime() - HOUR_MS + input.utcOffsetSeconds * 1000).getUTCHours()
      if (sunMin !== null) windowHours.push({ startHour, sunMin })

      if (atMid === null || atMid.elevationDeg < SKY_MIN_ELEVATION_DEG) continue
      const sky = skyCondition(sunMin)
      words.push(sky)
      hours.push({ valid_at: at.toISOString(), local_date, sky })
    }

    const answered = total !== null && daylightStamps.length > 0
    const sun_by_model: SkyDay['sun_by_model'] = []
    if (answered) {
      for (const o of others) {
        if (o.at === null) continue
        let sum = 0
        let whole = true
        for (const t of daylightStamps) {
          const m = sunMinutes(o.at.get(t)?.sunshine_s ?? null)
          if (m === null) {
            whole = false
            break
          }
          sum += m
        }
        if (whole) sun_by_model.push({ model: o.model, sun_min: Math.round(sum) })
      }
    }

    days.push({
      local_date,
      summary: summarizeSkyDay(words),
      sun_min: answered ? Math.round(total ?? 0) : null,
      sun_windows: answered ? sunWindows(windowHours) : null,
      sun_by_model,
    })
  }

  return { model: thermal === null ? null : THERMAL_MODEL, hours, sun, days }
}
