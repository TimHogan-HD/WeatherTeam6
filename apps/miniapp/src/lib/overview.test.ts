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
  chartHourAt,
  dayChance,
  dayTitle,
  nextDays,
  lastRainText,
  nextLikelyRain,
  shortDate,
  shortDay,
  chartWindow,
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

describe('chartWindow', () => {
  const H = 3_600_000
  // Local midnight on 9/28 is 05:00Z. The series starts there, as the API's does, and runs two days.
  const start = Date.parse('2026-09-28T05:00:00Z')
  const hours = Array.from({ length: 48 }, (_, i) =>
    sample(new Date(start + i * H).toISOString(), i < 24 ? '2026-09-28' : '2026-09-29'),
  )
  /** The `valid_at` of a local hour on 9/28; past 23 runs into 9/29. */
  const local = (hour: number) => new Date(start + hour * H).toISOString()
  const alerts = { severeAlertEvent: null, alertsPending: false }

  it('runs six hours back and ten ahead of the hour now is in, across midnight', () => {
    // 20:40 local: the evening the old 06:00-22:00 chart had nothing left to say about.
    const w = chartWindow(series(hours), Date.parse(local(20)) + 40 * 60_000, null)
    expect(w?.hours.map((h) => h.hour)).toEqual([14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5, 6])
    expect(w?.hours.at(-1)?.local_date).toBe('2026-09-29')
    expect(w?.fromMs).toBe(Date.parse(local(14)))
    expect(w?.toMs).toBe(Date.parse(local(30)))
  })

  it('starts at the first hour the series has just after midnight, and keeps its span', () => {
    const w = chartWindow(series(hours), Date.parse(local(1)) + 30 * 60_000, null)
    expect(w?.fromMs).toBe(start)
    expect(w?.hours.map((h) => h.hour)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16])
  })

  it('moves with the clock', () => {
    const at = (hour: number) => chartWindow(series(hours), Date.parse(local(hour)), null)?.hours[0]?.hour
    expect([at(12), at(13), at(19)]).toEqual([6, 7, 13])
  })

  it('keeps every figure it was given, and a missing one as null rather than 0', () => {
    const given = [
      sample(local(10), '2026-09-28', { temp_c: 12, dewpoint_c: 10, wind_kmh: 8, precip_chance_pct: 20 }),
      sample(local(11), '2026-09-28', { temp_c: null, precip_chance_pct: null }),
    ]
    const [ten, eleven] = chartWindow(series(given), Date.parse(local(11)), null)?.hours ?? []
    expect(ten).toMatchObject({ tempC: 12, dewC: 10, windKmh: 8, chancePct: 20 })
    expect(eleven?.tempC).toBeNull()
    expect(eleven?.chancePct).toBeNull()
  })

  it('joins scores by instant, and scores nothing for a city', () => {
    // Listed out of order: a positional join would swap them.
    const rs = [reading(local(21), { score: 52 }), reading(local(15), { score: 8 })]
    const now = Date.parse(local(18))
    const scored = chartWindow(series(hours, rs), now, alerts)?.hours ?? []
    expect(scored.find((h) => h.valid_at === local(15))?.score).toBe(8)
    expect(scored.find((h) => h.valid_at === local(21))?.score).toBe(52)
    expect(scored.filter((h) => h.score !== null)).toHaveLength(2)
    expect(chartWindow(series(hours, rs), now, null)?.hours.every((h) => h.score === null)).toBe(true)
  })

  it('withholds every score under a Severe+ alert and while alerts load', () => {
    const rs = [reading(local(15), { score: 80 })]
    const now = Date.parse(local(15))
    const severe = chartWindow(series(hours, rs), now, { severeAlertEvent: 'Extreme Heat Warning', alertsPending: false })
    expect(severe?.hours.every((h) => h.score === null)).toBe(true)
    const pending = chartWindow(series(hours, rs), now, { severeAlertEvent: null, alertsPending: true })
    expect(pending?.hours.every((h) => h.score === null)).toBe(true)
  })

  it('tolerates a response from an API older than the readings field', () => {
    const old = { utc_offset_seconds: OFFSET, hours } as unknown as HourlySeries
    expect(chartWindow(old, Date.parse(local(15)), alerts)?.hours.every((h) => h.score === null)).toBe(true)
  })

  it('has no window for a series with no hours', () => {
    expect(chartWindow(series([]), Date.parse(local(15)), null)).toBeNull()
  })
})

describe('chartHourAt', () => {
  const H = 3_600_000
  const base = Date.parse('2026-09-28T05:00:00Z')
  const at = (hour: number) => ({
    valid_at: String(hour),
    ms: base + hour * H,
    hour,
    local_date: '2026-09-28',
    tempC: null,
    dewC: null,
    chancePct: null,
    windKmh: null,
    score: null,
  })
  const t = (hour: number) => base + hour * H
  // 13:00 is missing from the run.
  const hours = [at(6), at(7), at(12), at(14), at(22)]

  it('selects the hour covering the moment, not the nearest mark', () => {
    expect(chartHourAt(hours, t(14.9))?.hour).toBe(14)
    expect(chartHourAt(hours, t(7.2))?.hour).toBe(7)
  })

  it('steps past a missing hour to the nearest one carried, and clamps at the ends', () => {
    expect(chartHourAt(hours, t(13.5))?.hour).toBe(12)
    expect(chartHourAt(hours, t(3))?.hour).toBe(6)
    expect(chartHourAt(hours, t(23.5))?.hour).toBe(22)
  })

  it('has nothing to select on an empty chart', () => {
    expect(chartHourAt([], t(12))).toBeNull()
  })
})

describe('dayChance', () => {
  it('is the day’s highest hourly chance, and unknown rather than 0% when no hour has one', () => {
    const hs = [
      sample('a', '2026-09-29', { precip_chance_pct: 6 }),
      sample('b', '2026-09-29', { precip_chance_pct: 24 }),
      sample('c', '2026-09-30', { precip_chance_pct: 90 }),
      sample('d', '2026-10-01', { precip_chance_pct: null }),
    ]
    expect(dayChance(hs, '2026-09-29')).toBe(24)
    expect(dayChance(hs, '2026-10-01')).toBeNull()
    expect(dayChance(hs, '2026-10-02')).toBeNull()
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

  it('carries the day’s good hours, None when it has none, and nothing for a city', () => {
    const out = nextDays(forecast, '2026-09-28', readings([day('2026-09-29', 88)]))
    expect(out.map((d) => d.window)).toEqual(['None', null, null])
    expect(nextDays(forecast, '2026-09-28', null).every((d) => d.window === null)).toBe(true)
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