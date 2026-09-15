import { describe, expect, it } from 'vitest'
import type { HourlySample } from '@weatherteam6/types'
import { dayCondition } from './dayCondition.js'
import { HOUR_MS } from './hourlySeries.js'

/**
 * The icon beside each daily row.
 *
 * **An icon is a claim about the sky**, so the cases that matter here are the
 * ones where there is nothing to claim: a day the run does not reach, and a day
 * with a rain reading but no cloud one. Both must come back `null`, because a
 * sun drawn over missing data is defect class 1 at its most literal.
 */

const DAY = '2026-09-15'
/** Midnight UTC on the 15th. At UTC-7 that is 17:00 on the 14th, local. */
const T0 = Date.UTC(2026, 8, 15, 0)
const LAS_VEGAS = -7 * 3600

function hour(index: number, over: Partial<HourlySample> = {}): HourlySample {
  return {
    valid_at: new Date(T0 + index * HOUR_MS).toISOString(),
    local_date: DAY,
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
    precip_chance_pct: null,
    member_count: 143,
    ...over,
  }
}

/** A whole UTC day of hours, all carrying the same reading. */
function uniform(over: Partial<HourlySample>): HourlySample[] {
  return Array.from({ length: 24 }, (_, i) => hour(i, over))
}

describe('dayCondition', () => {
  it('has nothing to say about a day the run does not reach', () => {
    // The common case at the far end of the week. A sun here would be a
    // forecast of clear weather that nothing produced.
    expect(dayCondition(uniform({ cloud_pct: 0 }), '2026-09-20', 0)).toBeNull()
    expect(dayCondition([], DAY, 0)).toBeNull()
  })

  it('has nothing to say when rain is ruled out and no cloud was measured', () => {
    // Reachable: the deterministic model carries cloud and the ensemble carries
    // the wet count, and either can reach a day the other does not.
    expect(dayCondition(uniform({ precip_chance_pct: 5 }), DAY, 0)).toBeNull()
  })

  it('reads rain from the day’s likeliest hour, not its average', () => {
    // An afternoon thunderstorm is a rainy day even though twenty of its hours
    // are dry. Averaging buries exactly what the icon is for: mean chance here
    // is 7%, and the peak is 60%.
    const hours = uniform({ precip_chance_pct: 5, cloud_pct: 0 })
    hours[14] = hour(14, { precip_chance_pct: 60, cloud_pct: 0 })
    expect(dayCondition(hours, DAY, 0)).toBe('rain')
  })

  it('lets rain outrank a clear sky, because a bright rainy day is still rainy', () => {
    expect(dayCondition(uniform({ precip_chance_pct: 80, cloud_pct: 0 }), DAY, 0)).toBe('rain')
  })

  it('bands cloud cover into clear, partly and overcast', () => {
    expect(dayCondition(uniform({ cloud_pct: 10 }), DAY, 0)).toBe('clear')
    expect(dayCondition(uniform({ cloud_pct: 50 }), DAY, 0)).toBe('partly')
    expect(dayCondition(uniform({ cloud_pct: 90 }), DAY, 0)).toBe('cloud')
  })

  it('reads the daylight window on the location’s clock, not on UTC', () => {
    // **The trap this fixture exists for.** `valid_at` is a UTC instant, so
    // slicing the hour out of it reads 08:00-18:00 UTC — which at Red Rock is
    // 01:00-11:00 local, the wrong half of the day entirely (issue #33).
    //
    // Overcast through the local morning and small hours, clear every local
    // afternoon. On the location's clock the day is `partly`; read as UTC it
    // would come out `cloud`.
    const hours = Array.from({ length: 24 }, (_, i) => {
      const localHour = new Date(T0 + i * HOUR_MS + LAS_VEGAS * 1000).getUTCHours()
      return hour(i, { cloud_pct: localHour >= 13 ? 0 : 100 })
    })
    expect(dayCondition(hours, DAY, LAS_VEGAS)).toBe('partly')
    expect(dayCondition(hours, DAY, 0)).toBe('cloud')
  })

  it('falls back to the whole day when none of its hours are daylight', () => {
    // A partial first day — the window starts in the evening — still gets an
    // icon rather than losing one to an empty daylight filter.
    const evening = [20, 21, 22, 23].map((i) => hour(i, { cloud_pct: 90 }))
    expect(dayCondition(evening, DAY, 0)).toBe('cloud')
  })
})
