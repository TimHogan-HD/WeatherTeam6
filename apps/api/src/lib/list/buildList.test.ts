import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Conditions, ForecastSnapshot, RainNow, WeatherAlert } from '@weatherteam6/types'
import { buildList, settlePart, type ListLocation, type ListParts } from './buildList.js'

function place(id: string, crag: boolean): ListLocation {
  return {
    id,
    lat: '44.5',
    lon: '-92.5',
    elevation_m: null,
    rock_type: null,
    cliff_angle: null,
    aspect: null,
    is_climbing_location: crag,
  }
}

// Partial fixtures, cast: the composition passes parts through untouched and never reads a field.
const FORECAST = [{ forecast_date: '2026-11-15' }] as unknown as ForecastSnapshot[]
const ALERT = { id: 'a1', event: 'Wind Advisory' } as unknown as WeatherAlert
const conditionsOf = (id: string) => ({ location_id: id }) as unknown as Conditions
const RAIN: RainNow = { valid_at: '2026-11-15T12:00:00.000Z', places: [] }

function parts(overrides: Partial<ListParts<ListLocation>> = {}): ListParts<ListLocation> {
  return {
    forecast: () => Promise.resolve(FORECAST),
    alerts: () => Promise.resolve([ALERT]),
    conditions: (l) => Promise.resolve(conditionsOf(l.id)),
    rainNow: () => Promise.resolve(RAIN),
    ...overrides,
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('buildList', () => {
  it("keeps every other place's parts when one place's parts reject", async () => {
    const body = await buildList(
      [place('a', true), place('b', true)],
      parts({
        forecast: (l) => (l.id === 'a' ? Promise.reject(new Error('upstream')) : Promise.resolve(FORECAST)),
        conditions: (l) => (l.id === 'a' ? Promise.reject(new Error('db')) : Promise.resolve(conditionsOf(l.id))),
      }),
    )
    const [a, b] = body.places
    expect(a?.forecast).toEqual({ data: null, error: 'Unavailable', status: 500 })
    expect(a?.conditions).toEqual({ data: null, error: 'Unavailable', status: 500 })
    // The same place's alerts did not fail, and stay.
    expect(a?.alerts).toEqual({ data: [ALERT], error: null, status: 200 })
    expect(b?.forecast).toEqual({ data: FORECAST, error: null, status: 200 })
    expect(b?.conditions).toEqual({ data: conditionsOf('b'), error: null, status: 200 })
  })

  it('answers a failed alerts read with an error, never an empty list', async () => {
    const body = await buildList([place('a', true)], parts({ alerts: () => Promise.reject(new Error('db')) }))
    expect(body.places[0]?.alerts).toEqual({ data: null, error: 'Unavailable', status: 500 })
  })

  it('passes a real empty alerts answer through as an empty list', async () => {
    const body = await buildList([place('a', true)], parts({ alerts: () => Promise.resolve([]) }))
    expect(body.places[0]?.alerts).toEqual({ data: [], error: null, status: 200 })
  })

  it('never asks for the conditions of a place that is not a crag', async () => {
    const conditions = vi.fn((l: ListLocation) => Promise.resolve(conditionsOf(l.id)))
    const body = await buildList([place('city', false), place('crag', true)], parts({ conditions }))
    expect(body.places[0]?.conditions).toBeNull()
    expect(body.places[1]?.conditions?.status).toBe(200)
    expect(conditions).toHaveBeenCalledTimes(1)
    expect(conditions.mock.calls[0]?.[0].id).toBe('crag')
  })

  it("does not hold the response for a slow part: it comes back 504 and the rest answer", async () => {
    vi.useFakeTimers()
    const never = new Promise<Conditions>(() => {})
    const pending = buildList(
      [place('slow', true), place('fast', true)],
      parts({ conditions: (l) => (l.id === 'slow' ? never : Promise.resolve(conditionsOf(l.id))) }),
      1_000,
    )
    await vi.advanceTimersByTimeAsync(1_000)
    const body = await pending
    expect(body.places[0]?.conditions).toEqual({ data: null, error: 'Timed out', status: 504 })
    expect(body.places[0]?.forecast.status).toBe(200)
    expect(body.places[1]?.conditions?.status).toBe(200)
  })

  it('carries rain-now as its own part, a null frame as an answer and a failure as an error', async () => {
    expect((await buildList([place('a', true)], parts())).rain_now).toEqual({ data: RAIN, error: null, status: 200 })
    expect((await buildList([place('a', true)], parts({ rainNow: () => Promise.resolve(null) }))).rain_now).toEqual({
      data: null,
      error: null,
      status: 200,
    })
    expect(
      (await buildList([place('a', true)], parts({ rainNow: () => Promise.reject(new Error('iem')) }))).rain_now,
    ).toEqual({ data: null, error: 'Unavailable', status: 500 })
  })

  it('answers an empty list for a reader with no places', async () => {
    const body = await buildList([], parts())
    expect(body.places).toEqual([])
  })
})

describe('settlePart', () => {
  it('turns a synchronous throw into an error part rather than rejecting', async () => {
    const result = await settlePart(
      () => {
        throw new Error('sync')
      },
      1_000,
      'x',
    )
    expect(result).toEqual({ data: null, error: 'Unavailable', status: 500 })
  })

  it('answers a part that resolves just inside the limit', async () => {
    vi.useFakeTimers()
    const pending = settlePart(() => new Promise<number>((r) => setTimeout(() => r(7), 999)), 1_000, 'x')
    await vi.advanceTimersByTimeAsync(1_000)
    expect(await pending).toEqual({ data: 7, error: null, status: 200 })
  })
})
