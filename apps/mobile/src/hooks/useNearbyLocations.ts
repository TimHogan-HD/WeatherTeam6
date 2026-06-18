import type { Location } from '@weatherteam6/types'

export function useNearbyLocations(_opts?: { type?: 'all' | 'crags' }) {
  return { data: [] as Location[], isPending: false, isError: false }
}
