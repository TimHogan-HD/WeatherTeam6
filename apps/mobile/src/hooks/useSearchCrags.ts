import { useQuery } from '@tanstack/react-query'
import type { Crag } from '@weatherteam6/types'
import { apiFetch } from '../lib/api'

export function useSearchCrags(query: string) {
  const trimmed = query.trim()
  return useQuery<Crag[]>({
    queryKey: ['crags', 'search', trimmed],
    queryFn: async () => {
      if (trimmed.length < 1) return []
      const params = new URLSearchParams({ q: trimmed })
      const data = await apiFetch<Crag[]>(`/locations/search?${params.toString()}`)
      return data ?? []
    },
    enabled: trimmed.length >= 1,
    staleTime: 30_000,
  })
}
