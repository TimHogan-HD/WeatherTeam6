import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Location, Wall } from '@weatherteam6/types'
import { LocationIdentity } from './LocationIdentity.js'

/**
 * The wall strip, which is the half of this card that can make a claim the
 * database does not support.
 *
 * The facts grid above it is covered through `DetailView.test.tsx`; these are
 * about the walls, because `walls.angle_deg` has two possible conventions and
 * only one of them is the one the score reads.
 */

function location(over: Partial<Location> = {}): Location {
  return {
    id: 'loc',
    user_id: 'user',
    name: 'Red Rock Canyon',
    lat: 36.1358,
    lon: -115.4275,
    elevation_m: 1140,
    rock_type: 'sandstone',
    aspect: 'N',
    cliff_angle: 8,
    asos_station: 'KVGT',
    timezone: 'America/Los_Angeles',
    is_climbing_location: true,
    created_at: '2026-08-01T00:00:00.000Z',
    ...over,
  } as Location
}

function wall(over: Partial<Wall> = {}): Wall {
  return {
    id: 'w1',
    locationId: 'loc',
    name: 'Black Corridor',
    aspectDeg: 12,
    aspectSource: 'manual',
    angleDeg: 2,
    angleBand: 'vertical',
    routeCount: 71,
    createdAt: '2026-08-01T00:00:00.000Z',
    ...over,
  }
}

describe('LocationIdentity — the wall strip', () => {
  it('draws no heading when the crag has no named walls', () => {
    // Every location today: the `walls` table has full CRUD and no writer.
    const html = renderToStaticMarkup(<LocationIdentity location={location()} />)
    expect(html).not.toContain('Walls')
  })

  it('names each wall with its bearing, band and route count', () => {
    const html = renderToStaticMarkup(
      <LocationIdentity location={location()} walls={[wall()]} />,
    )
    expect(html).toContain('Black Corridor')
    expect(html).toContain('NNE · vertical · 71 routes')
  })

  it('never prints the stored angle in degrees', () => {
    // `walls.angle_deg` has no writer, so nothing establishes whether it is
    // measured from vertical (what `conditionsScore.ts` reads) or from
    // horizontal (what a climber says). Printing "2° off vert" would pick one
    // on no evidence, on the input the heaviest score component depends on.
    // The crag's own `cliff_angle` is cleared so the only possible source of a
    // degree sign here is the wall.
    const html = renderToStaticMarkup(
      <LocationIdentity location={location({ cliff_angle: null })} walls={[wall({ angleDeg: 2 })]} />,
    )
    expect(html).not.toContain('off vert')
    expect(html).not.toContain('2°')
  })

  it('omits a route count nobody has entered rather than showing zero routes', () => {
    const html = renderToStaticMarkup(
      <LocationIdentity location={location()} walls={[wall({ routeCount: null })]} />,
    )
    expect(html).toContain('NNE · vertical')
    expect(html).not.toContain('routes')
  })

  it('says one route, not 1 routes', () => {
    const html = renderToStaticMarkup(
      <LocationIdentity location={location()} walls={[wall({ routeCount: 1 })]} />,
    )
    expect(html).toContain('1 route<')
  })

  it('keeps the strip off the condensed line, where the charts get the screen', () => {
    const html = renderToStaticMarkup(
      <LocationIdentity location={location()} walls={[wall()]} condensed />,
    )
    expect(html).not.toContain('Black Corridor')
  })
})
