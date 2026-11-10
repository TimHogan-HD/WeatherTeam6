import { useCallback, useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { RadarLayers } from '@weatherteam6/types'
import { createPortal } from 'react-dom'
import { useNavigate } from '../hooks/useNavigate.js'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import {
  AttributionControl,
  Map as MapLibreMap,
  Marker,
  addProtocol,
  prewarm,
  setWorkerUrl,
  type GeoJSONSource,
  type MapMouseEvent,
  type MapTouchEvent,
  type RasterSourceSpecification,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import mlcontour from 'maplibre-contour'
import { colors, colorsV2, glass, mapPin, motion, radius, spacing } from '@weatherteam6/design/tokens'
import '../theme/map.css'
import { typeV2 } from '../theme/tokens.css.js'
import { bareButton, brandButton, cardV2, navBarHeight, row, stack, toneColors } from '../theme/styles.js'
import { glassDock, glassLegend } from '../theme/glass.js'
import { Sect } from '../components/charts/liquid.js'
import { withOpacity } from '../theme/tokens.css.js'
import { useLocations } from '../hooks/useLocations.js'
import { conditionsQuery, useRadarLayers } from '../hooks/useWeather.js'
import { useCurrentPosition, type Fix } from '../hooks/useCurrentPosition.js'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js'
import { prefetchDetail } from '../lib/prefetchDetail.js'
import { OPENED_FROM_MAP } from '../lib/backTarget.js'
import { getToken, subscribeToToken } from '../lib/authToken.js'
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
import {
  HATCH_PROTOCOL,
  HATCH_SPACING_PX,
  RADAR_OPACITY,
  RADAR_PREFIX,
  RADAR_SCALE,
  RAIN_SCALE,
  frameLabel,
  hatchNoCoverage,
  hatchSourceUrl,
  radarBeforeId,
  radarLayerSpec,
  rainEndOf,
  rainPeriodLabel,
  rainSource,
  timelineFrames,
  type LegendScale,
  type RainHours,
  type TimelineFrame,
} from '../lib/radar.js'
import { InlineError } from '../components/States.js'
import { ChevronDownIcon, CrossIcon, LocateIcon, PauseIcon, PlayIcon } from '../components/Icons.js'

// MapLibre 6 finds its worker beside its own module, which a bundle moves;
// Vite builds it as a worker and says where it went.
setWorkerUrl(maplibreWorkerUrl)

// This module loads before the tab is opened (`App.tsx`), so the workers start
// and the style and tile index reach the browser cache (OpenFreeMap serves both
// for a day) while the reader is still on the list. A failure only means the
// map fetches them itself.
prewarm()
void fetch(BASEMAP_STYLE_URL)
  .then((r) => r.json() as Promise<{ sources?: Record<string, { url?: unknown }> }>)
  .then((style) =>
    Promise.all(
      Object.values(style.sources ?? {}).flatMap((s) => (typeof s.url === 'string' ? [fetch(s.url)] : [])),
    ),
  )
  .catch(() => undefined)

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

// The rain totals' tiles come through here so IEM's no-coverage grey is drawn as a hatch (`hatchNoCoverage`).
addProtocol(HATCH_PROTOCOL, async (params, abort) => {
  const url = hatchSourceUrl(params.url)
  if (url === null) throw new Error('Not a hatched tile')
  const response = await fetch(url, { signal: abort.signal })
  if (!response.ok) throw new Error(`Tile answered ${response.status}`)
  return { data: await hatchTile(await response.arrayBuffer()) }
})

/**
 * The tile with its no-coverage grey hatched, or as it came when it has none.
 * Where the browser cannot redraw it, it goes up as IEM drew it: grey, never
 * blank.
 */
async function hatchTile(bytes: ArrayBuffer): Promise<ArrayBuffer> {
  const image = await createImageBitmap(new Blob([bytes]))
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (context === null) return bytes
  context.drawImage(image, 0, 0)
  image.close()
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
  if (!hatchNoCoverage(pixels.data, canvas.width)) return bytes
  context.putImageData(pixels, 0, 0)
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  return png === null ? bytes : png.arrayBuffer()
}

/** A long name is cut short on its pin, so the score beside it stays on screen; the full name is still read aloud. */
const PIN_NAME_MAX_PX = 150
/**
 * Room round the pins when the map frames them: a pin's label runs to the
 * right of its dot, so that side needs a label's width.
 */
const FIT_PADDING = {
  top: spacing.sectionGap * 3,
  bottom: spacing.sectionGap * 5,
  left: spacing.sectionGap * 2,
  right: PIN_NAME_MAX_PX + spacing.sectionGap * 4,
}
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
 * a pin's number is the card's.
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
  const pins = mapPins(list.map((location, i) => ({ location, conditions: conditions[i] ?? PENDING })))
  const byId = useMemo(() => new Map(list.map((l) => [l.id, l])), [list])

  const hostRef = useRef<HTMLDivElement>(null)
  const chipRef = useRef<HTMLElement>(null)
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [controlsHeight, setControlsHeight] = useState(0)

  const firstView = locations.data === undefined ? null : initialView(pins)

  useEffect(() => {
    const host = hostRef.current
    if (host === null) return
    const { map: shown, element } = attachKeptMap(host)

    // The controls above sit clear of the attribution, however many lines it wraps to.
    const corner = element.querySelector('.maplibregl-ctrl-bottom-right')
    const observer = new ResizeObserver(() => setControlsHeight(corner?.getBoundingClientRect().height ?? 0))
    if (corner !== null) observer.observe(corner)

    setMap(shown)
    return () => {
      observer.disconnect()
      element.remove()
      setMap(null)
    }
  }, [])

  useEffect(() => {
    if (map === null || firstView === null || !claimFirstFrame()) return
    // Pins start below the title chip, which sits under the status bar.
    const chipBottom = chipRef.current?.getBoundingClientRect().bottom ?? 0
    const top = Math.max(0, chipBottom - map.getContainer().getBoundingClientRect().top)
    frame(map, firstView, top)
  }, [map, firstView])

  const openPin = useCallback(
    (id: string) => void navigate(`/location/${id}`, { state: OPENED_FROM_MAP }),
    [navigate],
  )
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

  const [layer, setLayer] = useState<RadarLayer | null>('radar')
  const radar = useRadarLayers(layer !== null)
  const loop = useRadarLoop(layer === 'radar' ? radar.data : undefined)
  const rainHours: RainHours | null = layer === 'rain24' ? 24 : layer === 'rain72' ? 72 : null
  const rainPeriod = rainHours === null || radar.data === undefined ? null : rainHours === 24 ? radar.data.rain_24h : radar.data.rain_72h
  const rain = useMemo(() => (rainHours === null || rainPeriod === null ? null : rainSource(rainPeriod, rainHours)), [rainHours, rainPeriod])
  const shownFrame = loop.frames[loop.index] ?? null
  const visibleUrl = useRadarFrames(
    map,
    layer ?? 'off',
    layer === 'radar' ? loop.wanted : EMPTY_SOURCES,
    layer === 'radar' ? (shownFrame?.source ?? null) : rain,
  )
  usePlayback(loop, visibleUrl)
  // The time printed is the frame on the map, which stays up until the next one has drawn.
  const drawnFrame = loop.frames.find((f) => f.source.tiles?.[0] === visibleUrl) ?? null
  const radarStatus =
    layer === null
      ? null
      : radar.isError && radar.data === undefined
        ? 'Radar unavailable'
        : radar.data === undefined
          ? 'Radar …'
          : layer === 'radar'
            ? loop.frames.length === 0
              ? 'Radar unavailable'
              : null
            : rainPeriod === null || rainHours === null
              ? `${rainHours ?? ''} h rain unavailable`.trim()
              : // The total on the map, which stays up until a newer one has drawn.
                rainPeriodLabel({ ...rainPeriod, end_at: rainEndOf(visibleUrl, rainHours) ?? rainPeriod.end_at }, rainHours)
  const legend: LegendScale | null = visibleUrl === null ? null : layer === 'radar' ? RADAR_SCALE : RAIN_SCALE

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
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <div ref={hostRef} className="wt6-map" style={{ position: 'absolute', inset: 0, ...typeV2.legendSm }} />

        {/* No header band: the map runs up under the status bar, and the title rides in a chip (owner pick, 2026-10-02). */}
        <header
          ref={chipRef}
          style={{
            ...glassDock,
            ...row(spacing.listGap),
            position: 'absolute',
            top: `calc(env(safe-area-inset-top, 0px) + ${spacing.listGap}px)`,
            left: `${spacing.sectionGap}px`,
            maxWidth: `calc(100% - ${spacing.sectionGap * 2}px)`,
            padding: `${spacing.tight}px ${spacing.cardPad}px`,
            alignItems: 'baseline',
          }}
        >
          <h1 style={{ ...typeV2.switcher, color: colorsV2.txt1 }}>Map</h1>
          {locations.isError ? (
            <InlineError message="Couldn't load your locations." onRetry={() => void locations.refetch()} />
          ) : meta === null ? null : (
            <p style={{ ...typeV2.rowSmall, color: colorsV2.txtMuted }}>{meta}</p>
          )}
        </header>

        <LayerPicker layer={layer} onPick={setLayer} />

        {map === null
          ? null
          : pins.map((pin) => <PinMarker key={pin.id} map={map} pin={pin} onOpen={openPin} onPress={pressPin} />)}
        {map === null || dropped === null ? null : <DroppedMarker map={map} point={dropped} />}

        {emptyList ? (
          <div style={{ ...overlayCard, top: `${spacing.sectionGap}px` }}>
            <p style={{ ...typeV2.guideRowName, color: colorsV2.txt1 }}>No saved locations yet.</p>
            <p style={typeV2.body}>Hold a finger on the map to add that spot, or search for one.</p>
            <button type="button" style={{ ...brandButton, alignSelf: 'flex-start' }} onClick={() => void navigate('/add')}>
              Add a location
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
            <div style={{ ...glassDock, ...row(spacing.listGap), ...interactive, borderRadius: `${radius.chipMd}px`, padding: `${spacing.listGap}px ${spacing.cardPad}px`, alignSelf: 'stretch', justifyContent: 'space-between' }}>
              <span role="status" style={{ ...typeV2.body, color: colorsV2.txt1 }}>
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
              ...glassDock,
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
              <div style={{ ...row(spacing.listGap), justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Sect title="Add this spot" />
                <button type="button" aria-label="Dismiss" style={{ ...bareButton, width: 'auto' }} onClick={() => setDropped(null)}>
                  <CrossIcon color={colorsV2.txtMuted} />
                </button>
              </div>
              <p style={{ ...typeV2.body, color: colorsV2.txt1 }}>{formatPoint(dropped)}</p>
              <button
                type="button"
                style={{ ...brandButton, alignSelf: 'flex-start' }}
                onClick={() => void navigate(addPathForPoint(dropped))}
              >
                Add
              </button>
            </section>
          )}

          {radarStatus !== null ? (
            <p role="status" style={{ ...glassLegend, ...typeV2.legendSm, color: colorsV2.txt1, alignSelf: 'stretch', padding: `${spacing.tight}px ${spacing.cardPad}px`, borderRadius: `${radius.full}px` }}>
              {radarStatus}
            </p>
          ) : layer === 'radar' && shownFrame !== null ? (
            <RadarTimeline loop={loop} drawn={drawnFrame ?? shownFrame} />
          ) : null}
          {legend === null ? null : <RadarLegend scale={legend} />}
        </div>
      </div>
    </main>
  )
}

/**
 * What the radar's colours mean, while a frame is drawn. Folded, it is one slim
 * strip across the foot of the map, the ramp running the width between its two
 * ends, under the controls rather than among them (owner, 2026-11-10: like a
 * rain map's "Less rain – More rain" bar). A tap opens the four bands and the
 * note on the faint one, and another folds it. The fold is remembered on this
 * device. The bar is the
 * tiles' own ramp (`RADAR_BANDS`), each band as wide as its dBZ span, so a
 * colour on the map sits over the word for it.
 */
function RadarLegend({ scale }: { scale: LegendScale }) {
  const [open, setOpen] = useState(readLegendOpen)
  const noteId = useId()
  const toggle = () => {
    writeLegendOpen(!open)
    setOpen(!open)
  }
  const words: CSSProperties = { ...typeV2.legendSm, color: colorsV2.txt1, whiteSpace: 'nowrap' }
  const { segments } = scale
  return (
    <button
      type="button"
      // The label replaces the content as the name, so the open segments are named
      // in it and the note is the description: a screen reader hears what is shown.
      aria-label={open ? `Colour key for ${scale.name}: ${segments.map((s) => s.label).join(', ')}` : `Colour key for ${scale.name}`}
      aria-describedby={open ? noteId : undefined}
      aria-expanded={open}
      onClick={toggle}
      style={{
        ...bareButton,
        ...glassLegend,
        ...interactive,
        alignSelf: 'stretch',
        textAlign: 'left',
        ...(open
          ? { ...stack(spacing.tight), padding: `${spacing.listGap}px ${spacing.cardPad}px`, borderRadius: `${radius.chipMd}px` }
          : { ...row(spacing.listGap), padding: `${spacing.tight}px ${spacing.cardPad}px`, borderRadius: `${radius.full}px` }),
      }}
    >
      {open ? (
        <>
          <span style={{ display: 'flex', width: '100%' }}>
            {segments.map((segment) => (
              <span key={segment.label} style={{ ...stack(spacing.tight), flex: `${segment.weight} 0 0`, minWidth: 0 }}>
                <span aria-hidden="true" style={{ height: '6px', background: rampOf([segment]) }} />
                <span style={words}>{segment.label}</span>
              </span>
            ))}
          </span>
          <span id={noteId} style={{ ...row(spacing.tight), ...typeV2.legendSm }}>
            {scale.noCoverage === null ? null : (
              <span
                aria-hidden="true"
                style={{
                  flex: 'none',
                  width: '10px',
                  height: '10px',
                  borderRadius: '2px',
                  boxShadow: `inset 0 0 0 1px ${withOpacity(scale.noCoverage, 0.4)}`,
                  // The map's hatch, at the swatch's size.
                  background: `repeating-linear-gradient(135deg, ${scale.noCoverage} 0 1px, transparent 1px ${HATCH_SPACING_PX / 2}px)`,
                }}
              />
            )}
            {scale.note}
          </span>
        </>
      ) : (
        <>
          <span style={words}>{segments[0]?.label}</span>
          <span aria-hidden="true" style={{ flex: 1, minWidth: 0, height: '6px', borderRadius: `${radius.full}px`, background: rampOf(segments) }} />
          <span style={words}>{segments.at(-1)?.label}</span>
        </>
      )}
    </button>
  )
}

/** One gradient across the segments given, each as wide as its weight, its colours spread evenly across it. */
function rampOf(segments: LegendScale['segments']): string {
  const total = segments.reduce((sum, s) => sum + s.weight, 0) || 1
  let start = 0
  const stops = segments.flatMap((segment) => {
    const from = start
    start += segment.weight
    // One colour is a block: a gradient needs two stops, so it gets both ends.
    const colors = segment.colors.length === 1 ? [segment.colors[0]!, segment.colors[0]!] : segment.colors
    return colors.map((color, i) => {
      const at = from + (segment.weight * i) / Math.max(colors.length - 1, 1)
      return `${color} ${((at / total) * 100).toFixed(1)}%`
    })
  })
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

const LEGEND_OPEN_KEY = 'wt6.radarLegendOpen'

function readLegendOpen(): boolean {
  try {
    return window.localStorage.getItem(LEGEND_OPEN_KEY) === '1'
  } catch {
    return false
  }
}

function writeLegendOpen(open: boolean): void {
  try {
    window.localStorage.setItem(LEGEND_OPEN_KEY, open ? '1' : '0')
  } catch {
    // A blocked store only means the fold is not remembered.
  }
}

/** The locate control is as tall as the bottom bar's lit pill. */
const LOCATE_SIZE = 42

const interactive: CSSProperties = { pointerEvents: 'auto' }

const overlayCard: CSSProperties = {
  ...cardV2,
  ...stack(spacing.listGap),
  position: 'absolute',
  left: `${spacing.sectionGap}px`,
  right: `${spacing.sectionGap}px`,
}

/**
 * **The map outlives the tab.** Building one costs a worker, the style and
 * every tile in view, so the first visit builds it and later visits re-attach
 * the same element: a return to the tab shows the map as it was left, where
 * the reader left it. Framing happens once, on the first list there is.
 */
let kept: { map: MapLibreMap; element: HTMLDivElement; framed: boolean } | null = null

// Signed out: the next person must not open on this one's view or position.
subscribeToToken(() => {
  if (getToken() !== null || kept === null) return
  kept.map.remove()
  kept.element.remove()
  kept = null
})

function attachKeptMap(host: HTMLDivElement): { map: MapLibreMap; element: HTMLDivElement } {
  if (kept !== null) {
    host.appendChild(kept.element)
    kept.map.resize()
    return kept
  }
  const element = document.createElement('div')
  Object.assign(element.style, { position: 'absolute', inset: '0' } satisfies Partial<CSSStyleDeclaration>)
  host.appendChild(element)
  const map = new MapLibreMap({
    container: element,
    attributionControl: false,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    maxPitch: 0,
  })
  map.touchZoomRotate.disableRotation()
  map.keyboard.disableRotation()
  map.setStyle(BASEMAP_STYLE_URL, { transformStyle: (_previous, next) => appMapStyle(next, TERRAIN) })
  map.addControl(new AttributionControl({ compact: false }), 'bottom-right')
  kept = { map, element, framed: false }
  return kept
}

/** True once per kept map: the first list frames it, and nothing after moves it. */
function claimFirstFrame(): boolean {
  if (kept === null || kept.framed) return false
  kept.framed = true
  return true
}

function frame(map: MapLibreMap, view: MapView, top: number): void {
  if (view.kind === 'centre') {
    map.jumpTo({ center: view.centre, zoom: view.zoom })
    return
  }
  const padding = { ...FIT_PADDING, top: top + FIT_PADDING.top }
  map.fitBounds(view.bounds, { padding, maxZoom: SINGLE_PIN_ZOOM, animate: false })
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
          // The glass's ground and rim without its blur: a blurred pane per pin
          // would cost the map frames while it pans.
          backgroundColor: withOpacity(glass.ground, glass.opaqueFill),
          border: `1px solid ${withOpacity(glass.light, glass.rim)}`,
          borderRadius: `${radius.chipMd}px`,
          padding: `${spacing.tight}px ${spacing.inlineGap}px`,
        }}
      >
        <span
          style={{
            ...typeV2.dayPick,
            color: colorsV2.txt1,
            maxWidth: `${PIN_NAME_MAX_PX}px`,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {pin.name}
        </span>
        {pin.score === null || ink === null ? null : <span style={{ ...typeV2.guideRowGrade, color: ink }}>{pin.score}</span>}
      </span>
    </button>,
    element,
  )
}

type RadarLayer = 'radar' | 'rain24' | 'rain72'

const RADAR_LAYERS: readonly { id: RadarLayer | null; label: string }[] = [
  { id: 'radar', label: 'Radar' },
  { id: 'rain24', label: 'Past 24h rain' },
  { id: 'rain72', label: 'Past 72h rain' },
  { id: null, label: 'Off' },
]

/**
 * The layer menu: one small pill at the top middle naming the layer shown,
 * opening a short list beneath it (owner, 2026-11-10, replacing three chips
 * by the locate button). A pick, a tap elsewhere or Escape closes it.
 */
function LayerPicker({ layer, onPick }: { layer: RadarLayer | null; onPick: (layer: RadarLayer | null) => void }) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listId = useId()
  const current = RADAR_LAYERS.find((l) => l.id === layer)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => {
      if (!(e.target instanceof Node) || boxRef.current?.contains(e.target) !== true) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div
      ref={boxRef}
      style={{
        ...stack(spacing.tight),
        position: 'absolute',
        top: `calc(env(safe-area-inset-top, 0px) + ${spacing.listGap}px)`,
        left: '50%',
        transform: 'translateX(-50%)',
        alignItems: 'center',
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Map layer: ${current?.label ?? 'Off'}`}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
        style={{
          ...bareButton,
          ...glassDock,
          ...row(spacing.tight),
          ...typeV2.dayPick,
          width: 'auto',
          height: `${PICKER_HEIGHT}px`,
          padding: `0 ${spacing.listGap}px 0 ${spacing.cardPad}px`,
          borderRadius: `${radius.full}px`,
          color: colorsV2.txt1,
          whiteSpace: 'nowrap',
        }}
      >
        {layer === null ? 'Layers' : current?.label}
        <ChevronDownIcon color={colorsV2.txtMuted} open={open} />
      </button>
      {open ? (
        <div
          id={listId}
          role="group"
          aria-label="Map layer"
          style={{ ...glassDock, ...stack(0), padding: `${spacing.tight}px`, borderRadius: `${radius.chipMd}px` }}
        >
          {RADAR_LAYERS.map(({ id, label }) => {
            const on = layer === id
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  onPick(id)
                  setOpen(false)
                }}
                style={{
                  ...bareButton,
                  ...typeV2.dayPick,
                  minHeight: '40px',
                  padding: `0 ${spacing.cardPad}px`,
                  borderRadius: `${radius.chipMd}px`,
                  textAlign: 'left',
                  whiteSpace: 'nowrap',
                  color: on ? colorsV2.brandInk : colorsV2.txt1,
                  ...(on ? { boxShadow: `inset 0 0 0 1px ${colorsV2.brand}` } : {}),
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

/** The layer pill matches the title chip beside it. */
const PICKER_HEIGHT = 34

const EMPTY_SOURCES: readonly RasterSourceSpecification[] = []

const tileUrl = (source: RasterSourceSpecification): string => source.tiles?.[0] ?? ''

type RadarLoop = {
  frames: readonly TimelineFrame[]
  /** The frame asked for; the map shows it once its tiles have drawn. */
  index: number
  /** The newest radar frame, where the timeline rests. */
  nowIndex: number
  /** Frames to keep on the map: only the one asked for until the reader touches the timeline, then all, so the loop plays without waiting. */
  wanted: readonly RasterSourceSpecification[]
  playing: boolean
  pick: (index: number) => void
  togglePlay: () => void
  step: () => void
}

/**
 * The radar timeline: the last hour of frames, then the forecast. It rests on
 * the newest radar frame, and a picked frame is remembered by its time, so a
 * refresh every five minutes keeps it while it is still listed.
 */
function useRadarLoop(layers: RadarLayers | undefined): RadarLoop {
  const frames = useMemo(() => (layers === undefined ? [] : timelineFrames(layers)), [layers])
  // Radar frames come first, so the newest is the last of them.
  const nowIndex = frames.filter((f) => f.kind === 'radar').length - 1
  const [picked, setPicked] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [loadAll, setLoadAll] = useState(false)
  const pickedIndex = picked === null ? -1 : frames.findIndex((f) => frameKey(f) === picked)
  const index = pickedIndex >= 0 ? pickedIndex : nowIndex
  const wanted = useMemo(() => {
    if (loadAll) return frames.map((f) => f.source)
    const shown = frames[index]
    return shown === undefined ? EMPTY_SOURCES : [shown.source]
  }, [frames, index, loadAll])
  const pick = useCallback(
    (i: number) => {
      const frame = frames[i]
      if (frame === undefined) return
      setLoadAll(true)
      setPicked(i === nowIndex ? null : frameKey(frame))
    },
    [frames, nowIndex],
  )
  const step = useCallback(() => pick(frames.length === 0 ? 0 : (index + 1) % frames.length), [frames.length, index, pick])
  const togglePlay = useCallback(() => {
    setLoadAll(true)
    if (!playing && index === frames.length - 1) setPicked(frames[0] === undefined ? null : frameKey(frames[0]))
    setPlaying(!playing)
  }, [frames, index, playing])
  return { frames, index, nowIndex, wanted, playing: playing && frames.length > 1, pick, togglePlay, step }
}

const frameKey = (frame: TimelineFrame): string => `${frame.kind} ${frame.validAt}`

/**
 * Plays the loop one frame at a time, moving on only once the frame asked for
 * is the one drawn, so the time beside the slider is never ahead of the
 * picture. The newest radar frame and the last frame hold a little longer.
 */
function usePlayback(loop: RadarLoop, visibleUrl: string | null): void {
  const { frames, index, nowIndex, playing, step } = loop
  const target = frames[index]
  const drawn = target !== undefined && tileUrl(target.source) === visibleUrl
  useEffect(() => {
    if (!playing || !drawn) return
    const hold = index === nowIndex || index === frames.length - 1
    const timer = window.setTimeout(step, hold ? motion.radarHoldMs : motion.radarFrameMs)
    return () => window.clearTimeout(timer)
  }, [playing, drawn, index, nowIndex, frames.length, step])
}

/**
 * Radar layers on the kept map, one source and one layer per frame, named by
 * tile URL. `wanted` stay loaded at no opacity; `shown` is drawn. Within one
 * layer the frame drawn stays up until the next has loaded, so a new frame or
 * a step of the loop never blanks the map between pictures; a change of layer
 * shows the new one at once. Returns the tile URL drawn, null for none.
 * No frame, no layer: a radar that failed draws nothing, which never reads as
 * "no rain" because the status line says it is unavailable.
 */
function useRadarFrames(
  map: MapLibreMap | null,
  group: string,
  wanted: readonly RasterSourceSpecification[],
  shown: RasterSourceSpecification | null,
): string | null {
  const ids = useRef(new Map<string, { id: string; group: string }>())
  const nextId = useRef(0)
  const [visible, setVisible] = useState<string | null>(null)
  const visibleRef = useRef<string | null>(null)

  useEffect(() => {
    if (map === null) return
    const shownUrl = shown === null ? null : tileUrl(shown)
    const keep = new Set(wanted.map(tileUrl))
    if (shownUrl !== null) keep.add(shownUrl)

    const show = (url: string | null) => {
      visibleRef.current = url
      setVisible(url)
      for (const [u, { id }] of ids.current) {
        if (map.getLayer(id) !== undefined) map.setPaintProperty(id, 'raster-opacity', u === url ? RADAR_OPACITY : 0)
      }
      for (const [u, { id }] of [...ids.current]) {
        if (keep.has(u)) continue
        if (map.getLayer(id) !== undefined) map.removeLayer(id)
        if (map.getSource(id) !== undefined) map.removeSource(id)
        ids.current.delete(u)
      }
    }
    // The frame drawn now may stay up while the next loads only if it belongs to the same layer.
    const held = visibleRef.current
    const canHold = held !== null && held !== shownUrl && ids.current.get(held)?.group === group
    const tryShow = (): boolean => {
      if (shownUrl === null) {
        show(null)
        return true
      }
      const entry = ids.current.get(shownUrl)
      if (canHold && entry !== undefined && !map.isSourceLoaded(entry.id)) return false
      show(shownUrl)
      return true
    }
    const draw = () => {
      const before = radarBeforeId(map.getStyle().layers)
      for (const source of shown === null ? wanted : [...wanted, shown]) {
        const url = tileUrl(source)
        if (ids.current.has(url)) continue
        const id = `${RADAR_PREFIX}${nextId.current++}`
        ids.current.set(url, { id, group })
        map.addSource(id, source)
        map.addLayer(radarLayerSpec(id, 0), before)
      }
      if (tryShow()) return
      const onData = () => {
        if (tryShow()) {
          map.off('sourcedata', onData)
          map.off('idle', onData)
        }
      }
      map.on('sourcedata', onData)
      // `idle` always comes, even when a frame's tiles failed, so the loop never stalls on one.
      map.on('idle', onData)
      cleanups.push(() => {
        map.off('sourcedata', onData)
        map.off('idle', onData)
      })
    }
    const cleanups: (() => void)[] = []
    // `load` may have fired already while tiles are still arriving; `idle` always comes.
    if (map.isStyleLoaded() === true) draw()
    else {
      map.once('idle', draw)
      cleanups.push(() => void map.off('idle', draw))
    }
    return () => cleanups.forEach((c) => c())
  }, [map, group, wanted, shown])

  // Every frame goes with the tab.
  useEffect(() => {
    if (map === null) return
    const all = ids.current
    return () => {
      for (const { id } of all.values()) {
        if (map.getLayer(id) !== undefined) map.removeLayer(id)
        if (map.getSource(id) !== undefined) map.removeSource(id)
      }
      all.clear()
      visibleRef.current = null
    }
  }, [map])

  return visible
}

/**
 * Play, the slider over the last hour and the forecast, and the time of the
 * frame drawn. A forecast frame says so and names the model, because it is a
 * prediction and looks softer than radar. The bar under the slider marks
 * where radar ends and the forecast starts.
 */
function RadarTimeline({ loop, drawn }: { loop: RadarLoop; drawn: TimelineFrame }) {
  const { frames, index, nowIndex, playing } = loop
  const target = frames[index]
  const drawnIndex = frames.findIndex((f) => frameKey(f) === frameKey(drawn))
  // The label names the picture on the map; while the frame asked for is still loading, it says so.
  const label = [
    frameLabel(drawn),
    drawn.kind === 'forecast' ? 'HRRR model' : drawnIndex === nowIndex ? 'latest' : null,
    target !== undefined && frameKey(target) !== frameKey(drawn) ? 'loading…' : null,
  ]
    .filter((part) => part !== null)
    .join(' · ')
  // On screen the label is the frame's kind and time alone; the model and "latest" are read aloud.
  const shortLabel = `${frameLabel(drawn)}${target !== undefined && frameKey(target) !== frameKey(drawn) ? ' …' : ''}`
  const pastCount = nowIndex + 1
  const aheadCount = frames.length - pastCount
  return (
    <div style={{ ...glassLegend, ...interactive, ...row(spacing.tight), alignSelf: 'stretch', padding: `0 ${spacing.cardPad}px 0 ${spacing.tight}px`, borderRadius: `${radius.full}px` }}>
      <button
        type="button"
        aria-label={playing ? 'Pause radar loop' : 'Play radar loop'}
        onClick={loop.togglePlay}
        disabled={frames.length < 2}
        style={{ ...bareButton, width: '28px', height: '28px', flex: 'none', display: 'grid', placeItems: 'center' }}
      >
        {playing ? <PauseIcon color={colorsV2.txt1} /> : <PlayIcon color={colorsV2.txt1} />}
      </button>
      <div style={{ ...stack(0), flex: 1, minWidth: 0 }}>
        <input
          type="range"
          min={0}
          max={Math.max(frames.length - 1, 0)}
          step={1}
          value={index}
          aria-label="Radar time"
          aria-valuetext={label}
          onChange={(e) => loop.pick(Number(e.currentTarget.value))}
          style={{ width: '100%', height: '20px', margin: 0, accentColor: colorsV2.brand }}
        />
        {/* Where radar ends and the forecast starts: solid, then dashed. */}
        <span style={{ display: 'flex', gap: '2px' }} aria-hidden="true">
          <span style={{ flex: `${pastCount} 0 0`, height: '2px', borderRadius: `${radius.full}px`, background: colorsV2.txtMuted }} />
          {aheadCount > 0 ? (
            <span style={{ flex: `${aheadCount} 0 0`, height: '2px', background: `repeating-linear-gradient(90deg, ${colorsV2.txtMuted} 0 4px, transparent 4px 7px)` }} />
          ) : null}
        </span>
      </div>
      <span aria-live={playing ? 'off' : 'polite'} style={{ ...typeV2.legendSm, color: colorsV2.txt1, whiteSpace: 'nowrap', flex: 'none' }}>
        {shortLabel}
      </span>
    </div>
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
