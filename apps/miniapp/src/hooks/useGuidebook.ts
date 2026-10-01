import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { Guidebook } from '@weatherteam6/types'
import { apiGet } from '../lib/api.js'

/**
 * The OpenBeta crag a saved location sits on — `GET /guidebook/:locationId` —
 * shared by the Crag tab, the wall screen and the route screen, which all read
 * the one response.
 *
 * **`null` is an answer, not a failure**: no OpenBeta crag within reach, which
 * is every location outside Minnesota today. A caller renders it as that.
 *
 * Climbing locations only, like `useConditions`; `undefined` holds the fetch
 * while the location is still loading rather than guessing. The data is a
 * snapshot that changes only on deploy, so it is kept for the session.
 */
export const guidebookQuery = (id: string | undefined, isClimbingLocation: boolean | undefined) =>
  queryOptions({
    queryKey: ['guidebook', id ?? ''] as const,
    queryFn: () => apiGet<Guidebook | null>(`/guidebook/${id ?? ''}`),
    enabled: id !== undefined && id !== '' && isClimbingLocation === true,
    staleTime: Infinity,
  })

export function useGuidebook(
  id: string | undefined,
  isClimbingLocation: boolean | undefined,
): UseQueryResult<Guidebook | null> {
  return useQuery(guidebookQuery(id, isClimbingLocation))
}
