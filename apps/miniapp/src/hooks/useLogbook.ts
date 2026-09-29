import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { AreaPosition, CreateTickInput, Logbook, RecordPositionInput, RouteTick } from '@weatherteam6/types'
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api.js'

const logbookKey = ['logbook'] as const

/** The reader's own ticks and to-dos — `GET /logbook`, one response for every route screen. */
export function useLogbook(): UseQueryResult<Logbook> {
  return useQuery({
    queryKey: logbookKey,
    queryFn: () => apiGet<Logbook>('/logbook'),
  })
}

export function useCreateTick() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateTickInput) => apiPost<RouteTick>('/logbook/ticks', input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: logbookKey }),
  })
}

export function useDeleteTick() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (tickId: string) => apiDelete(`/logbook/ticks/${encodeURIComponent(tickId)}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: logbookKey }),
  })
}

/**
 * Put a route on the to-do list or take it off. Optimistic: the toggle flips
 * at once, and a failed call puts the list back as it was.
 */
export function useSetTodo(routeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (on: boolean) => {
      const path = `/logbook/todos/${encodeURIComponent(routeId)}`
      return on ? apiPut<null>(path) : apiDelete(path)
    },
    onMutate: async (on: boolean) => {
      await queryClient.cancelQueries({ queryKey: logbookKey })
      const previous = queryClient.getQueryData<Logbook>(logbookKey)
      if (previous !== undefined) {
        const todos = previous.todos.filter((id) => id !== routeId)
        queryClient.setQueryData<Logbook>(logbookKey, { ...previous, todos: on ? [...todos, routeId] : todos })
      }
      return { previous }
    },
    onError: (_err, _on, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(logbookKey, context.previous)
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: logbookKey }),
  })
}

/**
 * Record where a wall or boulder is. The position lives on the guidebook
 * response, so every cached guidebook is refetched: two saved locations can
 * sit on the same crag, and both must show the new position.
 */
export function useRecordPosition() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ areaId, fix }: { areaId: string; fix: RecordPositionInput }) =>
      apiPut<AreaPosition>(`/guidebook/areas/${encodeURIComponent(areaId)}/position`, fix),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['guidebook'] }),
  })
}
