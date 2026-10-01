import type { QueryClient } from '@tanstack/react-query'
import type { Location } from '@weatherteam6/types'
import { alertsQuery, conditionsQuery, forecastQuery } from '../hooks/useWeather.js'
import { hourlyQuery } from '../hooks/useHourly.js'
import { recentPrecipQuery } from '../hooks/useRecentPrecip.js'
import { wallsQuery } from '../hooks/useWalls.js'
import { guidebookQuery } from '../hooks/useGuidebook.js'

/**
 * Starts the crag screen's queries when a finger lands on its card, so the
 * fetch is a tap's length ahead of the navigation that lifting it causes.
 *
 * **The same query definitions `LocationDetail` reads**, so a prefetched answer
 * is the one the screen finds, and an answer still inside `staleTime` is not
 * asked for again — a finger dragged across the list to scroll fetches each
 * crag at most once per five minutes. Prefetching every card on load was the
 * bigger win and was not taken: it multiplies upstream weather calls, which
 * `queryClient.ts` already avoids for suspected rate limiting.
 *
 * **`prefetchQuery` ignores `enabled`**, so the climbing-only gates
 * (`useConditions`, `useWalls`, `useGuidebook`) are repeated here rather than
 * read from the options — a city must not be asked for a rock-drying score.
 */
export function prefetchDetail(queryClient: QueryClient, location: Location): void {
  const { id, is_climbing_location: climbing } = location
  void queryClient.prefetchQuery(forecastQuery(id))
  void queryClient.prefetchQuery(alertsQuery(id))
  void queryClient.prefetchQuery(hourlyQuery(id))
  void queryClient.prefetchQuery(recentPrecipQuery(id))
  if (!climbing) return
  void queryClient.prefetchQuery(conditionsQuery(id, climbing))
  void queryClient.prefetchQuery(wallsQuery(id, climbing))
  void queryClient.prefetchQuery(guidebookQuery(id, climbing))
}

/**
 * The longest a tapped card waits before its screen opens anyway. Long enough
 * for a stored hourly read (~250 ms on the live API, 2026-10-01), short enough
 * that a slow network still feels like a tap that registered.
 */
export const OPEN_WAIT_MS = 300

/**
 * Resolves when the crag screen can open whole: once the hourly series is in
 * the cache, or after `OPEN_WAIT_MS`, whichever comes first.
 *
 * The hourly series is what the screen drew late (owner's recording,
 * 2026-10-01): the big temperature, the Today chart and the day scores sat as
 * grey blocks for ~0.3 s after the screen opened. Everything else on the
 * Overview is already cached by the list's card. **Any cached series opens at
 * once**, even a stale one, because the screen draws it while it refetches.
 * The fetch itself was started on touch-down; asking again joins it.
 */
export function readyToOpen(queryClient: QueryClient, location: Location): Promise<void> {
  const hourly = hourlyQuery(location.id)
  if (queryClient.getQueryData(hourly.queryKey) !== undefined) return Promise.resolve()
  return Promise.race([
    queryClient.prefetchQuery(hourly),
    new Promise<void>((resolve) => setTimeout(resolve, OPEN_WAIT_MS)),
  ])
}
