import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { SensorReading } from '@weatherteam6/types'
import { apiGet } from '../lib/api.js'

/** The owner's thermometer, newest reading per device. Mount it for the owner only: anyone else gets a 403. */
export function useSensors(): UseQueryResult<SensorReading[]> {
  return useQuery({ queryKey: ['sensors'], queryFn: () => apiGet<SensorReading[]>('/sensors') })
}
