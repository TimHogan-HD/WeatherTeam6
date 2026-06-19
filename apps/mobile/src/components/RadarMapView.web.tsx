// .web.tsx — only bundled for web. Static Leaflet import is safe here.
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import type { Map as LMap, TileLayer, Marker } from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { View, StyleSheet } from 'react-native'
import type { Location, RadarFrame } from '@weatherteam6/types'

type Props = {
  frames: RadarFrame[]
  frameIndex: number
  tileUrlTemplate: string | null
  locations: Location[]
}

export function RadarMapView({ frames, frameIndex, tileUrlTemplate: _tileUrlTemplate, locations }: Props) {
  const containerRef = useRef<View>(null)
  const mapRef       = useRef<LMap | null>(null)
  const radarRef     = useRef<TileLayer | null>(null)
  const markersRef   = useRef<Marker[]>([])
  // mapReady lets downstream effects re-run once the map object exists.
  const [mapReady, setMapReady] = useState(false)

  // ── 1. Initialise Leaflet map once on mount ──────────────────────────────
  useEffect(() => {
    const el = containerRef.current as unknown as HTMLElement | null
    if (!el) return

    const map = L.map(el, {
      center: [44.9, -93.5],
      zoom: 7,
    })
    mapRef.current = map

    // CartoDB Dark Matter — matches the app's dark colour scheme.
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      },
    ).addTo(map)

    // Signal downstream effects that the map is ready.
    setMapReady(true)

    return () => {
      map.remove()
      mapRef.current   = null
      radarRef.current = null
    }
  }, [])

  // ── 2. Update location markers whenever locations arrive / change ─────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    // Clear previous markers.
    markersRef.current.forEach(m => m.remove())
    markersRef.current = []

    for (const loc of locations) {
      if (loc.lat == null || loc.lon == null) continue

      const icon = L.divIcon({
        className: '',
        html: `<div style="
          width:9px;height:9px;border-radius:50%;
          background:#94A3B8;border:2px solid #0d1117;
        "></div>`,
        iconSize:   [9, 9],
        iconAnchor: [4, 4],
      })

      const marker = L.marker([loc.lat, loc.lon], { icon })
        .addTo(map)
        .bindTooltip(loc.name, { permanent: true, direction: 'top' })

      markersRef.current.push(marker)
    }

    // Re-centre on first location if available.
    const first = locations[0]
    if (first?.lat != null && first?.lon != null) {
      map.setView([first.lat, first.lon], 7)
    }
  }, [mapReady, locations])

  // ── 3. Swap radar tile layer whenever the frame changes ───────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    radarRef.current?.remove()
    radarRef.current = null

    const frame = frames[frameIndex]
    if (!frame) return

    // RainViewer tile URL: frame.path is e.g. /v2/radar/1700000000
    const radarUrl = `https://tilecache.rainviewer.com${frame.path}/{z}/{x}/{y}/4/1_1.png`

    radarRef.current = L.tileLayer(radarUrl, {
      opacity: 0.75,
      tileSize: 256,
      attribution: 'Radar &copy; <a href="https://www.rainviewer.com/">RainViewer</a>',
    }).addTo(map)
  }, [mapReady, frames, frameIndex])

  return <View ref={containerRef} style={styles.map} />
}

const styles = StyleSheet.create({
  map: { flex: 1 },
})
