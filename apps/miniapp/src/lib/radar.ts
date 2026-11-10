import type { LayerSpecification, RasterSourceSpecification } from 'maplibre-gl'
import { radarN0q } from '@weatherteam6/design/tokens'

/**
 * The Map tab's radar: IEM's US composite reflectivity (N0Q), one frame.
 *
 * The API names the newest frame (`GET /radar/latest`) and the tiles are asked
 * for by that frame's stamp, so the time printed beside the toggle is the time
 * of the picture. IEM's unstamped "latest" tiles change under a fixed URL and
 * could not promise that. The tiles load straight from IEM, the map-tile
 * exception in architecture.md.
 */

export const RADAR_SOURCE = 'wt6-radar'
export const RADAR_LAYER = 'wt6-radar'

/** The composite covers the lower 48 only; outside it nothing is asked for. */
const RADAR_BOUNDS: [number, number, number, number] = [-126, 23, -65, 50]
/** N0Q is about 1 km a pixel; past this zoom a tile would only be upscaled, so the map upscales it instead. */
const RADAR_MAXZOOM = 10
const RADAR_OPACITY = 0.7

const RADAR_ATTRIBUTION =
  '<a href="https://mesonet.agron.iastate.edu/" target="_blank" rel="noopener">Radar: Iowa Environmental Mesonet</a>'

/** `2026-10-26T19:25:00Z` → `202610261925`, the UTC stamp IEM names a frame by. Null for an unreadable time. */
export function radarStamp(validAt: string): string | null {
  const at = new Date(validAt)
  if (!Number.isFinite(at.getTime())) return null
  return at.toISOString().slice(0, 16).replace(/[-T:]/g, '')
}

export function radarSource(validAt: string): RasterSourceSpecification | null {
  const stamp = radarStamp(validAt)
  if (stamp === null) return null
  return {
    type: 'raster',
    tiles: [`https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/ridge::USCOMP-N0Q-${stamp}/{z}/{x}/{y}.png`],
    tileSize: 256,
    bounds: RADAR_BOUNDS,
    maxzoom: RADAR_MAXZOOM,
    attribution: RADAR_ATTRIBUTION,
  }
}

export const RADAR_LAYER_SPEC: LayerSpecification = {
  id: RADAR_LAYER,
  type: 'raster',
  source: RADAR_SOURCE,
  paint: { 'raster-opacity': RADAR_OPACITY, 'raster-fade-duration': 0 },
}

/**
 * Radar draws over the relief, roads and rivers and under every label after
 * them, so a town's name stays readable through a storm. The same place the
 * contour figures go (`appMapStyle`).
 */
export function radarBeforeId(layers: readonly { id: string; type: string }[]): string | undefined {
  const lastLine = layers.map((l) => l.type).lastIndexOf('line')
  return layers.find((l, i) => i > lastLine && l.type === 'symbol')?.id
}

/** "2:25 PM" on the reader's clock, for the frame. Null when the time is unreadable. */
export function radarTime(validAt: string): string | null {
  const at = new Date(validAt)
  if (!Number.isFinite(at.getTime())) return null
  return at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/**
 * The legend under the radar, in IEM's own colours (`radarN0q`), so the bar
 * matches the picture. Bands start at 0 dBZ because below it the ramp is a grey
 * and tan wash that is not rain. Rough Marshall-Palmer rain rates: 15 dBZ is
 * about 0.3 mm/hr, 35 about 5, 50 about 50.
 */
export type RadarBand = { label: string; fromDbz: number; toDbz: number; colors: readonly string[] }

type RampDbz = keyof typeof radarN0q

function band(label: string, fromDbz: RampDbz, toDbz: RampDbz): RadarBand {
  const colors = (Object.keys(radarN0q).map(Number) as RampDbz[])
    .filter((dbz) => dbz >= fromDbz && dbz <= toDbz)
    .map((dbz) => radarN0q[dbz])
  return { label, fromDbz, toDbz, colors }
}

export const RADAR_BANDS: readonly RadarBand[] = [
  band('Faint', 0, 15),
  band('Light', 15, 35),
  band('Moderate', 35, 50),
  band('Heavy', 50, 65),
]

/** What the faint band is, said once under the bar: radar echo, not a rain gauge. */
export const RADAR_FAINT_NOTE = 'Faint speckle is mostly birds, insects or ground clutter. Light snow can show there too.'
