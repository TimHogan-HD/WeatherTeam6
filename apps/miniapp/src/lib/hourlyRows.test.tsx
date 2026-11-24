import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  windowValue,
  type HourlyDay,
  type HourlyReading,
  type HourlySample,
  type HourlySeries,
  type ReadingsDay,
  type SunHour,
} from '@weatherteam6/types'
import { HourlyRows } from '../components/HourlyRows.js'
import { HOUR_MS } from '../components/charts/hourlySeries.js'
import { compass, firstAhead, hourRows, rowInches, scaleTop } from './hourlyRows.js'

/**
 * The Hourly tab as rows (owner, 2026-11-24, `hourly-rows.html`): which sample
 * each figure comes from, what a gap prints, and what a city does not get.
 */

// UTC offset 0, so stamp n is n o'clock local.
const T0 = Date.UTC(2026, 8, 15, 0)
const DAY_1 = '2026-09-15'
const DAY_2 = '2026-09-16'
const at = (h: number) => new Date(T0 + h * HOUR_MS).toISOString()

function hour(h: number, over: Partial<HourlySample> = {}): HourlySample {
  return {
    valid_at: at(h),
    local_date: h < 24 ? DAY_1 : DAY_2,
    temp_c: null,
    dewpoint_c: 5,
    humidity_pct: 60,
    precip_mm: null,
    wind_kmh: null,
    wind_gust_kmh: 30,
    wind_dir_deg: 270,
    cloud_pct: null,
    pressure_hpa: null,
    temp_c_p10: 12,
    temp_c_p50: 15,
    temp_c_p90: 19,
    wind_kmh_p10: null,
    wind_kmh_p50: 16,
    wind_kmh_p90: null,
    precip_mm_mean: 0,
    precip_mm_p10: null,
    precip_mm_p90: null,
    precip_chance_pct: 0,
    member_count: 143,
    ...over,
  }
}

const day = (local_date: string): HourlyDay => ({ local_date, has_deterministic: true, has_ensemble: true })

function series(hours: HourlySample[], over: Partial<HourlySeries> = {}): HourlySeries {
  return {
    location_id: 'loc',
    utc_offset_seconds: 0,
    fetched_at: at(0),
    model: 'gfs_seamless',
    unavailable_models: [],
    readings: { model: null, unavailable_reason: 'not_a_climbing_location', hours: [], days: [] },
    hours,
    days: [day(DAY_1), day(DAY_2)],
    ...over,
  }
}

const twoDays = Array.from({ length: 48 }, (_, h) => hour(h))
const label = (w: Parameters<typeof windowValue>[0]) => windowValue(w, 0)
const CRAG = { showScore: true }
const CITY = { showScore: false }

function readingHour(validAt: string, score: number): HourlyReading {
  return {
    valid_at: validAt,
    rock: { level: 'dry', qualified: true },
    friction: { level: 'good', condensing: false, qualified: true },
    score,
    t_surface_c: 18,
    condensation_margin_c: 4,
  }
}
const readingsDay = (localDate: string, score: number): ReadingsDay => ({
  local_date: localDate,
  window: { from: `${localDate}T13:00:00.000Z`, to: `${localDate}T16:00:00.000Z`, hours: 4, min_score: score, qualified: true },
  best: readingHour(`${localDate}T13:00:00.000Z`, score),
})
const scored = (hours = twoDays, days: ReadingsDay[] = [readingsDay(DAY_1, 80)]): HourlySeries =>
  series(hours, {
    readings: { model: 'gfs_seamless', unavailable_reason: null, hours: hours.map((h) => readingHour(h.valid_at, 80)), days },
  })

describe('hourRows — which sample a figure comes from', () => {
  it('reads rain, chance and sun from the stamp at the hour’s end, and the rest at its start', () => {
    const hours = twoDays.map((h, i) =>
      i === 7 ? { ...h, precip_mm_mean: 2.54, precip_chance_pct: 70, temp_c_p50: 10 } : h,
    )
    const sun: SunHour[] = [{ valid_at: at(7), local_date: DAY_1, daylight: true, sun_min: 25, shortwave_wm2: 300, cloud_pct: 40 }]
    const { rows } = hourRows(series(hours, { sky: { model: 'gfs_seamless', hours: [], sun, days: [] } }), DAY_1, CITY, label)
    // The 6 AM row is 6 to 7 AM: the rain stamped 7:00 fell in it.
    expect(rows[6]).toMatchObject({ chancePct: 70, rainIn: 0.1, sunMin: 25, tempF: 59 })
    // The 7 AM row's temperature is the 7:00 sample's; its rain is the 8:00 stamp's.
    expect(rows[7]).toMatchObject({ tempF: 50, chancePct: 0, rainIn: 0 })
  })

  it('reads the 11 PM row’s rain from the next day’s midnight, and withholds it when the window ends there', () => {
    const wet = twoDays.map((h, i) => (i === 24 ? { ...h, precip_chance_pct: 55 } : h))
    expect(hourRows(series(wet), DAY_1, CITY, label).rows[23]?.chancePct).toBe(55)
    const cut = twoDays.slice(0, 24)
    expect(hourRows(series(cut), DAY_1, CITY, label).rows[23]).toMatchObject({ chancePct: null, rainIn: null })
  })

  it('keeps every gap a null, never a zero', () => {
    const gaps = twoDays.map((h) => ({ ...h, temp_c_p50: null, wind_kmh_p50: null, wind_gust_kmh: null, humidity_pct: null, precip_chance_pct: null, precip_mm_mean: null }))
    const r = hourRows(series(gaps), DAY_1, CITY, label).rows[3]!
    expect([r.tempF, r.windMph, r.gustMph, r.humidityPct, r.chancePct, r.rainIn, r.sunMin, r.daylight]).toEqual([null, null, null, null, null, null, null, null])
  })

  it('never puts the gust under the median it sits over', () => {
    const calm = twoDays.map((h) => ({ ...h, wind_kmh_p50: 32, wind_gust_kmh: 16 }))
    expect(hourRows(series(calm), DAY_1, CITY, label).rows[0]).toMatchObject({ windMph: 20, gustMph: 20 })
  })

  it('gives night no sun minutes, only the word', () => {
    const sun: SunHour[] = [{ valid_at: at(3), local_date: DAY_1, daylight: false, sun_min: 0, shortwave_wm2: 0, cloud_pct: 10 }]
    expect(hourRows(series(twoDays, { sky: { model: 'gfs_seamless', hours: [], sun, days: [] } }), DAY_1, CITY, label).rows[2]).toMatchObject({ daylight: false, sunMin: null })
  })
})

describe('hourRows — score and good hours', () => {
  it('scores a crag’s hours and names its window by stamp', () => {
    const out = hourRows(scored(), DAY_1, CRAG, label)
    expect(out.scored).toBe(true)
    expect(out.rows[13]?.score).toBe(80)
    expect(out.good).toEqual({ from: Date.parse(`${DAY_1}T13:00:00.000Z`), to: Date.parse(`${DAY_1}T16:00:00.000Z`), label: label(readingsDay(DAY_1, 80).window) })
  })

  it('gives a city no score and no good hours, even when readings came back', () => {
    const out = hourRows(scored(), DAY_1, CITY, label)
    expect(out.scored).toBe(false)
    expect(out.rows.every((r) => r.score === null)).toBe(true)
    expect(out.good).toBeNull()
  })

  it('matches the window by date, never by position', () => {
    expect(hourRows(scored(twoDays, [readingsDay(DAY_2, 80)]), DAY_1, CRAG, label).good).toBeNull()
  })

  it('says no good hours only for a day the readings scored without a window', () => {
    const none = { ...readingsDay(DAY_1, 30), window: null }
    expect(hourRows(scored(twoDays, [none]), DAY_1, CRAG, label).noGood).toBe(true)
    // A day the readings never reached is a gap, not a day without good hours.
    expect(hourRows(scored(twoDays, []), DAY_1, CRAG, label).noGood).toBe(false)
    const unavailable = scored(twoDays, [none])
    expect(hourRows({ ...unavailable, readings: { ...unavailable.readings!, unavailable_reason: 'model_unavailable' } }, DAY_1, CRAG, label).noGood).toBe(false)
    expect(hourRows(scored(twoDays, [none]), DAY_1, CITY, label).noGood).toBe(false)
  })

  it('leaves an unread hour unscored rather than borrowing a neighbour’s', () => {
    const s = scored()
    const readings = { ...s.readings!, hours: s.readings!.hours.filter((r) => r.valid_at !== at(14)) }
    expect(hourRows({ ...s, readings }, DAY_1, CRAG, label).rows[14]?.score).toBeNull()
  })
})

describe('hourRows — scales printed in the heads', () => {
  it('holds the wettest hour, never under its floor', () => {
    expect(scaleTop(0, 0.1, [0.1, 0.2])).toBe(0.1)
    expect(scaleTop(0.15, 0.1, [0.1, 0.2])).toBe(0.2)
    expect(scaleTop(55, 40, [40, 50, 60])).toBe(60)
  })

  it('takes the temperature scale from the day’s band, not one hour', () => {
    const { scale } = hourRows(series(twoDays.map((h, i) => (i === 10 ? { ...h, temp_c_p90: 30 } : h))), DAY_1, CITY, label)
    expect(scale.lowF).toBe(54)
    expect(scale.highF).toBe(86)
  })
})

describe('row helpers', () => {
  it('folds only the hours already over, keeping the one covering now', () => {
    const { rows } = hourRows(series(twoDays), DAY_1, CITY, label)
    expect(firstAhead(rows, T0 + 9.5 * HOUR_MS)).toBe(9)
    expect(firstAhead(rows, T0 - HOUR_MS)).toBe(0)
  })

  it('prints rain as a figure, a trace as tr, a gap as null', () => {
    expect([rowInches(null), rowInches(0), rowInches(0.002), rowInches(0.04), rowInches(1.23)]).toEqual([null, '0', 'tr', '.04', '1.2'])
  })

  it('names where the wind comes from', () => {
    expect([compass(0), compass(225), compass(359), compass(null)]).toEqual(['N', 'SW', 'N', null])
  })
})

describe('HourlyRows — on screen', () => {
  const render = (s: HourlySeries, showScore: boolean, readMs: number | null = null) =>
    renderToStaticMarkup(
      <HourlyRows series={s} selectedDate={DAY_2} onSelectDate={() => {}} readMs={readMs} onRead={() => {}} showScore={showScore} />,
    )

  it('offers the five views as pressed buttons, All first', () => {
    const html = render(scored(), true)
    for (const v of ['All', 'Temp', 'Rain', 'Wind', 'Sun']) expect(html).toContain(`>${v}</button>`)
    expect(html).toMatch(/aria-pressed="true"[^>]*>All</)
  })

  it('has a score column for a crag and none for a city', () => {
    expect(render(scored(), true)).toContain('>Score<')
    expect(render(scored(), false)).not.toContain('>Score<')
  })

  it('prints a gap as a dash', () => {
    const gaps = twoDays.map((h) => (h.local_date === DAY_2 ? { ...h, temp_c_p50: null } : h))
    expect(render(series(gaps), false)).toContain('>—<')
  })

  it('opens the hour the header reads, with every figure labelled', () => {
    const html = render(scored(), true, Date.parse(at(30)))
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('Humidity · dew point')
    expect(html).toContain('from W')
  })

  it('says when a scored day has no good hours, and nothing for a day the readings never reached', () => {
    expect(render(scored(twoDays, [{ ...readingsDay(DAY_2, 30), window: null }]), true)).toContain('No good hours on')
    expect(render(scored(twoDays, []), true)).not.toContain('good hours')
  })
})
