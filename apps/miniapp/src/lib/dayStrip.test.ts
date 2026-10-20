import { describe, expect, it } from 'vitest'
import type { HourlyReading, HourlySample } from '@weatherteam6/types'
import { dayStrip } from './dayStrip.js'
import type { DayReadings } from './overview.js'

const DATE = '2026-10-20'
const HOUR_MS = 3_600_000
/** Central daylight time: local midnight is 05:00 UTC. */
const OFFSET = -5 * 3600
const MIDNIGHT_UTC = Date.parse(`${DATE}T05:00:00.000Z`)

const iso = (localHour: number) => new Date(MIDNIGHT_UTC + localHour * HOUR_MS).toISOString()

function sample(localHour: number, chance: number | null = null): HourlySample {
  return {
    valid_at: iso(localHour),
    local_date: DATE,
    temp_c: null,
    dewpoint_c: null,
    humidity_pct: null,
    precip_mm: null,
    wind_kmh: null,
    wind_gust_kmh: null,
    wind_dir_deg: null,
    cloud_pct: null,
    pressure_hpa: null,
    temp_c_p10: null,
    temp_c_p50: null,
    temp_c_p90: null,
    wind_kmh_p10: null,
    wind_kmh_p50: null,
    wind_kmh_p90: null,
    precip_mm_mean: null,
    precip_mm_p10: null,
    precip_mm_p90: null,
    precip_chance_pct: chance,
    member_count: 143,
  }
}

function reading(localHour: number, score: number): HourlyReading {
  return {
    valid_at: iso(localHour),
    rock: { level: 'dry', qualified: true },
    friction: { level: 'great', condensing: false, qualified: true },
    score,
    t_surface_c: 18,
    condensation_margin_c: 4,
  }
}

function crag(over: Partial<DayReadings> = {}): DayReadings {
  return { days: [], utcOffsetSeconds: OFFSET, severeAlertEvent: null, alertsPending: false, ...over }
}

const hours = Array.from({ length: 24 }, (_, h) => sample(h, h === 15 ? 60 : 0))

describe('dayStrip', () => {
  it("places each hour on the crag's own clock and joins scores on the instant, not the position", () => {
    const strip = dayStrip(hours, [reading(14, 40), reading(9, 95)], DATE, OFFSET, crag())
    expect(strip.map((s) => s.hour)).toEqual(Array.from({ length: 24 }, (_, h) => h))
    expect(strip[9]?.score).toBe(95)
    expect(strip[14]?.score).toBe(40)
  })

  it('leaves an hour with no reading empty, never a zero', () => {
    const strip = dayStrip(hours, [reading(9, 95)], DATE, OFFSET, crag())
    expect(strip[10]?.score).toBeNull()
  })

  it('empties every hour under a Severe+ alert and while alerts load, as the day score is', () => {
    const rs = [reading(9, 95), reading(14, 40)]
    for (const r of [crag({ severeAlertEvent: 'Tornado Warning' }), crag({ alertsPending: true })]) {
      expect(dayStrip(hours, rs, DATE, OFFSET, r).every((s) => s.score === null)).toBe(true)
    }
  })

  it("draws a city's chance of rain and no score, and keeps an unknown chance unknown", () => {
    const strip = dayStrip([...hours.slice(0, 23), sample(23, null)], [reading(9, 95)], DATE, OFFSET, null)
    expect(strip.every((s) => s.score === null)).toBe(true)
    expect(strip[15]?.chancePct).toBe(60)
    expect(strip[23]?.chancePct).toBeNull()
  })

  it("takes only the asked day's hours", () => {
    const tomorrow = { ...sample(1), local_date: '2026-10-21', valid_at: iso(25) }
    expect(dayStrip([...hours, tomorrow], [], DATE, OFFSET, crag())).toHaveLength(24)
  })
})
