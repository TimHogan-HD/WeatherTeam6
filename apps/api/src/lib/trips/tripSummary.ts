import type { RockLevel, TripDayForecast, TripDayLookBack, TripDayOutcome } from '@weatherteam6/types'

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

/** Every date from `start` to `end`, inclusive. */
export function tripDateList(start: string, end: string): string[] {
  const out: string[] = []
  for (let t = Date.parse(start); t <= Date.parse(end); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10))
  return out
}
