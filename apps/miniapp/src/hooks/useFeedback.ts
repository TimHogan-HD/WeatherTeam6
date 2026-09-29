import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { CreateFeedbackInput, Feedback } from '@weatherteam6/types'
import { apiGet, apiPost } from '../lib/api.js'

const feedbackKey = ['feedback'] as const

/** The caller's own feedback, newest first — `GET /feedback`. */
export function useFeedbackList(): UseQueryResult<Feedback[]> {
  return useQuery({
    queryKey: feedbackKey,
    queryFn: () => apiGet<Feedback[]>('/feedback'),
  })
}

export function useCreateFeedback() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateFeedbackInput) => apiPost<Feedback>('/feedback', input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: feedbackKey }),
  })
}
