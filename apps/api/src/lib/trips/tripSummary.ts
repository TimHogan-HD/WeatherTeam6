import type {
  RockLevel,
  TripDayForecast,
  TripDayLookBack,
  TripDayOutcome,
  TripDayTrend,
  TripDayTrendPoint,
} from '@weatherteam6/types'

export type ForecastRecord = {
  local_date: string
  recorded_at: Date
  lead_days: number
  score: number | null
  dryness: RockLevel | null
  precip_mm_mean: number | null
  members_wet: number | null
  member_count: number | null
}

export type OutcomeRecord = TripDayOutcome & { local_date: string }

function toForecast(r: ForecastRecord): TripDayForecast {
  return {
    recorded_at: r.recorded_at.toISOString(),
    lead_days: r.lead_days,
    score: r.score,
    dryness: r.dryness,
    precip_mm_mean: r.precip_mm_mean,
    members_wet: r.members_wet,
    member_count: r.member_count,
  }
}

/**
 * Every trip date at one location, with how it turned out and what the forecast
 * said first and last. The first and last are taken among the recordings that
 * carried a score when any did: a weather-only recording from two weeks out
 * set against a scored one would compare two different things.
 */
export function tripDayLookBacks(input: {
  dates: readonly string[]
  records: readonly ForecastRecord[]
  outcomes: readonly OutcomeRecord[]
}): TripDayLookBack[] {
  const outcomeByDate = new Map(input.outcomes.map((o) => [o.local_date, o]))
  return input.dates.map((local_date) => {
    const all = input.records
      .filter((r) => r.local_date === local_date)
      .sort((a, b) => a.recorded_at.getTime() - b.recorded_at.getTime())
    const scored = all.filter((r) => r.score !== null)
    const pool = scored.length > 0 ? scored : all
    const first = pool[0]
    const last = pool[pool.length - 1]
    const o = outcomeByDate.get(local_date)
    return {
      local_date,
      outcome:
        o === undefined
          ? null
          : { score: o.score, dryness: o.dryness, rain_mm: o.rain_mm, temp_c_max: o.temp_c_max, temp_c_min: o.temp_c_min },
      first: first === undefined ? null : toForecast(first),
      last: last === undefined ? null : toForecast(last),
    }
  })
}

export type DayWeatherRecord = {
  local_date: string
  recorded_at: Date
  precip_mm_mean: number | null
  temp_c_max: number | null
}

/**
 * Every trip date at one location, with the first and the latest recording of
 * its weather. A recording that carried a score but no weather is passed over:
 * it would set a gap against a figure and read as a change.
 */
export function tripDayTrends(input: { dates: readonly string[]; records: readonly DayWeatherRecord[] }): TripDayTrend[] {
  return input.dates.map((local_date) => {
    const pool = input.records
      .filter((r) => r.local_date === local_date && (r.precip_mm_mean !== null || r.temp_c_max !== null))
      .sort((a, b) => a.recorded_at.getTime() - b.recorded_at.getTime())
    const point = (r: DayWeatherRecord | undefined): TripDayTrendPoint | null =>
      r === undefined
        ? null
        : { recorded_at: r.recorded_at.toISOString(), precip_mm_mean: r.precip_mm_mean, temp_c_max: r.temp_c_max }
    return { local_date, first: point(pool[0]), last: point(pool[pool.length - 1]) }
  })
}

/** Every date from `start` to `end`, inclusive. */
export function tripDateList(start: string, end: string): string[] {
  const out: string[] = []
  for (let t = Date.parse(start); t <= Date.parse(end); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}

export type GaugeDayRow = {
  station: string
  local_date: string
  rain_mm: number | null
  hours_reported: number
  hours_expected: number
}

/**
 * Each look-back day with its crag's gauge day: the row for the crag's nearest
 * station on that date, else null. A crag with no gauge in reach has null on
 * every day, never another crag's gauge.
 */
export function withGaugeDays(
  days: readonly TripDayLookBack[],
  gauge: { station: string; distance_km: number } | null,
  rows: readonly GaugeDayRow[],
): TripDayLookBack[] {
  return days.map((day) => {
    const row = gauge === null ? undefined : rows.find((r) => r.station === gauge.station && r.local_date === day.local_date)
    return {
      ...day,
      gauge:
        gauge === null || row === undefined
          ? null
          : {
              station: row.station,
              distance_km: gauge.distance_km,
              rain_mm: row.rain_mm,
              hours_reported: row.hours_reported,
              hours_expected: row.hours_expected,
            },
    }
  })
}

/**
 * The local date an instant falls on at a crag: in the crag's gauge zone when
 * it has one, else the longitude's solar offset. Close enough to put a
 * daytime check on its day, which is all a join on dates needs; the server
 * stores no zone for a location.
 */
export function localDateAt(at: Date, tz: string | null, lon: number): string {
  if (tz !== null) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
  }
  return new Date(at.getTime() + Math.round(lon / 15) * 3_600_000).toISOString().slice(0, 10)
}

/**
 * Each look-back day marked with whether the caller has a forecast check at
 * the crag on it (`checkedDates`, local dates). Every check counts, resolved
 * or not: resolving means the owner read it, not that the day is unanswered.
 */
export function withCheckIns(days: readonly TripDayLookBack[], checkedDates: ReadonlySet<string>): TripDayLookBack[] {
  return days.map((day) => ({ ...day, checked_in: checkedDates.has(day.local_date) }))
}
