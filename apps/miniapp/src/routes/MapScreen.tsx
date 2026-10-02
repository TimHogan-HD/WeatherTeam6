import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import {
  AttributionControl,
  Map as MapLibreMap,
  Marker,
  addProtocol,
  setWorkerUrl,
  type GeoJSONSource,
  type MapMouseEvent,
  type MapTouchEvent,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import mlcontour from 'maplibre-contour'
import { colors, colorsV2, mapPin, motion, radius, spacing } from '@weatherteam6/design/tokens'
import '../theme/map.css'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, cardV2, headerBand, navBarHeight, row, stack, toneColors, wellV2 } from '../theme/styles.js'
import { withOpacity } from '../theme/tokens.css.js'
import { useLocations } from '../hooks/useLocations.js'
import { alertsQuery, conditionsQuery } from '../hooks/useWeather.js'
import { useCurrentPosition, type Fix } from '../hooks/useCurrentPosition.js'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js'
import { prefetchDetail } from '../lib/prefetchDetail.js'
import { addPathForPoint, formatPoint, type MapPoint } from '../lib/addCandidate.js'
import { SINGLE_PIN_ZOOM, initialView, mapPins, type MapPin, type MapView } from '../lib/mapPins.js'
import {
  BASEMAP_STYLE_URL,
  CONTOUR_THRESHOLDS_FT,
  DEM_MAXZOOM,
  DEM_TILES,
  FEET_PER_METRE,
  POSITION_SOURCE,
  appMapStyle,
  positionFeatures,
} from '../lib/mapStyle.js'
import { InlineError } from '../components/States.js'
import { CrossIcon, LocateIcon } from '../components/Icons.js'

// MapLibre 6 finds its worker beside its own module, which a bundle moves;
// Vite builds it as a worker and says where it went.
setWorkerUrl(maplibreWorkerUrl)

/**
 * One terrain source for hillshade and contours, so each DEM tile is fetched
 * once. Its decoding and contouring run in a worker of its own.
 */
const dem = new mlcontour.DemSource({ url: DEM_TILES, encoding: 'terrarium', maxzoom: DEM_MAXZOOM, worker: true })
dem.setupMaplibre({ addProtocol })
const TERRAIN = {
  dem: dem.sharedDemProtocolUrl,
  contours: dem.contourProtocolUrl({
    multiplier: FEET_PER_METRE,
    thresholds: CONTOUR_THRESHOLDS_FT,
    contourLayer: 'contours',
    elevationKey: 'ele',
    levelKey: 'level',
  }),
}

/**
 * Room round the pins when the map frames them: a pin's label runs to the
 * right of its dot, so that side needs the width of a crag's name.
 */
const FIT_PADDING = { top: spacing.sectionGap * 3, bottom: spacing.sectionGap * 5, left: spacing.sectionGap * 2, right: 160 }
/** A fix is shown at least this close, so its accuracy ring has a street round it. */
const LOCATE_ZOOM = 13
/** A finger held this long, moving no further than the slop, drops a pin. */
const LONG_PRESS_MS = 500
const LONG_PRESS_SLOP_PX = 8

const PENDING = { data: undefined, isPending: true } as const

/**
 * `/map` — every saved location as a pin on a dark relief map, with its score
 * where the list card would print one. Tapping a pin opens its crag; holding a
 * finger on the map (right-click on a desktop) offers to add that spot;
 * locate-me shows where the phone is.
 *
 * **The pins are the list's own answers.** The same query definitions fill the
 * same cache entries, so opening the map after the list asks for nothing, and
 * a pin's number is withheld by exactly the rules the card follows.
 *
 * Map tiles, glyphs, sprites and terrain load straight from OpenFreeMap and
 * AWS Open Data, the one exception to "external APIs are proxied"
 * (architecture.md): they are public and keyless, and the viewport is all they
 * are told.
 *
 * Lazy-loaded from `App.tsx`, so MapLibre is not in the list's bundle.
 */
export function MapScreen() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const reduced = usePrefersReducedMotion()

  const locations = useLocations()
  const list = useMemo(() => locations.data ?? [], [locations.data])
  const conditions = useQueries({ queries: list.map((l) => conditionsQuery(l.id, l.is_climbing_location)) })
  const alerts = useQueries({ queries: list.map((l) => alertsQuery(l.id)) })
  const pins = mapPins(
    list.map((location, i) => ({ location, conditions: conditions[i] ?? PENDING, alerts: alerts[i] ?? PENDING })),
  )
  const byId = useMemo(() => new Map(list.map((l) => [l.id, l])), [list])

  const containerRef = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [controlsHeight, setControlsHeight] = useState(0)

  // Framed once, on the first list there is: a later refetch must not pull
  // the map away from where the reader has moved it.
  const framed = useRef(false)
  const firstView = locations.data === undefined ? null : initialView(pins)

  useEffect(() => {
    const container = containerRef.current
    if (container === null) return
    const created = new MapLibreMap({
      container,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
    })
    created.touchZoomRotate.disableRotation()
    created.keyboard.disableRotation()
    created.setStyle(BASEMAP_STYLE_URL, { transformStyle: (_previous, next) => appMapStyle(next, TERRAIN) })
    created.addControl(new AttributionControl({ compact: false }), 'bottom-right')

    // The controls above sit clear of the attribution, however many lines it wraps to.
    const corner = container.querySelector('.maplibregl-ctrl-bottom-right')
    const observer = new ResizeObserver(() => setControlsHeight(corner?.getBoundingClientRect().height ?? 0))
    if (corner !== null) observer.observe(corner)

    setMap(created)
    return () => {
      observer.disconnect()
      created.remove()
      setMap(null)
      framed.current = false
    }
  }, [])

  useEffect(() => {
    if (map === null || framed.current || firstView === null) return
    framed.current = true
    frame(map, firstView)
  }, [map, firstView])

  const openPin = useCallback((id: string) => void navigate(`/location/${id}`), [navigate])
  const pressPin = useCallback(
    (id: string) => {
      const location = byId.get(id)
      if (location !== undefined) prefetchDetail(queryClient, location)
    },
    [byId, queryClient],
  )

  const [dropped, setDropped] = useState<MapPoint | null>(null)
  useLongPress(map, setDropped)

  const { reading, locate, cancel } = useCurrentPosition()
  const showFix = useCallback(
    (fix: Fix) => {
      if (map === null) return
      const draw = () => {
        map.getSource<GeoJSONSource>(POSITION_SOURCE)?.setData(positionFeatures(fix.lon, fix.lat, fix.accuracy_m))
      }
      if (map.isStyleLoaded()) draw()
      else map.once('load', draw)
      const camera = { center: [fix.lon, fix.lat] as [number, number], zoom: Math.max(map.getZoom(), LOCATE_ZOOM) }
      if (reduced) map.jumpTo(camera)
      else map.flyTo(camera)
    },
    [map, reduced],
  )
  const locating = reading.kind === 'locating'

  const emptyList = locations.isSuccess && !locations.isPlaceholderData && list.length === 0
  const unplaced = list.length - pins.length
  const meta =
    locations.data === undefined
      ? null
      : [`${list.length} saved`, unplaced > 0 ? `${unplaced} without coordinates` : null].filter((p) => p !== null).join(' · ')

  return (
    <main
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: navBarHeight,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <header style={{ ...headerBand, marginTop: 0 }}>
        <div style={stack(spacing.tight)}>
          <h1 style={typeV2.screenTitle}>Map</h1>
          {locations.isError ? (
            <InlineError message="Couldn't load your locations." onRetry={() => void locations.refetch()} />
          ) : meta === null ? null : (
            <p style={typeV2.meta}>{meta}</p>
          )}
        </div>
      </header>

      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div ref={containerRef} className="wt6-map" style={{ position: 'absolute', inset: 0, ...typeV2.legendSm }} />

        {map === null
          ? null
          : pins.map((pin) => <PinMarker key={pin.id} map={map} pin={pin} onOpen={openPin} onPress={pressPin} />)}
        {map === null || dropped === null ? null : <DroppedMarker map={map} point={dropped} />}

        {emptyList ? (
          <div style={{ ...overlayCard, top: `${spacing.sectionGap}px` }}>
            <p style={typeV2.cardTitle}>No saved locations yet.</p>
            <p style={typeV2.note}>Hold a finger on the map to add that spot, or search for one.</p>
            <button type="button" style={{ ...primaryButton, alignSelf: 'flex-start' }} onClick={() => void navigate('/add')}>
              <span style={typeV2.button}>Add a location</span>
            </button>
          </div>
        ) : null}

        <div
          style={{
            position: 'absolute',
            left: `${spacing.sectionGap}px`,
            right: `${spacing.sectionGap}px`,
            bottom: `${controlsHeight + spacing.listGap}px`,
            ...stack(spacing.listGap),
            alignItems: 'flex-end',
            pointerEvents: 'none',
          }}
        >
          {reading.kind === 'failed' ? (
            <div style={{ ...wellV2, ...row(spacing.listGap), ...interactive, borderRadius: `${radius.chipMd}px`, padding: `${spacing.listGap}px ${spacing.cardPadSm}px`, alignSelf: 'stretch', justifyContent: 'space-between' }}>
              <span role="status" style={typeV2.controlValue}>
                {reading.message}
              </span>
              <button type="button" aria-label="Dismiss" style={{ ...bareButton, width: 'auto' }} onClick={cancel}>
                <CrossIcon color={colorsV2.txtMuted} />
              </button>
            </div>
          ) : null}

          <button
            type="button"
            aria-label={locating ? 'Cancel locating' : 'Show my location'}
            aria-busy={locating}
            onClick={locating ? cancel : () => locate(showFix)}
            style={{
              ...bareButton,
              ...wellV2,
              ...interactive,
              width: `${LOCATE_SIZE}px`,
              height: `${LOCATE_SIZE}px`,
              display: 'grid',
              placeItems: 'center',
              ...(locating ? { animation: `wt6-locating ${motion.locatingPulseMs}ms ${motion.easeOut} infinite alternate` } : {}),
            }}
          >
            <LocateIcon color={locating ? colorsV2.rain : colorsV2.txt1} />
          </button>

          {dropped === null ? null : (
            <section aria-label="Add this spot" style={{ ...cardV2, ...interactive, ...stack(spacing.listGap), alignSelf: 'stretch' }}>
              <div style={{ ...row(spacing.listGap), justifyContent: 'space-between' }}>
                <h2 style={typeV2.cardTitle}>Add this spot</h2>
                <button type="button" aria-label="Dismiss" style={{ ...bareButton, width: 'auto' }} onClick={() => setDropped(null)}>
                  <CrossIcon color={colorsV2.txtMuted} />
                </button>
              </div>
              <p style={typeV2.meta}>{formatPoint(dropped)}</p>
              <button
                type="button"
                style={{ ...primaryButton, alignSelf: 'flex-start' }}
                onClick={() => void navigate(addPathForPoint(dropped))}
              >
                <span style={typeV2.button}>Add</span>
              </button>
            </section>
          )}
        </div>
      </div>
    </main>
  )
}

/** The locate control is as tall as the bottom bar's lit pill. */
const LOCATE_SIZE = 42

const interactive: CSSProperties = { pointerEvents: 'auto' }

const primaryButton: CSSProperties = {
  ...bareButton,
  ...row(spacing.tight),
  width: 'auto',
  backgroundColor: colors.good,
  borderRadius: `${radius.full}px`,
  padding: `${spacing.listGap}px ${spacing.cardPad}px`,
}

const overlayCard: CSSProperties = {
  ...cardV2,
  ...stack(spacing.listGap),
  position: 'absolute',
  left: `${spacing.sectionGap}px`,
  right: `${spacing.sectionGap}px`,
}

function frame(map: MapLibreMap, view: MapView): void {
  if (view.kind === 'centre') {
    map.jumpTo({ center: view.centre, zoom: view.zoom })
    return
  }
  map.fitBounds(view.bounds, { padding: FIT_PADDING, maxZoom: SINGLE_PIN_ZOOM, animate: false })
}

/**
 * A pin is a real `<button>` rendered into a MapLibre marker, so it takes
 * focus, answers Enter, and reads its name and score aloud. The marker element
 * is a plain wrapper: MapLibre moves it by `transform`, and the app's press
 * rule scales a button by `transform`, so the two must not be one element.
 */
function PinMarker({
  map,
  pin,
  onOpen,
  onPress,
}: {
  map: MapLibreMap
  pin: MapPin
  onOpen: (id: string) => void
  onPress: (id: string) => void
}) {
  const [element] = useState(() => document.createElement('div'))
  useEffect(() => {
    const marker = new Marker({ element, anchor: 'left', offset: [-mapPin.dot / 2, 0] })
      .setLngLat([pin.lon, pin.lat])
      .addTo(map)
    return () => void marker.remove()
  }, [map, element, pin.lon, pin.lat])

  const dot = pin.tone === null ? colorsV2.txtMuted : colors[pin.tone]
  const ink = pin.tone === null ? null : toneColors(pin.tone, 'badge').value
  return createPortal(
    <button
      type="button"
      aria-label={pin.score === null ? pin.name : `${pin.name}, Score ${pin.score}`}
      onPointerDown={() => onPress(pin.id)}
      onClick={() => onOpen(pin.id)}
      style={{ ...bareButton, width: 'auto', ...row(spacing.listGapSm), whiteSpace: 'nowrap' }}
    >
      <span
        aria-hidden
        style={{
          width: `${mapPin.dot}px`,
          height: `${mapPin.dot}px`,
          flex: 'none',
          borderRadius: `${radius.full}px`,
          backgroundColor: dot,
          border: `${mapPin.ring}px solid ${colorsV2.bg}`,
          boxShadow: `0 0 0 ${mapPin.halo}px ${dot}`,
        }}
      />
      <span
        aria-hidden
        style={{
          ...row(spacing.listGapSm),
          alignItems: 'baseline',
          backgroundColor: withOpacity(colorsV2.surface, 0.92),
          border: `1px solid ${colorsV2.line}`,
          borderRadius: `${radius.chipMd}px`,
          padding: `${spacing.tight}px ${spacing.inlineGap}px`,
        }}
      >
        <span style={typeV2.controlValue}>{pin.name}</span>
        {pin.score === null || ink === null ? null : <span style={{ ...typeV2.badgeValue, color: ink }}>{pin.score}</span>}
      </span>
    </button>,
    element,
  )
}

/** The spot a long-press picked, until it is added or dismissed. */
function DroppedMarker({ map, point }: { map: MapLibreMap; point: MapPoint }) {
  useEffect(() => {
    const element = document.createElement('div')
    Object.assign(element.style, {
      width: `${mapPin.dot}px`,
      height: `${mapPin.dot}px`,
      borderRadius: `${radius.full}px`,
      backgroundColor: colorsV2.txt1,
      border: `${mapPin.ring}px solid ${colorsV2.bg}`,
      boxShadow: `0 0 0 ${mapPin.halo}px ${colorsV2.txt1}`,
      pointerEvents: 'none',
    } satisfies Partial<CSSStyleDeclaration>)
    const marker = new Marker({ element }).setLngLat([point.lon, point.lat]).addTo(map)
    return () => void marker.remove()
  }, [map, point])
  return null
}

/**
 * A finger held still on the map, or a right-click, picks that spot. A second
 * finger, a drag past the slop, or lifting early is a pan or a pinch instead.
 * A hold on a pin is the pin's, not the map's.
 */
function useLongPress(map: MapLibreMap | null, onPick: (point: MapPoint) => void): void {
  useEffect(() => {
    if (map === null) return
    let timer: number | undefined
    let start: { x: number; y: number } | null = null
    const cancel = () => {
      window.clearTimeout(timer)
      start = null
    }
    const onMarker = (target: EventTarget | null) => target instanceof Element && target.closest('.maplibregl-marker') !== null

    const onTouchStart = (e: MapTouchEvent) => {
      cancel()
      if (e.originalEvent.touches.length !== 1 || onMarker(e.originalEvent.target)) return
      start = { x: e.point.x, y: e.point.y }
      const at = e.lngLat
      timer = window.setTimeout(() => {
        start = null
        onPick({ lat: at.lat, lon: at.wrap().lng })
      }, LONG_PRESS_MS)
    }
    const onTouchMove = (e: MapTouchEvent) => {
      if (start === null) return
      const moved = Math.hypot(e.point.x - start.x, e.point.y - start.y)
      if (e.originalEvent.touches.length !== 1 || moved > LONG_PRESS_SLOP_PX) cancel()
    }
    const onContextMenu = (e: MapMouseEvent) => {
      e.originalEvent.preventDefault()
      if (onMarker(e.originalEvent.target)) return
      cancel()
      onPick({ lat: e.lngLat.lat, lon: e.lngLat.wrap().lng })
    }

    map.on('touchstart', onTouchStart)
    map.on('touchmove', onTouchMove)
    map.on('touchend', cancel)
    map.on('touchcancel', cancel)
    map.on('contextmenu', onContextMenu)
    return () => {
      cancel()
      map.off('touchstart', onTouchStart)
      map.off('touchmove', onTouchMove)
      map.off('touchend', cancel)
      map.off('touchcancel', cancel)
      map.off('contextmenu', onContextMenu)
    }
  }, [map, onPick])
}
