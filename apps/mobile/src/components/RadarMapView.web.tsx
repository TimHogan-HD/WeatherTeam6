// .web.tsx — only bundled for web. Static Leaflet import is safe here.
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import type { Map as LMap, TileLayer, Marker } from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import type { Location, RadarFrame } from '@weatherteam6/types'

type Props = {
  frames: RadarFrame[]
  frameIndex: number
  tileUrlTemplate: string | null
  locations: Location[]
}

export function RadarMapView({ frames, frameIndex, tileUrlTemplate: _tileUrlTemplate, locations }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef       = useRef<LMap | null>(null)
  const radarRef     = useRef<TileLayer | null>(null)
  const markersRef   = useRef<Marker[]>([])
  const [mapReady, setMapReady] = useState(false)

  // ── 1. Initialise Leaflet map once on mount ──────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const map = L.map(el, {
      center: [44.9, -93.5],
      zoom: 7,
      minZoom: 4,
    })
    mapRef.current = map

    // Basemap without labels so radar sits between terrain and text
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png',
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
      },
    ).addTo(map)

    // Labels pane above the radar — city names and roads stay readable
    map.createPane('labels')
    const labelsPane = map.getPane('labels')!
    labelsPane.style.zIndex = '450'
    labelsPane.style.pointerEvents = 'none'
    L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png',
      { subdomains: 'abcd', maxZoom: 19, pane: 'labels' },
    ).addTo(map)

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

    // 512px tiles + zoomOffset -1: map-zoom-8 requests tile-zoom-7 at 512px = crisp, no upscaling.
    // Pixelation only starts at map zoom 9+ (RainViewer native cap is zoom 7).
    // Color scheme 4 = TheWeatherChannel (blue→amber→red), smooth=1, snow=1
    const radarUrl = `https://tilecache.rainviewer.com${frame.path}/512/{z}/{x}/{y}/4/1_1.png`

    const layer = L.tileLayer(radarUrl, {
      opacity: 0.65,
      tileSize: 512,
      zoomOffset: -1,
      minNativeZoom: 4,
      maxNativeZoom: 7,
      attribution: 'Radar &copy; <a href="https://www.rainviewer.com/">RainViewer</a>',
    })

    layer.addTo(map)
    radarRef.current = layer
  }, [mapReady, frames, frameIndex])

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, width: '100%', height: '100%' }}
    />
  )
}
