/**
 * **The welcome screen's example week (#543): made up, not recorded.** Owner
 * decision 2026-11-10. Stored runs are pruned after two days, and a real week
 * rarely holds a cold, an in-range, a warm, a hot and a rainy day together, so
 * every slider would not visibly move something. The screen labels it
 * "Example · sample week", and nothing here reaches a real crag's readings.
 *
 * Placed at Red Wing (Barn Bluff) for its rock and its sun, on an early-October
 * week so the sun's path is real for the dates. Each day is a smooth curve
 * between its low (6 am) and high (3 pm), dew point a fixed spread below the
 * air, a light breeze, and clear-sky shortwave (Haurwitz) except under rain.
 * Five dry lead-in days come first so the rock's mass temperature and drying
 * clock settle before Thursday; they are scored but never shown.
 *
 * `setupPreview.test.ts` holds each day to the job it is here for.
 */
import { KNOWN_CRAGS, fToC, solarPosition, type KnownCrag } from '@weatherteam6/types'
import type { WeatherHour } from '../scoring/hourlyConditions.js'

const HOUR_MS = 3_600_000

const RED_WING = KNOWN_CRAGS.find((c) => c.slug === 'red-wing') as KnownCrag

export const SAMPLE_CRAG = {
  name: 'Red Wing',
  rockType: RED_WING.rock_type,
  lat: (RED_WING.bbox.south + RED_WING.bbox.north) / 2,
  lon: (RED_WING.bbox.west + RED_WING.bbox.east) / 2,
} as const

/** Central daylight time, as Red Wing keeps in early October. */
export const SAMPLE_UTC_OFFSET_S = -5 * 3600

type SampleDay = {
  /** Low at 6 am and high at 3 pm, °F. */
  lowF: number
  highF: number
  /** Dew point below the air, °F. */
  dewSpreadF: number
  /** Local hours, inclusive, it rains through, and the rain each of those hours, mm. */
  rain?: { from: number; to: number; mmPerHour: number }
}

const LEAD_IN: SampleDay = { lowF: 40, highF: 56, dewSpreadF: 12 }

/**
 * Thursday cold, Friday in range, Saturday warm (low on the defaults, high once
 * the top of the range goes up), Sunday hot (helped by an earlier start), Monday
 * rain through the morning (helped by a later finish).
 */
const SHOWN: readonly SampleDay[] = [
  { lowF: 0, highF: 14, dewSpreadF: 8 },
  { lowF: 40, highF: 56, dewSpreadF: 12 },
  { lowF: 58, highF: 78, dewSpreadF: 26 },
  { lowF: 70, highF: 92, dewSpreadF: 36 },
  { lowF: 44, highF: 58, dewSpreadF: 6, rain: { from: 2, to: 10, mmPerHour: 0.3 } },
]

export const SAMPLE_LEAD_IN_DAYS = 5
export const SAMPLE_SHOWN_DAYS = SHOWN.length

/** Local midnight starting the first lead-in day: Saturday 2026-09-26, so the shown week is Thu 1 Oct to Mon 5 Oct. */
export const SAMPLE_START_MS = Date.parse('2026-09-26T05:00:00Z')

/** 0 at the 6 am low, 1 at the 3 pm high, back towards 0 by the next 6 am. */
function diurnal(localHour: number): number {
  const x = localHour < 6 ? localHour + 24 : localHour
  return x <= 15 ? 0.5 - 0.5 * Math.cos((Math.PI * (x - 6)) / 9) : 0.5 + 0.5 * Math.cos((Math.PI * (x - 15)) / 15)
}

/** Every hour, lead-in first. `valid_at` is the hour's end, as every stored hour. */
export function sampleWeekHours(): WeatherHour[] {
  const days = [...Array.from({ length: SAMPLE_LEAD_IN_DAYS }, () => LEAD_IN), ...SHOWN]
  return Array.from({ length: days.length * 24 }, (_, i) => {
    const t = SAMPLE_START_MS + i * HOUR_MS
    const day = days[Math.floor(i / 24)]!
    const local = i % 24
    const airF = day.lowF + (day.highF - day.lowF) * diurnal(local)
    const raining = day.rain !== undefined && local >= day.rain.from && local <= day.rain.to
    const sun = solarPosition(new Date(t - HOUR_MS / 2), SAMPLE_CRAG.lat, SAMPLE_CRAG.lon)
    const cz = sun === null ? 0 : Math.sin((sun.elevationDeg * Math.PI) / 180)
    const clear = cz > 0 ? 1098 * cz * Math.exp(-0.057 / cz) : 0
    return {
      valid_at: new Date(t).toISOString(),
      air_temp_c: fToC(airF),
      dewpoint_c: fToC(airF - day.dewSpreadF),
      wind_kmh: 8,
      cloud_pct: raining ? 100 : 10,
      shortwave_wm2: raining ? clear * 0.2 : clear,
      precip_mm: raining ? day.rain!.mmPerHour : 0,
    }
  })
}
