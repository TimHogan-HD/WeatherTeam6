import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { Preferences, UpdatePreferencesInput } from '@weatherteam6/types'
import { apiGet, apiPut } from '../lib/api.js'

export const preferencesKey = ['preferences'] as const

/**
 * The reader's settings — `GET /preferences`. Asked for once a session from
 * the signed-in shell, so a crag opened later finds its opening tab in the
 * cache; they change only on the Profile screen, which writes them back.
 */
export function usePreferences(): UseQueryResult<Preferences> {
  return useQuery({
    queryKey: preferencesKey,
    queryFn: () => apiGet<Preferences>('/preferences'),
    staleTime: Infinity,
  })
}

/**
 * **A new temperature range re-judges every crag's friction**, so every crag's
 * readings and scores are refetched — `/conditions` and `/hourly`, which carry
 * Crag A. `/forecast` carries only the five-component scorer and reads no range.
 */
export function useUpdatePreferences() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: UpdatePreferencesInput) => apiPut<Preferences>('/preferences', input),
    onSuccess: (saved, input) => {
      queryClient.setQueryData(preferencesKey, saved)
      if ('temp_low_c' in input || 'temp_high_c' in input) {
        for (const root of ['conditions', 'hourly']) {
          void queryClient.invalidateQueries({ queryKey: [root] })
        }
      }
    },
  })
}
