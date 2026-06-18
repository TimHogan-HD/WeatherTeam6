import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { CreateWallInput, Wall } from '@weatherteam6/types'
import { apiPost } from '../lib/api'

export function useAddWall() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateWallInput) => apiPost<Wall>('/walls', input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['walls', vars.locationId] })
    },
  })
}
