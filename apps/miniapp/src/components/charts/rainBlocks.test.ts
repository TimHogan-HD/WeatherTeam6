import { describe, expect, it } from 'vitest'
import type { HourlySample } from '@weatherteam6/types'
import { HOUR_MS } from './hourlySeries.js'
import { blockAt, columnInches, rainBlockHours, rainBlocks, rainTopIn, scaleInches } from './rainBlocks.js'

const T0 = Date.UTC(2026, 9, 29, 16)

function hour(index: number, over: Partial<HourlySample> = {}): HourlySample {
  return {
    valid_at: new Date(T0 + index * HOUR_MS).toISOString(),
    local_date: index < 8 ? '2026-10-29' : index < 32 ? '2026-10-30' : '2026-10-31',
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
    precip_mm_mean: 1,
    precip_mm_p10: null,
    precip_mm_p90: 9,
    precip_chance_pct: 20,
    member_count: 143,
    ...over,
  }
}

const hours = (n: number, over: (i: number) => Partial<HourlySample> = () => ({})) =>
  Array.from({ length: n }, (_, i) => hour(i, over(i)))

describe('rainBlocks', () => {
  it('reads one day in threes and 48 hours in sixes, eight blocks either way', () => {
    expect(rainBlockHours(hours(24))).toBe(3)
    expect(rainBlockHours(hours(48))).toBe(6)
    expect(rainBlocks(hours(24))).toHaveLength(8)
    const two = rainBlocks(hours(48))
    expect(two).toHaveLength(8)
    expect(two.every((b) => b.instants.length === 6)).toBe(true)
  })

  it('starts each block an hour before its first stamp, since an hour is stamped at its end', () => {
    const [first] = rainBlocks(hours(48))
    expect(first?.fromMs).toBe(T0 - HOUR_MS)
    expect(first?.toMs).toBe(T0 + 5 * HOUR_MS)
    expect(first?.localDate).toBe('2026-10-29')
  })

  it('adds up the means, never the p90, and takes the likeliest hour’s chance', () => {
    const [first] = rainBlocks(hours(48, (i) => ({ precip_chance_pct: [5, 40, 10, 0, 0, 0][i] ?? 0 })))
    expect(first?.totalMm).toBe(6)
    expect(first?.chancePct).toBe(40)
  })

  it('withholds a figure when any hour in the block is unread', () => {
    const [first, second] = rainBlocks(hours(24, (i) => (i === 1 ? { precip_mm_mean: null } : i === 4 ? { precip_chance_pct: null } : {})))
    expect(first?.totalMm).toBeNull()
    expect(first?.chancePct).toBe(20)
    expect(second?.totalMm).toBe(3)
    expect(second?.chancePct).toBeNull()
  })

  it('finds the block that reads an instant', () => {
    const blocks = rainBlocks(hours(24))
    expect(blockAt(blocks, T0 + 4 * HOUR_MS)).toBe(blocks[1])
    expect(blockAt(blocks, null)).toBeNull()
    expect(blockAt(blocks, T0 + 99 * HOUR_MS)).toBeNull()
  })
})

describe('rain figures', () => {
  it('keeps the floor for a small forecast and steps up to hold a wet one', () => {
    expect(rainTopIn(0.05, 0.2)).toBe(0.2)
    expect(rainTopIn(0.45, 0.4)).toBe(0.5)
    expect(rainTopIn(1.18, 0.2)).toBe(1.2)
    expect(rainTopIn(5.2, 0.4)).toBe(6)
  })

  it('labels a column as 0, a trace, hundredths, or tenths past an inch', () => {
    expect(columnInches(null)).toBe('—')
    expect(columnInches(0)).toBe('0')
    expect(columnInches(0.2)).toBe('tr')
    expect(columnInches(3.05)).toBe('.12"')
    expect(columnInches(25.3)).toBe('1.0"')
    expect(columnInches(40)).toBe('1.6"')
  })

  it('prints scale figures without trailing zeros', () => {
    expect(scaleInches(0)).toBe('0')
    expect(scaleInches(0.1)).toBe('.1"')
    expect(scaleInches(0.15)).toBe('.15"')
    expect(scaleInches(1)).toBe('1"')
    expect(scaleInches(1.2)).toBe('1.2"')
  })
})
