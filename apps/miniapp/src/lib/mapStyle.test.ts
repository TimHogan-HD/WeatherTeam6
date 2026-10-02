import { describe, expect, it } from 'vitest'
import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'
import { colorsV2, mapV2 } from '@weatherteam6/design/tokens'
import { appMapStyle, positionFeatures } from './mapStyle.js'

/**
 * One layer of every kind the recolour distinguishes, each wearing a colour no
 * token has, so a branch that is removed or reordered leaves an upstream
 * colour behind or puts the wrong token on a layer named below.
 */
const UPSTREAM = 'rgb(1,2,3)'
const src = { source: 'openmaptiles', 'source-layer': 'x' }
const FIXTURE: StyleSpecification = {
  version: 8,
  glyphs: 'https://tiles.example/fonts/{fontstack}/{range}.pbf',
  sources: { openmaptiles: { type: 'vector', url: 'https://tiles.example/planet' } },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': UPSTREAM } },
    { id: 'water', type: 'fill', ...src, paint: { 'fill-color': UPSTREAM } },
    { id: 'landuse_park', type: 'fill', ...src, paint: { 'fill-color': UPSTREAM } },
    { id: 'building', type: 'fill', ...src, paint: { 'fill-color': UPSTREAM, 'fill-outline-color': UPSTREAM } },
    { id: 'aeroway-area', type: 'fill', ...src, paint: { 'fill-color': UPSTREAM, 'fill-opacity': 0.5 } },
    { id: 'waterway', type: 'line', ...src, paint: { 'line-color': UPSTREAM } },
    { id: 'highway_minor', type: 'line', ...src, paint: { 'line-color': UPSTREAM } },
    { id: 'highway_motorway_inner', type: 'line', ...src, paint: { 'line-color': UPSTREAM } },
    { id: 'road_oneway', type: 'symbol', ...src, layout: { 'icon-image': 'oneway' }, paint: { 'icon-opacity': 0.5 } },
    { id: 'boundary_state', type: 'line', ...src, paint: { 'line-color': UPSTREAM } },
    { id: 'water_name', type: 'symbol', ...src, layout: { 'text-field': '{name}', 'text-font': ['Fixture Sans'] }, paint: { 'text-color': UPSTREAM, 'text-halo-color': UPSTREAM } },
    { id: 'place_city', type: 'symbol', ...src, layout: { 'text-field': '{name}', 'text-font': ['Fixture Sans'], 'icon-image': 'dot' }, paint: { 'text-color': UPSTREAM, 'icon-color': UPSTREAM } },
  ],
}

const TERRAIN = { dem: 'dem://{z}/{x}/{y}', contours: 'contour://{z}/{x}/{y}' }
const styled = appMapStyle(FIXTURE, TERRAIN)
const layer = (id: string): LayerSpecification => {
  const found = styled.layers.find((l) => l.id === id)
  if (found === undefined) throw new Error(`no layer ${id}`)
  return found
}
const paintOf = (id: string): Record<string, unknown> => {
  const l = layer(id)
  return 'paint' in l ? ((l.paint ?? {}) as Record<string, unknown>) : {}
}

describe('appMapStyle', () => {
  it('leaves no colour on any layer that is not a token', () => {
    const tokens = new Set<string>([...Object.values(mapV2), ...Object.values(colorsV2)])
    const colours = styled.layers.flatMap((l) =>
      Object.entries('paint' in l ? (l.paint ?? {}) : {})
        .filter(([key]) => key.endsWith('-color'))
        .map(([key, value]) => ({ layer: l.id, key, value })),
    )
    expect(colours.length).toBeGreaterThan(FIXTURE.layers.length)
    expect(colours.filter((c) => typeof c.value !== 'string' || !tokens.has(c.value))).toEqual([])
  })

  it('gives each kind of layer its own token', () => {
    expect(paintOf('background')['background-color']).toBe(mapV2.land)
    expect(paintOf('water')['fill-color']).toBe(mapV2.water)
    expect(paintOf('landuse_park')['fill-color']).toBe(mapV2.park)
    expect(paintOf('building')).toMatchObject({ 'fill-color': mapV2.building, 'fill-outline-color': mapV2.minorLine })
    expect(paintOf('aeroway-area')).toEqual({ 'fill-color': mapV2.land, 'fill-opacity': 0.5 })
    expect(paintOf('waterway')['line-color']).toBe(mapV2.river)
    expect(paintOf('highway_minor')['line-color']).toBe(mapV2.minorLine)
    expect(paintOf('highway_motorway_inner')['line-color']).toBe(mapV2.majorRoad)
    expect(paintOf('boundary_state')['line-color']).toBe(mapV2.boundary)
    expect(paintOf('water_name')).toEqual({ 'text-color': mapV2.waterLabel, 'text-halo-color': mapV2.labelHalo })
    expect(paintOf('place_city')).toEqual({ 'text-color': mapV2.label, 'text-halo-color': mapV2.labelHalo })
  })

  it('leaves an icon-only symbol as it was: a sprite has no colour to replace', () => {
    expect(layer('road_oneway')).toEqual(FIXTURE.layers.find((l) => l.id === 'road_oneway'))
  })

  it('puts the relief under the first line and the contour figures under the first label after the roads', () => {
    const ids = styled.layers.map((l) => l.id)
    expect(ids.indexOf('wt6-hillshade')).toBe(ids.indexOf('waterway') - 2)
    expect(ids.indexOf('wt6-contour-lines')).toBe(ids.indexOf('waterway') - 1)
    expect(ids.indexOf('wt6-contour-labels')).toBe(ids.indexOf('water_name') - 1)
  })

  it('labels contours in feet in the style’s own font, from the terrain it was given', () => {
    const labels = layer('wt6-contour-labels')
    expect(labels.type === 'symbol' ? labels.layout?.['text-font'] : null).toEqual(['Fixture Sans'])
    expect(styled.sources['wt6-dem']).toMatchObject({ type: 'raster-dem', encoding: 'terrarium', tiles: [TERRAIN.dem] })
    expect(styled.sources['wt6-contours']).toMatchObject({ type: 'vector', tiles: [TERRAIN.contours] })
  })

  it('does not change the style it was given', () => {
    expect(FIXTURE.layers[0]).toEqual({ id: 'background', type: 'background', paint: { 'background-color': UPSTREAM } })
    expect(Object.keys(FIXTURE.sources)).toEqual(['openmaptiles'])
  })
})

describe('positionFeatures', () => {
  it('draws the accuracy ring at its radius from the fix', () => {
    const fc = positionFeatures(-92.66, 45.4, 1000)
    const ring = fc.features[0]?.geometry
    if (ring?.type !== 'Polygon') throw new Error('no ring')
    const north = ring.coordinates[0]?.[0]
    // 1 km north is 1000 / 111195 degrees of latitude.
    expect(north?.[1]).toBeCloseTo(45.4 + 1000 / 111195, 5)
    expect(north?.[0]).toBeCloseTo(-92.66, 6)
    expect(fc.features[1]?.geometry).toEqual({ type: 'Point', coordinates: [-92.66, 45.4] })
  })
})
