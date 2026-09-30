import { describe, expect, it } from 'vitest'
import type {
  ForecastSnapshot,
  RecentPrecip,
  HourlyReading,
  HourlySample,
  HourlySeries,
  ReadingsDay,
} from '@weatherteam6/types'
import {
  LIKELY_RAIN_PCT,
  dayTitle,
  nextDays,
  lastRainText,
  nextLikelyRain,
  shortDate,
  shortDay,
  todayCells,
} from './overview.js'
import { precipDays, precipSummary } from './precipHistory.js'

// Red Wing in September: UTC-5.
const OFFSET = -5 * 3600

const sample = (valid_at: string, local_date: string, over: Partial<HourlySample> = {}) =>
  ({ valid_at, local_date, temp_c: 15, precip_chance_pct: 0, ...over }) as HourlySample

const reading = (valid_at: string, over: Partial<HourlyReading> = {}): HourlyReading => ({
  valid_at,
  rock: { level: 'dry', qualified: true },
  friction: { level: 'great', condensing: false, qualified: true },
  score: 90,
  t_surface_c: 18,
  condensation_margin_c: 6,
  ...over,
})

// Partial fixtures: only the fields these functions read are set, so the
// cast stands in for a full `HourlySeries` the tests have no use for.
const series = (hours: HourlySample[], readingHours: HourlyReading[] = []): HourlySeries =>
  ({
    utc_offset_seconds: OFFSET,
    hours,
    readings: { model: 'gfs_seamless', unavailable_reason: null, hours: readingHours, days: [] },
  }) as unknown as HourlySeries

describe('todayCells', () => {
  // 09:00 local is 14:00Z; 21:00 local is 02:00Z the next UTC day but the same local day.
  const hours = [
    sample('2026-09-28T13:00:00Z', '2026-09-28'), // 08 local — not a strip hour
    sample('2026-09-28T14:00:00Z', '2026-09-28', { temp_c: 12 }), // 09
    sample('2026-09-28T17:00:00Z', '2026-09-28', { temp_c: null }), // 12
    sample('2026-09-29T02:00:00Z', '2026-09-28', { temp_c: 13 }), // 21, next UTC date
    sample('2026-09-29T14:00:00Z', '2026-09-29'), // tomorrow 09
  ]

  it('picks the strip hours on the location clock, across the UTC date line', () => {
    const cells = todayCells(series(hours), '2026-09-28', false)
    expect(cells.map((c) => c.hourLabel)).toEqual(['09', '12', '21'])
  })

  it('leaves out an hour the run does not carry, and keeps a null temperature as null', () => {
    const cells = todayCells(series(hours), '2026-09-28', false)
    expect(cells.find((c) => c.hourLabel === '15')).toBeUndefined()
    expect(cells.find((c) => c.hourLabel === '12')?.tempC).toBeNull()
  })

  it('never reads another day’s 09:00 as today’s', () => {
    const cells = todayCells(series(hours), '2026-09-28', false)
    expect(cells[0]?.valid_at).toBe('2026-09-28T14:00:00Z')
  })

  it('joins readings by instant, and only when asked for them', () => {
    // Listed out of order: a positional join would attach 21:00's reading to 09:00.
    const rs = [
      reading('2026-09-29T02:00:00Z', { friction: { level: 'poor', condensing: true, qualified: true } }),
      reading('2026-09-28T14:00:00Z'),
    ]
    const withR = todayCells(series(hours, rs), '2026-09-28', true)
    expect(withR[0]?.reading?.friction?.level).toBe('great')
    expect(withR.find((c) => c.hourLabel === '21')?.reading?.friction?.level).toBe('poor')
    expect(withR.find((c) => c.hourLabel === '12')?.reading).toBeNull()

    const city = todayCells(series(hours, rs), '2026-09-28', false)
    expect(city.every((c) => c.reading === null)).toBe(true)
  })

  it('tolerates a response from an API older than the readings field', () => {
    const old = { utc_offset_seconds: OFFSET, hours } as unknown as HourlySeries
    expect(todayCells(old, '2026-09-28', true)[0]?.reading).toBeNull()
  })
})

describe('nextDays', () => {
  const row = (forecast_date: string, over: Partial<ForecastSnapshot> = {}) =>
    ({ forecast_date, temp_c_min: 8, temp_c_max: 19, score: 12, ...over }) as ForecastSnapshot

  const day = (local_date: string, score: number | null): ReadingsDay => ({
    local_date,
    window: null,
    best: score === null ? null : reading(`${local_date}T18:00:00Z`, { score }),
  })

  const forecast = [
    row('2026-09-27'),
    row('2026-09-28', { is_today: true }),
    row('2026-09-30'),
    row('2026-09-29'),
    row('2026-10-01'),
    row('2026-10-02'),
  ]

  const readings = (days: ReadingsDay[], over: { severe?: string | null; pending?: boolean } = {}) => ({
    days,
    utcOffsetSeconds: OFFSET,
    severeAlertEvent: over.severe ?? null,
    alertsPending: over.pending ?? false,
  })

  it('lists the three days after today in date order', () => {
    const out = nextDays(forecast, '2026-09-28', null)
    expect(out.map((d) => d.local_date)).toEqual(['2026-09-29', '2026-09-30', '2026-10-01'])
    expect(out[0]?.title).toBe('Tuesday · 9/29')
  })

  it('takes the score from the readings joined on date, never the forecast row’s own', () => {
    // Reversed: a positional join would give 9/29 the score of 10/01.
    const out = nextDays(
      forecast,
      '2026-09-28',
      readings([day('2026-10-01', 40), day('2026-09-30', 70), day('2026-09-29', 88)]),
    )
    expect(out.map((d) => d.score)).toEqual([88, 70, 40])
    expect(out.some((d) => d.score === 12)).toBe(false)
  })

  it('gives no score to a city or to a day the readings do not reach', () => {
    expect(nextDays(forecast, '2026-09-28', null).every((d) => d.score === null)).toBe(true)
    const partial = nextDays(forecast, '2026-09-28', readings([day('2026-09-29', 88)]))
    expect(partial.map((d) => d.score)).toEqual([88, null, null])
  })

  it('withholds every score under a Severe+ alert and while alerts load', () => {
    const days = [day('2026-09-29', 88), day('2026-09-30', 70)]
    const severe = nextDays(forecast, '2026-09-28', readings(days, { severe: 'Extreme Heat Warning' }))
    expect(severe.every((d) => d.score === null)).toBe(true)
    const pending = nextDays(forecast, '2026-09-28', readings(days, { pending: true }))
    expect(pending.every((d) => d.score === null)).toBe(true)
  })
})

describe('nextLikelyRain', () => {
  const now = Date.parse('2026-09-28T18:30:00Z')
  const h = (valid_at: string, local_date: string, pct: number | null) =>
    sample(valid_at, local_date, { precip_chance_pct: pct })

  it('names the first day with an hour at or above the threshold, and that day’s peak', () => {
    const out = nextLikelyRain(
      [
        h('2026-09-29T15:00:00Z', '2026-09-29', 20),
        h('2026-09-30T15:00:00Z', '2026-09-30', LIKELY_RAIN_PCT),
        h('2026-09-30T18:00:00Z', '2026-09-30', 71),
        h('2026-10-01T18:00:00Z', '2026-10-01', 95),
      ],
      now,
    )
    expect(out).toEqual({ kind: 'likely', local_date: '2026-09-30', chancePct: 71 })
  })

  it('ignores hours that have already happened', () => {
    const out = nextLikelyRain(
      [h('2026-09-28T18:00:00Z', '2026-09-28', 90), h('2026-09-28T19:00:00Z', '2026-09-28', 10)],
      now,
    )
    expect(out).toEqual({ kind: 'none', throughDate: '2026-09-28' })
  })

  it('counts the hour in progress', () => {
    const out = nextLikelyRain([h('2026-09-28T19:00:00Z', '2026-09-28', 60)], now)
    expect(out.kind).toBe('likely')
  })

  it('says unknown, not dry, when no coming hour carries a chance', () => {
    const out = nextLikelyRain(
      [h('2026-09-29T15:00:00Z', '2026-09-29', null), h('2026-09-27T15:00:00Z', '2026-09-27', 0)],
      now,
    )
    expect(out).toEqual({ kind: 'unknown' })
  })

  it('reports how far the dry answer reaches, skipping null hours at the end', () => {
    const out = nextLikelyRain(
      [
        h('2026-09-29T15:00:00Z', '2026-09-29', 5),
        h('2026-10-01T15:00:00Z', '2026-10-01', 30),
        h('2026-10-02T15:00:00Z', '2026-10-02', null),
      ],
      now,
    )
    expect(out).toEqual({ kind: 'none', throughDate: '2026-10-01' })
  })
})

describe('date labels', () => {
  it('formats a row title and a short day, and says Today for today', () => {
    expect(dayTitle('2026-09-24')).toBe('Thursday · 9/24')
    expect(dayTitle('not-a-date')).toBeNull()
    expect(shortDay('2026-09-26', '2026-09-24')).toBe('Sat')
    expect(shortDay('2026-09-24', '2026-09-24')).toBe('Today')
  })
})

describe('shortDate', () => {
  it('dates a day a week out, so a Tuesday cannot read as yesterday', () => {
    expect(shortDate('2026-10-06', '2026-09-30')).toBe('Tue 10/6')
    expect(shortDate('2026-09-30', '2026-09-30')).toBe('Today')
    expect(shortDate('not-a-date', '2026-09-30')).toBe('not-a-date')
  })
})

describe('lastRainText', () => {
  /** Two local days of dry hours, with `wet` overriding chosen stamps. */
  function recent(wet: Record<string, number>): RecentPrecip {
    const hours = []
    for (const day of ['2026-09-29', '2026-09-30']) {
      for (let h = 0; h < 24; h++) {
        const stamp = `${day}T${String(h).padStart(2, '0')}:00`
        if (stamp > '2026-09-30T05:00') break
        hours.push({ valid_at_local: stamp, precip_mm: wet[stamp] ?? 0, rain_mm: wet[stamp] ?? 0, snowfall_cm: 0 })
      }
    }
    return { hours, utc_offset_seconds: OFFSET, from_date: '2026-09-29', models: [] }
  }
  // 05:00 on the 30th at UTC-5.
  const NOW = Date.parse('2026-09-30T10:00:00Z')
  const text = (r: RecentPrecip) => lastRainText(precipSummary(r, NOW), precipDays(r.hours).length)

  it('counts from the hour the rain ended, not the end of its day', () => {
    // 1 mm in one hour clears the real-rain line but not the old drying
    // model's 2 mm day, which is why the Overview no longer reads that model.
    expect(text(recent({ '2026-09-29T19:00': 1 }))).toBe('10h ago')
  })

  it('ignores a trace below the real-rain line', () => {
    expect(text(recent({ '2026-09-29T19:00': 1, '2026-09-30T02:00': 0.1 }))).toBe('10h ago')
  })

  it('says none in the window, naming the window', () => {
    expect(text(recent({}))).toBe('None in 2 days')
  })

  it('says now while real rain is in the newest hour', () => {
    expect(text(recent({ '2026-09-30T05:00': 2 }))).toBe('Now')
  })

  it('says nothing when the window has no hours', () => {
    expect(text({ hours: [], utc_offset_seconds: OFFSET, from_date: null })).toBeNull()
  })
})