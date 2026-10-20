import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  EM_DASH,
  formatPrecipIn,
  formatWindMph,
  type ForecastSnapshot,
  type HourlyReading,
  type HourlySample,
  type ReadingsDay,
} from '@weatherteam6/types'
import type { DayReadings } from '../lib/overview.js'
import { DailyList, dailyFoot, dayRainChance } from './DailyList.js'

/**
 * The Daily tab's Seven days card. What it must get right, and what would pass
 * every gate while wrong on screen:
 *
 * - the score is the Crag A day score, joined on the date and **suppressed** the
 *   way the hero suppresses it — never the forecast row's five-component score;
 * - a missing figure is a dash, never 32° or 0%;
 * - a row opens a drill-down only when the hourly charts can draw that day.
 */

const DATES = [
  '2026-09-14',
  '2026-09-15',
  '2026-09-16',
  '2026-09-17',
  '2026-09-18',
  '2026-09-19',
  '2026-09-20',
] as const

function day(date: string, over: Partial<ForecastSnapshot> = {}): ForecastSnapshot {
  return {
    id: `snap-${date}`,
    location_id: 'loc',
    captured_at: `${date}T00:00:00.000Z`,
    forecast_date: date,
    precip_mm_p10: 0,
    precip_mm_p50: 1,
    precip_mm_p90: 4,
    temp_c_min: 10,
    temp_c_max: 20,
    wind_kmh_max: 12,
    humidity_pct: 40,
    model_sources: ['gfs_seamless'],
    created_at: `${date}T00:00:00.000Z`,
    is_today: date === DATES[0],
    ...over,
  }
}

/** One day's readings; `score: null` is a day the model could not read. */
function readingsDay(localDate: string, score: number | null, rock: 'dry' | 'wet' = 'dry'): ReadingsDay {
  const best: HourlyReading | null =
    score === null
      ? null
      : {
          valid_at: `${localDate}T15:00:00.000Z`,
          rock: { level: rock, qualified: true },
          friction: { level: 'great', condensing: false, qualified: true },
          score,
          t_surface_c: 18,
          condensation_margin_c: 4,
        }
  return { local_date: localDate, window: null, best }
}

function readings(days: ReadingsDay[], over: Partial<DayReadings> = {}): DayReadings {
  return { days, utcOffsetSeconds: 0, severeAlertEvent: null, alertsPending: false, ...over }
}

/** 24 hours of `localDate`, every field null but the chance of rain. */
function hoursFor(localDate: string, chance: (i: number) => number | null): HourlySample[] {
  return Array.from({ length: 24 }, (_, i) => ({
    valid_at: `${localDate}T${String(i).padStart(2, '0')}:00:00.000Z`,
    local_date: localDate,
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
    precip_chance_pct: chance(i),
    member_count: 143,
  }))
}

function render(node: Parameters<typeof renderToStaticMarkup>[0]): string {
  return renderToStaticMarkup(node)
}

/** Each row's score cell, in row order: a number, a dash, or empty for a city. */
function scores(html: string): string[] {
  return [...html.matchAll(/data-day-score=""[^>]*>([^<]*)</g)].map((m) => m[1] ?? '')
}

describe('DailyList — rows', () => {
  it('draws one named row per day, in date order whatever order they arrive in', () => {
    const html = render(
      <DailyList days={[day(DATES[2]), day(DATES[0]), day(DATES[1])]} readings={null} hours={[]} sky={[]} />,
    )
    expect(html).toContain('Seven days')
    const names = [...html.matchAll(/>(Today|Mon|Tue|Wed|Thu|Fri|Sat|Sun)</g)].map((m) => m[1])
    expect(names).toEqual(['Today', 'Tue', 'Wed'])
  })

  it('prints the low and high, and dashes a missing one rather than printing 32°', () => {
    const html = render(
      <DailyList days={[day(DATES[0]), day(DATES[1], { temp_c_min: null })]} readings={null} hours={[]} sky={[]} />,
    )
    expect(html).toContain('>50°<')
    expect(html).toContain('>68°<')
    expect(html).toContain(`>${EM_DASH}<`)
    expect(html).not.toContain('32°')
  })

  it('prints the rain amount and peak wind through the shared formatters', () => {
    const html = render(<DailyList days={[day(DATES[0])]} readings={null} hours={[]} sky={[]} />)
    expect(html).toContain(`${formatPrecipIn(1)} · peak wind`)
    expect(html).toContain(`peak wind ${formatWindMph(12)}`)
  })

  it('names the day’s good hours and Dryness beside its score', () => {
    const html = render(
      <DailyList days={[day(DATES[0])]} readings={readings([readingsDay(DATES[0], 30, 'wet')])} hours={[]} sky={[]} />,
    )
    expect(html).toContain('>no good hours · Wet · ')
  })

  it('draws a 24-cell hour strip per day only when the run’s offset is known, and says what it is', () => {
    const hours = hoursFor(DATES[0], () => 20)
    const strip = (html: string) => html.match(/grid-template-columns:repeat\(24/g)?.length ?? 0
    const without = render(<DailyList days={[day(DATES[0])]} readings={null} hours={hours} sky={[]} />)
    expect(strip(without)).toBe(0)
    expect(without).not.toContain('The strip under each day')
    const city = render(<DailyList days={[day(DATES[0])]} readings={null} hours={hours} sky={[]} utcOffsetSeconds={0} />)
    expect(strip(city)).toBe(1)
    expect(city).toContain(dailyFoot(false, false, true))
    expect(city).toContain('chance of rain in each hour;')
    const gaps = render(
      <DailyList days={[day(DATES[0])]} readings={null} hours={hoursFor(DATES[0], (i) => (i === 0 ? null : 0))} sky={[]} utcOffsetSeconds={0} />,
    )
    expect(gaps.match(/box-shadow:inset 0 0 0 1px/g)?.length).toBe(1)
    const crag = render(
      <DailyList days={[day(DATES[0])]} readings={readings([readingsDay(DATES[0], 80)])} hours={hours} sky={[]} hourReadings={[]} utcOffsetSeconds={0} />,
    )
    expect(crag).toContain('coloured by the score of each hour')
  })

  it('says how a day score and the chance of rain are made', () => {
    const city = render(<DailyList days={[day(DATES[0])]} readings={null} hours={[]} sky={[]} />)
    expect(city).toContain(dailyFoot(false, false))
    expect(city).not.toContain('A day score is')
    expect(city).not.toContain('Tap a day')
    const crag = render(
      <DailyList
        days={[day(DATES[0])]}
        readings={readings([readingsDay(DATES[0], 80)])}
        hours={[]}
        sky={[]}
        onSelectDay={() => {}}
        drawableDates={new Set([DATES[0]])}
      />,
    )
    expect(crag).toContain(dailyFoot(true, true))
  })
})

describe('DailyList — the chance of rain', () => {
  it('is the day’s likeliest hour, and a dash rather than 0% with no wet count', () => {
    const html = render(
      <DailyList
        days={[day(DATES[0]), day(DATES[1])]}
        readings={null}
        hours={[...hoursFor(DATES[0], (i) => (i === 3 ? 36 : 5)), ...hoursFor(DATES[1], () => null)]}
        sky={[]}
      />,
    )
    expect(html).toContain('>36%<')
    expect(html).not.toContain('>0%<')
  })
})

describe('DailyList — the score', () => {
  it('is the Crag A day score, joined on the date rather than on position', () => {
    // The readings arrive in reverse: a positional join would give the first day 40.
    const html = render(
      <DailyList
        days={[day(DATES[0]), day(DATES[1])]}
        readings={readings([readingsDay(DATES[1], 40), readingsDay(DATES[0], 90)])}
        hours={[]}
        sky={[]}
      />,
    )
    expect(scores(html)).toEqual(['90', '40'])
  })

  it('prints a real zero, and a dash for a day the model could not read', () => {
    const html = render(
      <DailyList
        days={[day(DATES[0]), day(DATES[1])]}
        readings={readings([readingsDay(DATES[0], 0), readingsDay(DATES[1], null)])}
        hours={[]}
        sky={[]}
      />,
    )
    expect(scores(html)).toEqual(['0', EM_DASH])
  })

  it('is withheld under a Severe+ alert and while the alerts query is in flight', () => {
    const days = [day(DATES[0])]
    const r = [readingsDay(DATES[0], 90)]
    expect(scores(render(<DailyList days={days} readings={readings(r, { severeAlertEvent: 'Extreme Heat Warning' })} hours={[]} sky={[]} />))).toEqual([EM_DASH])
    expect(scores(render(<DailyList days={days} readings={readings(r, { alertsPending: true })} hours={[]} sky={[]} />))).toEqual([EM_DASH])
  })

  it('is empty with no readings at all — a city, or /hourly in flight', () => {
    expect(scores(render(<DailyList days={[day(DATES[0])]} readings={null} hours={[]} sky={[]} />))).toEqual([''])
  })
})

describe('DailyList — opening a day', () => {
  const week = DATES.map((d) => day(d))

  it('makes only the days the hourly response can draw tappable, and says why the rest are not', () => {
    const html = render(
      <DailyList
        days={week}
        readings={null}
        hours={[]}
        sky={[]}
        onSelectDay={() => {}}
        drawableDates={new Set([DATES[0], DATES[1]])}
      />,
    )
    expect(html.match(/<button/g)?.length).toBe(2)
    expect(html).toContain('Days without an hour-by-hour forecast can&#x27;t be opened.')
  })

  it('says nothing about untappable days when every day is tappable', () => {
    const html = render(
      <DailyList days={week} readings={null} hours={[]} sky={[]} onSelectDay={() => {}} drawableDates={new Set(DATES)} />,
    )
    expect(html.match(/<button/g)?.length).toBe(7)
    expect(html).not.toContain('can&#x27;t be opened')
  })

  it('renders no row as a button when there is no hourly data at all', () => {
    expect(render(<DailyList days={week} readings={null} hours={[]} sky={[]} />)).not.toContain('<button')
  })
})

describe('dayRainChance', () => {
  it('takes the day’s likeliest hour, and only that day’s hours', () => {
    const mixed = [...hoursFor(DATES[0], (i) => (i === 3 ? 45 : 10)), ...hoursFor(DATES[1], () => 90)]
    expect(dayRainChance(mixed, DATES[0])).toBe(45)
    expect(dayRainChance(mixed, DATES[1])).toBe(90)
  })

  it('is null when nothing on that day carries a wet count', () => {
    expect(dayRainChance(hoursFor(DATES[0], () => null), DATES[0])).toBeNull()
    expect(dayRainChance([], DATES[0])).toBeNull()
  })
})

describe('DailyList — sky', () => {
  it('draws a sky only for days the response has one for, joined on the date', () => {
    const html = render(
      <DailyList
        days={[day(DATES[0]), day(DATES[1])]}
        readings={null}
        hours={[]}
        sky={[
          { local_date: '2026-09-30', summary: 'cloudy' },
          { local_date: DATES[1], summary: 'sunny' },
          { local_date: DATES[0], summary: null },
        ]}
      />,
    )
    expect(html.match(/<svg/g)?.length ?? 0).toBe(1)
  })
})
