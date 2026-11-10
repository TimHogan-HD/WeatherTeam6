import type { LayerSpecification, RasterSourceSpecification } from 'maplibre-gl'
import { radarN0q, radarNoCoverage, radarRainIn } from '@weatherteam6/design/tokens'
import type { RadarLayers, RadarPeriod } from '@weatherteam6/types'

/**
 * The Map tab's radar layers, all from IEM: the US composite reflectivity
 * (N0Q) over the last hour, HRRR forecast reflectivity for the next six, and
 * MRMS radar-only rain totals over 24 and 72 hours. Display only: none of it
 * reaches a score.
 *
 * The API names every frame (`GET /radar/layers`) and the tiles are asked for
 * by that frame's stamp, so the time printed beside the picture is the time of
 * the picture. IEM's unstamped "latest" tiles change under a fixed URL and
 * could not promise that. The tiles load straight from IEM, the map-tile
 * exception in architecture.md.
 */

/** Every radar layer on the map carries this prefix, one source and one layer per frame. */
export const RADAR_PREFIX = 'wt6-radar-'

/** The composite covers the lower 48 only; outside it nothing is asked for. */
const RADAR_BOUNDS: [number, number, number, number] = [-126, 23, -65, 50]
/** N0Q is about 1 km a pixel; past this zoom a tile would only be upscaled, so the map upscales it instead. */
const RADAR_MAXZOOM = 10
export const RADAR_OPACITY = 0.7

const IEM_LINK = '<a href="https://mesonet.agron.iastate.edu/" target="_blank" rel="noopener">Iowa Environmental Mesonet</a>'
const RADAR_ATTRIBUTION = `Radar: ${IEM_LINK}`
const FORECAST_ATTRIBUTION = `Forecast: NOAA HRRR via ${IEM_LINK}`
const RAIN_ATTRIBUTION = `Rain totals: NOAA MRMS via ${IEM_LINK}`
const TILE_ROOT = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0'

/** `2026-10-26T19:25:00Z` → `202610261925`, the UTC stamp IEM names a frame by. Null for an unreadable time. */
export function radarStamp(validAt: string): string | null {
  const at = new Date(validAt)
  if (!Number.isFinite(at.getTime())) return null
  return at.toISOString().slice(0, 16).replace(/[-T:]/g, '')
}

function iemSource(layer: string, attribution: string): RasterSourceSpecification {
  return {
    type: 'raster',
    tiles: [`${TILE_ROOT}/${layer}/{z}/{x}/{y}.png`],
    tileSize: 256,
    bounds: RADAR_BOUNDS,
    maxzoom: RADAR_MAXZOOM,
    attribution,
  }
}

export function radarSource(validAt: string): RasterSourceSpecification | null {
  const stamp = radarStamp(validAt)
  return stamp === null ? null : iemSource(`ridge::USCOMP-N0Q-${stamp}`, RADAR_ATTRIBUTION)
}

/**
 * One HRRR forecast frame, asked for by its run and its minute into that run,
 * so the picture is the run the API named and never a newer one drawn under it.
 * Null when either time is unreadable or the frame is not after the run.
 */
export function forecastSource(runAt: string, validAt: string): RasterSourceSpecification | null {
  const stamp = radarStamp(runAt)
  const minutes = (Date.parse(validAt) - Date.parse(runAt)) / 60_000
  if (stamp === null || !Number.isInteger(minutes) || minutes <= 0) return null
  return iemSource(`hrrr::REFD-F${String(minutes).padStart(4, '0')}-${stamp}`, FORECAST_ATTRIBUTION)
}

export type RainHours = 24 | 72

/** The radar rain total ending at the period's end, asked for by that time. */
export function rainSource(period: RadarPeriod, hours: RainHours): RasterSourceSpecification | null {
  const stamp = radarStamp(period.end_at)
  return stamp === null ? null : iemSource(`mrms::p${hours}h-${stamp}`, RAIN_ATTRIBUTION)
}

/** A step of the radar timeline: a past radar frame or a forecast one. */
export type TimelineFrame = {
  kind: 'radar' | 'forecast'
  validAt: string
  source: RasterSourceSpecification
}

/**
 * The timeline, oldest first: the last hour of radar, then the forecast. A
 * frame whose tiles cannot be named is left out rather than drawn as another.
 */
export function timelineFrames(layers: RadarLayers): TimelineFrame[] {
  const past = (layers.past ?? []).flatMap((validAt): TimelineFrame[] => {
    const source = radarSource(validAt)
    return source === null ? [] : [{ kind: 'radar', validAt, source }]
  })
  const forecast = layers.forecast
  const ahead =
    past.length === 0 || forecast === null
      ? []
      : forecast.frames.flatMap((validAt): TimelineFrame[] => {
          const source = forecastSource(forecast.run_at, validAt)
          return source === null ? [] : [{ kind: 'forecast', validAt, source }]
        })
  return [...past, ...ahead]
}

/** "Radar 2:25 PM" or "Forecast 5:00 PM", the frame drawn. */
export function frameLabel(frame: Pick<TimelineFrame, 'kind' | 'validAt'>): string {
  const word = frame.kind === 'radar' ? 'Radar' : 'Forecast'
  return `${word} ${radarTime(frame.validAt) ?? ''}`.trim()
}

/** "Rain in the 24 h to 9:00 AM", the span the total covers. */
export function rainPeriodLabel(period: RadarPeriod, hours: RainHours): string {
  const end = radarTime(period.end_at)
  return end === null ? `Rain in the last ${hours} h` : `Rain in the ${hours} h to ${end}`
}

/** A frame's layer, drawn at `opacity`: a frame loaded ahead for the loop waits at 0. */
export function radarLayerSpec(id: string, opacity: number): LayerSpecification {
  return { id, type: 'raster', source: id, paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0 } }
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

/** What the faint band can be, said once under the bar. It names drizzle first: 10–15 dBZ is real light rain, and a note that waved it off would read a wet crag as dry. */
export const RADAR_FAINT_NOTE = 'Faint can be drizzle or light snow, or birds, insects and ground clutter.'

/**
 * A legend as the map's foot draws it: segments in order, each as wide as its
 * `weight`, its colours spread across it, and its label under it when open.
 */
export type LegendScale = {
  name: string
  segments: readonly { label: string; colors: readonly string[]; weight: number }[]
  note: string
  /** The colour drawn where the layer has no data, shown beside the note. */
  noCoverage: string | null
}

export const RADAR_SCALE: LegendScale = {
  name: 'radar',
  segments: RADAR_BANDS.map((b) => ({ label: b.label, colors: b.colors, weight: b.toDbz - b.fromDbz })),
  note: RADAR_FAINT_NOTE,
  noCoverage: null,
}

/** Inch marks in rising order. Object keys would not do: 1, 2 and 10 sort before 0.01. */
const RAIN_MARKS = (Object.keys(radarRainIn).map(Number) as (keyof typeof radarRainIn)[]).sort((a, b) => a - b)

function rainSegment(label: string, from: number, to: number) {
  return { label, colors: RAIN_MARKS.filter((m) => m >= from && m <= to).map((m) => radarRainIn[m]), weight: 1 }
}

/**
 * The rain totals' legend in inches. The marks are evenly spaced although the
 * inches are not, as IEM's own ramp is; each label is where its colour starts.
 */
export const RAIN_SCALE: LegendScale = {
  name: 'rain totals',
  segments: [
    rainSegment('0.01', 0.01, 0.1),
    rainSegment('0.25', 0.25, 0.25),
    rainSegment('0.5', 0.5, 0.75),
    rainSegment('1', 1, 1.5),
    rainSegment('2', 2, 3),
    rainSegment('4', 4, 6),
    rainSegment('10 in', 10, 10),
  ],
  note: 'Radar’s estimate, not rain gauges, and rough for snow. Grey: no radar reaches there.',
  noCoverage: radarNoCoverage,
}
