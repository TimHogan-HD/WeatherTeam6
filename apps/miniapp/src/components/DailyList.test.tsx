import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { toneSurfacesV2, colorsV2 } from '@weatherteam6/design/tokens'
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
import { DailyList, dayRainChance, rainChipText } from './DailyList.js'

/**
 * The Daily tab's card. What it must get right, and what would pass every
 * gate while wrong on screen:
 *
 * - the pill is the Crag A day score, joined on the date and **suppressed** the
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
function readingsDay(localDate: string, score: number | null): ReadingsDay {
  const best: HourlyReading | null =
    score === null
      ? null
      : {
          valid_at: `${localDate}T15:00:00.000Z`,
          rock: { level: 'dry', qualified: true },
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

/** The pills' text, in row order. */
function pills(html: string): string[] {
  return [...html.matchAll(/>Score (\d+)</g)].map((m) => m[1] ?? '')
}

describe('DailyList — rows', () => {
  it('draws one titled row per day, in date order whatever order they arrive in', () => {
    const html = render(
      <DailyList days={[day(DATES[2]), day(DATES[0]), day(DATES[1])]} readings={null} hours={[]} />,
    )
    expect(html).toContain('Next 3 days')
    const titles = [...html.matchAll(/>(\w+day · \d+\/\d+)</g)].map((m) => m[1])
    expect(titles).toEqual(['Monday · 9/14', 'Tuesday · 9/15', 'Wednesday · 9/16'])
  })

  it('prints the low and high, and dashes a missing one rather than printing 32°', () => {
    const html = render(
      <DailyList
        days={[day(DATES[0]), day(DATES[1], { temp_c_min: null })]}
        readings={null}
        hours={[]}
      />,
    )
    expect(html).toContain('aria-label="Low 50°, high 68°"')
    expect(html).toContain(`aria-label="Low ${EM_DASH}, high 68°"`)
    expect(html).not.toContain('32°')
  })

  it('prints the peak wind through the shared formatter', () => {
    const html = render(<DailyList days={[day(DATES[0])]} readings={null} hours={[]} />)
    expect(html).toContain(`>${formatWindMph(12)}<`)
    expect(html).toContain('peak wind')
  })
})

describe('DailyList — the score pill', () => {
  it('is the Crag A day score, joined on the date rather than on position', () => {
    // The readings arrive in reverse: a positional join would give Monday 40.
    const html = render(
      <DailyList
        days={[day(DATES[0], { score: 12 }), day(DATES[1], { score: 12 })]}
        readings={readings([readingsDay(DATES[1], 40), readingsDay(DATES[0], 90)])}
        hours={[]}
      />,
    )
    expect(pills(html)).toEqual(['90', '40'])
  })

  it('prints a real zero, and no pill for a day the model could not read', () => {
    const html = render(
      <DailyList
        days={[day(DATES[0]), day(DATES[1])]}
        readings={readings([readingsDay(DATES[0], 0), readingsDay(DATES[1], null)])}
        hours={[]}
      />,
    )
    expect(pills(html)).toEqual(['0'])
  })

  it('is dropped under a Severe+ alert and while the alerts query is in flight', () => {
    const days = [day(DATES[0])]
    const r = [readingsDay(DATES[0], 90)]
    expect(pills(render(<DailyList days={days} readings={readings(r, { severeAlertEvent: 'Extreme Heat Warning' })} hours={[]} />))).toEqual([])
    expect(pills(render(<DailyList days={days} readings={readings(r, { alertsPending: true })} hours={[]} />))).toEqual([])
  })

  it('is absent with no readings at all — a city, the preview, or /hourly in flight', () => {
    expect(pills(render(<DailyList days={[day(DATES[0])]} readings={null} hours={[]} />))).toEqual([])
  })

  it('tints the row by the score’s rung, and leaves an unscored row plain', () => {
    const html = render(
      <DailyList
        days={[day(DATES[0]), day(DATES[1])]}
        readings={readings([readingsDay(DATES[0], 95)])}
        hours={[]}
      />,
    )
    expect(html).toContain(`background-color:${toneSurfacesV2.good.row}`)
    expect(html).toContain(`background-color:${colorsV2.raised}`)
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
        onSelectDay={() => {}}
        drawableDates={new Set([DATES[0], DATES[1]])}
      />,
    )
    expect(html.match(/<button/g)?.length).toBe(2)
    expect(html).toContain('Days without an hour-by-hour forecast can&#x27;t be opened.')
  })

  it('says nothing about untappable days when every day is tappable', () => {
    const html = render(
      <DailyList
        days={week}
        readings={null}
        hours={[]}
        onSelectDay={() => {}}
        drawableDates={new Set(DATES)}
      />,
    )
    expect(html.match(/<button/g)?.length).toBe(7)
    expect(html).not.toContain('can&#x27;t be opened')
  })

  it('renders no row as a button when there is no hourly data at all', () => {
    // The `/add` preview. A row that looks tappable and does nothing is worse
    // than a row that does not.
    expect(render(<DailyList days={week} readings={null} hours={[]} />)).not.toContain('<button')
  })
})

describe('rainChipText', () => {
  it('pairs the likeliest hour’s chance with the median amount', () => {
    const hours = hoursFor(DATES[0], (i) => (i === 3 ? 36 : 5))
    expect(rainChipText(day(DATES[0]), hours)).toBe(`36% · ${formatPrecipIn(1)}`)
  })

  it('leaves the chance off rather than writing 0% when no hour carries a wet count', () => {
    expect(rainChipText(day(DATES[0]), hoursFor(DATES[0], () => null))).toBe(formatPrecipIn(1))
    expect(rainChipText(day(DATES[0]), [])).toBe(formatPrecipIn(1))
  })

  it('dashes a missing amount', () => {
    expect(rainChipText(day(DATES[0], { precip_mm_p50: null }), [])).toBe(EM_DASH)
  })
})

describe('dayRainChance', () => {
  it('takes the day’s likeliest hour, and only that day’s hours', () => {
    const mixed = [
      ...hoursFor(DATES[0], (i) => (i === 3 ? 45 : 10)),
      ...hoursFor(DATES[1], () => 90),
    ]
    expect(dayRainChance(mixed, DATES[0])).toBe(45)
    expect(dayRainChance(mixed, DATES[1])).toBe(90)
  })

  it('is null when nothing on that day carries a wet count', () => {
    expect(dayRainChance(hoursFor(DATES[0], () => null), DATES[0])).toBeNull()
    expect(dayRainChance([], DATES[0])).toBeNull()
  })
})
