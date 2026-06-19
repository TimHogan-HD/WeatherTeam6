import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Location } from '@weatherteam6/types'
import { apiPost } from '../lib/api'

export function useSaveLocation() {
  const queryClient = useQueryClient()

  return useMutation<Location | null, Error, { cragId: string }>({
    mutationFn: ({ cragId }) => apiPost<Location>('/locations', { cragId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['locations'] })
    },
  })
}
