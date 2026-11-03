import { useMutation, useQuery, useQueryClient, type QueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { CreateFeedbackInput, Feedback, FeedbackFromAnyone } from '@weatherteam6/types'
import { apiGet, apiPost } from '../lib/api.js'
import { TRIP_SUMMARY_KEY } from './useTrips.js'

const feedbackKey = ['feedback'] as const
/** Under `feedbackKey`, so resolving or saving refreshes both lists. */
const allFeedbackKey = ['feedback', 'all'] as const

/** The caller's own feedback, newest first — `GET /feedback`. */
export function useFeedbackList(): UseQueryResult<Feedback[]> {
  return useQuery({
    queryKey: feedbackKey,
    queryFn: () => apiGet<Feedback[]>('/feedback'),
  })
}

/**
 * What a saved check makes stale: both feedback lists, and every trip
 * summary, whose `checked_in` it may have just set. Without the second, an
 * ended trip opened from the check showed its cached "How was it?" for the
 * query's whole stale time, and a second tap saved a duplicate check.
 * Returned so the mutation waits for it before its caller navigates.
 */
export function invalidateAfterFeedback(queryClient: QueryClient): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: feedbackKey }),
    queryClient.invalidateQueries({ queryKey: [TRIP_SUMMARY_KEY] }),
  ])
}

export function useCreateFeedback() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateFeedbackInput) => apiPost<Feedback>('/feedback', input),
    onSuccess: () => invalidateAfterFeedback(queryClient),
  })
}

/** Marks one item acted on — `POST /feedback/:id/resolve`. It then leaves the list. */
export function useResolveFeedback() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiPost<null>(`/feedback/${encodeURIComponent(id)}/resolve`, {}),
    // Returned, so the item stays "Marking…" until the refetch drops it rather
    // than flashing back to "Done".
    onSuccess: () => queryClient.invalidateQueries({ queryKey: feedbackKey }),
  })
}

/**
 * Every account's open feedback, newest first — `GET /feedback/all`. Mount it
 * for the owner only (`can_read_all_feedback`): anyone else gets a 403.
 */
export function useAllFeedback(): UseQueryResult<FeedbackFromAnyone[]> {
  return useQuery({
    queryKey: allFeedbackKey,
    queryFn: () => apiGet<FeedbackFromAnyone[]>('/feedback/all'),
  })
}
