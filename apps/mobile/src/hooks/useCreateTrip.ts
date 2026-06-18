import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Trip, CreateTripInput } from '@weatherteam6/types'
import { apiPost } from '../lib/api'

export function useCreateTrip() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTripInput) => apiPost<Trip>('/trips', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trips'] })
    },
  })
}
