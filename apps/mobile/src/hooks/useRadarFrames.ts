import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '../lib/api'
import type { RadarFramesResponse } from '@weatherteam6/types'

export function useRadarFrames() {
  return useQuery({
    queryKey: ['radar', 'frames'],
    queryFn: () => apiFetch<RadarFramesResponse>('/radar/frames'),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  })
}
