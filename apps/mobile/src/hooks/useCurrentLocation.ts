import { useLocations } from './useLocations'

export function useCurrentLocation() {
  const q = useLocations()
  return {
    ...q,
    data: q.data?.[0] ?? null,
  }
}
