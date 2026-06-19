import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import * as Location from 'expo-location'
import type { Crag } from '@weatherteam6/types'
import { apiFetch } from '../lib/api'

type PermissionState = 'pending' | 'granted' | 'denied'

export function useNearbyLocations(_opts?: { type?: 'all' | 'crags' }) {
  const [permission, setPermission] = useState<PermissionState>('pending')
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null)

  useEffect(() => {
    let cancelled = false
    async function checkPermission() {
      const { status } = await Location.getForegroundPermissionsAsync()
      if (cancelled) return

      if (status === 'granted') {
        setPermission('granted')
        try {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          if (!cancelled) {
            setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude })
          }
        } catch {
          // Location unavailable — leave coords null
        }
      } else if (status === 'denied') {
        setPermission('denied')
      } else {
        // undetermined — request
        const { status: requested } = await Location.requestForegroundPermissionsAsync()
        if (cancelled) return
        if (requested === 'granted') {
          setPermission('granted')
          try {
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
            if (!cancelled) {
              setCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude })
            }
          } catch {
            // Location unavailable
          }
        } else {
          setPermission('denied')
        }
      }
    }
    void checkPermission()
    return () => { cancelled = true }
  }, [])

  const query = useQuery<Crag[]>({
    queryKey: ['crags', 'nearby', coords?.lat, coords?.lon],
    queryFn: async () => {
      if (!coords) return []
      const params = new URLSearchParams({
        lat: String(coords.lat),
        lon: String(coords.lon),
      })
      const data = await apiFetch<Crag[]>(`/locations/search?${params.toString()}`)
      return data ?? []
    },
    enabled: coords !== null,
    staleTime: 5 * 60_000,
  })

  return {
    data: query.data ?? ([] as Crag[]),
    isPending: permission === 'pending' || query.isPending,
    isError: query.isError,
    permissionDenied: permission === 'denied',
  }
}
