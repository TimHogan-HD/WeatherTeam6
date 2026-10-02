import type {
  ExpressionSpecification,
  LayerSpecification,
  SourceSpecification,
  StyleSpecification,
} from 'maplibre-gl'
import type { FeatureCollection } from 'geojson'
import { colorsV2, mapV2 } from '@weatherteam6/design/tokens'

/**
 * The Map tab's basemap: OpenFreeMap's `dark` style, recoloured onto the app's
 * tokens, with hillshade and contour lines from one terrain source added.
 *
 * Pure, so the recolour can be tested without a map: `MapScreen` hands this to
 * MapLibre's `transformStyle`, which runs it on the style as fetched.
 */

export const BASEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark'

const link = (href: string, text: string) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`
export const BASEMAP_ATTRIBUTION = [
  link('https://openfreemap.org', 'OpenFreeMap'),
  link('https://www.openmaptiles.org/', '© OpenMapTiles'),
  link('https://www.openstreetmap.org/copyright', '© OpenStreetMap contributors'),
].join(' ')

/** AWS Open Data's Terrarium tiles: keyless, global, metres encoded in RGB. */
export const DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
export const DEM_MAXZOOM = 14
export const TERRAIN_ATTRIBUTION = link(
  'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',
  'Terrain: Mapzen / AWS Open Data',
)

/** Contours draw from this zoom up; below it they are a grey wash. */
export const CONTOUR_MINZOOM = 11
export const FEET_PER_METRE = 3.28084
/** Feet, `[minor, major]`, from each zoom up to the next key. Major lines are labelled. */
export const CONTOUR_THRESHOLDS_FT: Record<number, [number, number]> = {
  11: [200, 1000],
  12: [100, 500],
  13: [50, 250],
  15: [20, 100],
}

export const POSITION_SOURCE = 'wt6-position'

const DEM_SOURCE = 'wt6-dem'
const CONTOUR_SOURCE = 'wt6-contours'
/** The layer name maplibre-contour writes contours under, and its two properties. */
export const CONTOUR_LAYER = 'contours'

/** Where the terrain tiles come from: the DEM itself, and the contour tiles cut from it. */
export type TerrainTiles = { dem: string; contours: string }

type Recolour = { type: LayerSpecification['type']; id?: RegExp; paint: Record<string, string> }

/**
 * First match wins, so the order is the decision: a water fill before the
 * catch-all fill, a river line before the catch-all line. Every colour a source
 * layer carried is dropped before its rule's are set, so nothing of the
 * upstream palette survives a layer this table did not anticipate.
 */
const RECOLOUR: readonly Recolour[] = [
  { type: 'background', paint: { 'background-color': mapV2.land } },
  { type: 'fill', id: /water/, paint: { 'fill-color': mapV2.water } },
  { type: 'fill', id: /park|wood|landcover|landuse|grass|forest/, paint: { 'fill-color': mapV2.park } },
  { type: 'fill', id: /building/, paint: { 'fill-color': mapV2.building, 'fill-outline-color': mapV2.minorLine } },
  { type: 'fill', paint: { 'fill-color': mapV2.land } },
  { type: 'line', id: /water|river|stream/, paint: { 'line-color': mapV2.river } },
  { type: 'line', id: /boundary|admin/, paint: { 'line-color': mapV2.boundary } },
  { type: 'line', id: /motorway|trunk|primary/, paint: { 'line-color': mapV2.majorRoad } },
  { type: 'line', paint: { 'line-color': mapV2.minorLine } },
]

const LABEL: Record<string, string> = { 'text-color': mapV2.label, 'text-halo-color': mapV2.labelHalo }
const WATER_LABEL: Record<string, string> = { 'text-color': mapV2.waterLabel, 'text-halo-color': mapV2.labelHalo }

function rulePaint(layer: LayerSpecification): Record<string, string> | null {
  if (layer.type === 'symbol') {
    // An icon-only symbol (a one-way arrow, a town dot) is a sprite image with
    // no colour of its own to replace.
    if (layer.layout?.['text-field'] === undefined) return null
    return /water/.test(layer.id) ? WATER_LABEL : LABEL
  }
  return RECOLOUR.find((r) => r.type === layer.type && (r.id === undefined || r.id.test(layer.id)))?.paint ?? null
}

function recolour(layer: LayerSpecification): LayerSpecification {
  const paint = rulePaint(layer)
  if (paint === null || !('paint' in layer)) return layer
  const kept = Object.fromEntries(Object.entries(layer.paint ?? {}).filter(([key]) => !key.endsWith('-color')))
  return { ...layer, paint: { ...kept, ...paint } } as LayerSpecification
}

/**
 * The style's own label face, so the contour figures ask the glyph server for
 * a font it serves; a face it lacks fails every label tile.
 */
function labelFont(layers: readonly LayerSpecification[]): string[] {
  for (const layer of layers) {
    if (layer.type !== 'symbol') continue
    const font: unknown = layer.layout?.['text-font']
    if (isFontStack(font)) return font
  }
  return ['Noto Sans Regular']
}

const isFontStack = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.every((f) => typeof f === 'string')

function terrainLayers(font: string[]): { under: LayerSpecification[]; labels: LayerSpecification } {
  const level: ExpressionSpecification = ['get', 'level']
  return {
    under: [
      {
        id: 'wt6-hillshade',
        type: 'hillshade',
        source: DEM_SOURCE,
        paint: {
          'hillshade-shadow-color': mapV2.hillshadeShadow,
          'hillshade-highlight-color': mapV2.hillshadeHighlight,
          'hillshade-accent-color': mapV2.hillshadeShadow,
          'hillshade-exaggeration': 0.6,
        },
      },
      {
        id: 'wt6-contour-lines',
        type: 'line',
        source: CONTOUR_SOURCE,
        'source-layer': CONTOUR_LAYER,
        minzoom: CONTOUR_MINZOOM,
        paint: {
          'line-color': mapV2.contour,
          // `level` is 1 on a major line, 0 on a minor one.
          'line-width': ['match', level, 1, 1, 0.5],
        },
      },
    ],
    labels: {
      id: 'wt6-contour-labels',
      type: 'symbol',
      source: CONTOUR_SOURCE,
      'source-layer': CONTOUR_LAYER,
      minzoom: CONTOUR_MINZOOM,
      filter: ['>', level, 0],
      layout: {
        'symbol-placement': 'line',
        'text-size': 10,
        'text-field': ['concat', ['number-format', ['get', 'ele'], {}], ' ft'],
        'text-font': font,
      },
      paint: {
        'text-color': mapV2.contourLabel,
        'text-halo-color': mapV2.labelHalo,
        'text-halo-width': 1,
      },
    },
  }
}

/** Where the phone is: an accuracy disc and a dot, empty until a fix arrives. */
const POSITION_LAYERS: LayerSpecification[] = [
  {
    id: 'wt6-position-accuracy',
    type: 'fill',
    source: POSITION_SOURCE,
    filter: ['==', ['geometry-type'], 'Polygon'],
    paint: { 'fill-color': colorsV2.rain, 'fill-opacity': 0.15, 'fill-outline-color': colorsV2.rain },
  },
  {
    id: 'wt6-position-dot',
    type: 'circle',
    source: POSITION_SOURCE,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-radius': 6,
      'circle-color': colorsV2.rain,
      'circle-stroke-color': colorsV2.bg,
      'circle-stroke-width': 2,
    },
  },
]

/**
 * A recoloured copy of `style`, never a mutation of it.
 *
 * Hillshade and contour lines go under the first line layer, so roads and
 * rivers draw over the relief; contour figures go under the first label after
 * the roads, so a town's name wins a collision with an elevation.
 */
export function appMapStyle(style: StyleSpecification, terrain: TerrainTiles): StyleSpecification {
  const layers = style.layers.map(recolour)
  const { under, labels } = terrainLayers(labelFont(style.layers))

  const firstLine = layers.findIndex((l) => l.type === 'line')
  const at = firstLine === -1 ? layers.length : firstLine
  layers.splice(at, 0, ...under)

  const lastLine = layers.map((l) => l.type).lastIndexOf('line')
  const labelAt = layers.findIndex((l, i) => i > lastLine && l.type === 'symbol')
  layers.splice(labelAt === -1 ? layers.length : labelAt, 0, labels)

  // OpenFreeMap's TileJSON says "Data from OpenStreetMap"; the licence asks for
  // the contributors to be named. A style source's attribution outranks its
  // TileJSON's.
  const basemap = Object.fromEntries(
    Object.entries(style.sources).map(([id, source]) => [
      id,
      source.type === 'vector' ? { ...source, attribution: BASEMAP_ATTRIBUTION } : source,
    ]),
  )
  const sources: Record<string, SourceSpecification> = {
    ...basemap,
    [DEM_SOURCE]: {
      type: 'raster-dem',
      encoding: 'terrarium',
      tiles: [terrain.dem],
      tileSize: 256,
      maxzoom: DEM_MAXZOOM,
      attribution: TERRAIN_ATTRIBUTION,
    },
    [CONTOUR_SOURCE]: { type: 'vector', tiles: [terrain.contours], minzoom: CONTOUR_MINZOOM, maxzoom: 15 },
    [POSITION_SOURCE]: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
  }

  return { ...style, sources, layers: [...layers, ...POSITION_LAYERS] }
}

const EARTH_RADIUS_M = 6_371_008.8

/**
 * A fix as GeoJSON: the dot, and a ring `accuracyM` from it. The ring is
 * computed on the sphere, so it stays round on the map at any latitude.
 */
export function positionFeatures(lon: number, lat: number, accuracyM: number, steps = 64): FeatureCollection {
  const d = accuracyM / EARTH_RADIUS_M
  const lat1 = (lat * Math.PI) / 180
  const lon1 = (lon * Math.PI) / 180
  const ring: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const bearing = (2 * Math.PI * i) / steps
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing))
    const lon2 = lon1 + Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2))
    ring.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI])
  }
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } },
      { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [lon, lat] } },
    ],
  }
}
