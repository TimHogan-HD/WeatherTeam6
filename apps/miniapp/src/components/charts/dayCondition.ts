import type { HourlySample } from '@weatherteam6/types'

/**
 * A day's headline condition, for the icon beside its row.
 *
 * **Derived from the hourly run, because the daily row has nothing to derive it
 * from.** `ForecastSnapshot` carries precipitation, temperature, wind and
 * humidity — no cloud cover and no condition code. The hourly response does,
 * and the Daily tab already fetches it for the drill-down.
 *
 * **`null` is a state, and it is the common one at the far end of the week.**
 * A day the run does not reach gets no icon rather than a sun: an icon is a
 * claim about the sky, and "no data" drawn as clear weather is defect class 1
 * at its most literal. Nothing here falls back.
 *
 * Rain outranks cloud, because a reader scanning for "can I climb" is asking
 * about rain first and a bright rainy day is still a rainy day.
 */
export type DayCondition = 'rain' | 'cloud' | 'partly' | 'clear'

/**
 * Where a day tips from showers into rain, as a share of the ensemble.
 *
 * 30% of members carrying measurable rain in the wettest hour is enough to draw
 * the rain icon — well below "likely", because the icon is a prompt to read the
 * row rather than a forecast in itself, and the row's own figures are right
 * beside it.
 */
const RAIN_CHANCE_PCT = 30

/** The local hours a reader means by "during the day". */
const DAY_START_HOUR = 8
const DAY_END_HOUR = 18

/** Cloud cover breakpoints, the conventional okta bands rounded to percentages. */
const CLEAR_MAX_PCT = 30
const PARTLY_MAX_PCT = 70

export function dayCondition(
  hours: readonly HourlySample[],
  localDate: string,
  utcOffsetSeconds: number,
): DayCondition | null {
  const own = hours.filter((h) => h.local_date === localDate)
  if (own.length === 0) return null

  // **The day's peak, not its mean.** An afternoon thunderstorm is a rainy day
  // even though twenty of its hours are dry, and averaging the chance across
  // them buries exactly the thing the icon is for.
  const chances = own.map((h) => h.precip_chance_pct).filter((v): v is number => v !== null)
  if (chances.length > 0 && Math.max(...chances) >= RAIN_CHANCE_PCT) return 'rain'

  // **Daylight hours only, on the location's clock.** Cloud cover is about what
  // the sky looks like, and including the small hours drags a clear afternoon
  // toward whatever the night did.
  //
  // `valid_at` is a **UTC instant**, so its 11th and 12th characters are the UTC
  // hour — reading those as local is issue #33 exactly, and at Red Rock it
  // would take the daylight window from 08:00-18:00 to 01:00-11:00. Shift the
  // epoch and read the UTC hour of the shifted instant, as `localDateString` and
  // `formatLocalHourShort` both do.
  const offset = Number.isFinite(utcOffsetSeconds) ? utcOffsetSeconds : 0
  const daytime = own.filter((h) => {
    const t = Date.parse(h.valid_at)
    if (!Number.isFinite(t)) return false
    const hour = new Date(t + offset * 1000).getUTCHours()
    return hour >= DAY_START_HOUR && hour <= DAY_END_HOUR
  })
  const clouds = (daytime.length > 0 ? daytime : own)
    .map((h) => h.cloud_pct)
    .filter((v): v is number => v !== null)

  // No cloud reading is not a clear sky. The deterministic model can reach a
  // day the ensemble does not, and the reverse, so this is reachable with a
  // real chance of rain already ruled out.
  if (clouds.length === 0) return null

  const mean = clouds.reduce((sum, v) => sum + v, 0) / clouds.length
  if (mean <= CLEAR_MAX_PCT) return 'clear'
  if (mean <= PARTLY_MAX_PCT) return 'partly'
  return 'cloud'
}
