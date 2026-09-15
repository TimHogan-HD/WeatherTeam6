import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { Wall } from '@weatherteam6/types'
import { apiGet } from '../lib/api.js'

/**
 * The named walls of a crag — `GET /walls/:locationId`.
 *
 * **Expect an empty array, and treat that as the normal case.** The `walls`
 * table has full CRUD and no writer: no seed, no importer and no UI fills it,
 * so today every saved location has none. The strip in `LocationIdentity`
 * therefore renders nothing at all rather than a heading over a blank row.
 *
 * Saved climbing locations only, like `useConditions` and `useRecentPrecip`.
 * `undefined` for `isClimbingLocation` holds the fetch while the location query
 * is still in flight rather than guessing.
 */
export function useWalls(
  id: string | undefined,
  isClimbingLocation: boolean | undefined,
): UseQueryResult<Wall[]> {
  return useQuery({
    queryKey: ['walls', id ?? ''] as const,
    queryFn: () => apiGet<Wall[]>(`/walls/${id ?? ''}`),
    enabled: id !== undefined && id !== '' && isClimbingLocation === true,
  })
}
