import type { ApiResponse, Conditions, ForecastSnapshot, ListPlace, ListResponse, RainNow, WeatherAlert } from '@weatherteam6/types'
import { describeError } from '../http.js'
import { logger } from '../logger.js'

/**
 * **How long one part of one place may take before `GET /list` answers without
 * it** (#606). A judgement call: a stored-run read answers in well under a
 * second, and the slow path is a cold upstream fetch, which `fetchWithRetry`
 * lets run to `FETCH_BUDGET_MS` (45 s). Past this the part comes back as a 504
 * and the client asks that place's own route, so one slow crag costs its card a
 * second request rather than holding every card. 8 s plus the locations read
 * fits the function's 60 s `maxDuration` with room.
 *
 * The work behind a timed-out part is not cancelled; its result is dropped.
 */
export const LIST_PART_LIMIT_MS = 8_000

/** The location columns every part needs, as the driver returns them. */
export type ListLocation = {
  id: string
  lat: string
  lon: string
  elevation_m: string | null
  rock_type: string | null
  cliff_angle: string | null
  aspect: string | null
  is_climbing_location: boolean
}

/**
 * The per-place routes' own lib functions, injected so the composition is
 * testable without a database. `GET /list` passes the same functions
 * `/forecast/:id`, `/alerts/:id`, `/conditions/:id` and `/rain-now` call.
 */
export type ListParts<L extends ListLocation> = {
  forecast: (location: L) => Promise<ForecastSnapshot[]>
  alerts: (locationId: string) => Promise<WeatherAlert[]>
  conditions: (location: L) => Promise<Conditions>
  rainNow: (locations: readonly L[]) => Promise<RainNow | null>
}

const TIMED_OUT = Symbol('timed out')

/**
 * One part as its own envelope. A rejection is a 500 and a part past `limitMs`
 * a 504, each with `data: null`: an error the card can tell from a real answer,
 * never an empty array (defect class 2).
 */
export async function settlePart<T>(
  work: () => Promise<T>,
  limitMs: number,
  label: string,
): Promise<ApiResponse<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), limitMs)
  })
  try {
    // `work` is called inside the try, so a synchronous throw is a 500 too.
    const outcome = await Promise.race([work(), deadline])
    if (outcome === TIMED_OUT) {
      logger.warn({ part: label, limitMs }, 'list: part timed out')
      return { data: null, error: 'Timed out', status: 504 }
    }
    return { data: outcome, error: null, status: 200 }
  } catch (err) {
    logger.warn({ part: label, err: describeError(err) }, 'list: part failed')
    return { data: null, error: 'Unavailable', status: 500 }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * `GET /list`'s body: every place's forecast, alerts and (for a crag)
 * conditions, and the rain-now frame, all at once.
 *
 * Every part of every place runs concurrently (`architecture.md` § Background
 * jobs: never sequentially), and each settles on its own, so one crag's failure
 * or slow fetch leaves every other part intact. `conditions` is `null` for a
 * place that is not a crag: the server never asks for a city's score, whatever
 * the client does. No part waits on another, so an alert never withholds a
 * score.
 */
export async function buildList<L extends ListLocation>(
  locations: readonly L[],
  parts: ListParts<L>,
  limitMs: number = LIST_PART_LIMIT_MS,
): Promise<ListResponse> {
  const placesWork = locations.map(async (location): Promise<ListPlace> => {
    const [forecast, alerts, conditions] = await Promise.all([
      settlePart(() => parts.forecast(location), limitMs, 'forecast'),
      settlePart(() => parts.alerts(location.id), limitMs, 'alerts'),
      location.is_climbing_location
        ? settlePart(() => parts.conditions(location), limitMs, 'conditions')
        : Promise.resolve(null),
    ])
    return { location_id: location.id, forecast, alerts, conditions }
  })
  const [places, rainNow] = await Promise.all([
    Promise.all(placesWork),
    settlePart(() => parts.rainNow(locations), limitMs, 'rain-now'),
  ])
  return { places, rain_now: rainNow }
}
