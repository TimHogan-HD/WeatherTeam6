import { describe, expect, it } from 'vitest'
import type { Conditions, ConditionsReadings, HourlyReading, Location, WeatherAlert } from '@weatherteam6/types'
import { EMPTY_VIEW, SINGLE_PIN_ZOOM, initialView, mapPins, type PinSource } from './mapPins.js'

const reading: HourlyReading = {
  valid_at: '2026-10-02T18:00:00Z',
  rock: { level: 'dry', qualified: true },
  friction: { level: 'great', condensing: false, qualified: true },
  score: 84,
  t_surface_c: 18,
  condensation_margin_c: 6,
}

const scored = (score: number): Conditions => {
  const readings: ConditionsReadings = {
    model: 'gfs_seamless',
    unavailable_reason: null,
    utc_offset_seconds: -18000,
    now: { ...reading, score },
    today: null,
  }
  return { readings } as Conditions
}

const severe = { id: 'a', event: 'Extreme Heat Warning', severity: 'Severe', headline: null } as WeatherAlert

const crag = (over: Partial<Location> = {}): Location =>
  ({ id: 'c1', name: 'Taylors Falls', lat: 45.3955, lon: -92.6616, is_climbing_location: true, ...over }) as Location

const source = (over: Partial<PinSource> = {}): PinSource => ({
  location: crag(),
  conditions: { data: scored(84), isPending: false },
  alerts: { data: [], isPending: false },
  ...over,
})

const only = (s: PinSource) => {
  const pins = mapPins([s])
  expect(pins).toHaveLength(1)
  return pins[0]
}

describe('mapPins', () => {
  it('carries a settled crag’s score and its rung', () => {
    expect(only(source())).toEqual({ id: 'c1', name: 'Taylors Falls', lat: 45.3955, lon: -92.6616, score: 84, tone: 'good' })
    expect(only(source({ conditions: { data: scored(31), isPending: false } }))?.tone).toBe('poor')
  })

  it('draws no number while alerts are pending, however good the reading', () => {
    expect(only(source({ alerts: { data: undefined, isPending: true } }))).toMatchObject({ score: null, tone: null })
  })

  it('draws no number under a Severe alert', () => {
    expect(only(source({ alerts: { data: [severe], isPending: false } }))).toMatchObject({ score: null, tone: null })
  })

  it('draws no number for a place that is not a crag, even with a cached reading', () => {
    expect(only(source({ location: crag({ is_climbing_location: false }) }))).toMatchObject({ score: null, tone: null })
  })

  it('draws no number while conditions are pending', () => {
    expect(only(source({ conditions: { data: undefined, isPending: true } }))).toMatchObject({ score: null, tone: null })
  })

  it('reads coordinates sent as numeric strings', () => {
    const pin = only(source({ location: crag({ lat: '45.3955' as unknown as number, lon: '-92.6616' as unknown as number }) }))
    expect(pin).toMatchObject({ lat: 45.3955, lon: -92.6616 })
  })

  it('drops a location whose coordinates do not parse or are off the globe, never placing it at 0,0', () => {
    const bad = [NaN, null, '', 'north', 91, Infinity] as unknown as number[]
    for (const lat of bad) {
      expect(mapPins([source({ location: crag({ lat }) })])).toEqual([])
    }
    expect(mapPins([source({ location: crag({ lon: 181 }) })])).toEqual([])
  })
})

describe('initialView', () => {
  it('opens on the US with nothing to show', () => {
    expect(initialView([])).toBe(EMPTY_VIEW)
  })

  it('centres a single pin', () => {
    expect(initialView([{ lon: -92.66, lat: 45.4 }])).toEqual({ kind: 'centre', centre: [-92.66, 45.4], zoom: SINGLE_PIN_ZOOM })
  })

  it('fits every pin, south-west corner first', () => {
    expect(
      initialView([
        { lon: -92.66, lat: 45.4 },
        { lon: -115.43, lat: 36.13 },
        { lon: -109.8, lat: 37.9 },
      ]),
    ).toEqual({ kind: 'bounds', bounds: [[-115.43, 36.13], [-92.66, 45.4]] })
  })
})
