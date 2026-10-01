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
