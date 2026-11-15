import { describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import type { Conditions, ForecastSnapshot, ListResponse, RainNow, WeatherAlert } from '@weatherteam6/types'
import {
  LIST_KEY,
  alertsQuery,
  conditionsQuery,
  coveredByList,
  forecastQuery,
  held,
  rainNowQuery,
  seedList,
} from './useWeather.js'
import { seedFreshCards } from '../lib/rememberedCards.js'

// Partial fixtures, cast: seeding stores parts as given and never reads a field.
const FORECAST = [{ forecast_date: '2026-11-15' }] as unknown as ForecastSnapshot[]
const ALERTS = [{ id: 'a1' }] as unknown as WeatherAlert[]
const CONDITIONS = { location_id: 'crag' } as unknown as Conditions
const RAIN: RainNow = { valid_at: '2026-11-15T12:00:00.000Z', places: [] }
const ok = <T,>(data: T) => ({ data, error: null, status: 200 })
const failed = (status: number) => ({ data: null, error: 'Unavailable', status })

function body(overrides: Partial<ListResponse> = {}): ListResponse {
  return {
    places: [
      { location_id: 'crag', forecast: ok(FORECAST), alerts: ok(ALERTS), conditions: ok(CONDITIONS) },
      { location_id: 'city', forecast: ok(FORECAST), alerts: ok([]), conditions: null },
    ],
    rain_now: ok(RAIN),
    ...overrides,
  }
}

describe('seedList', () => {
  it('writes every answered part into its per-place key, stamped with the fetch time', () => {
    const qc = new QueryClient()
    seedList(qc, body(), 1_000)
    expect(qc.getQueryData(forecastQuery('crag').queryKey)).toBe(FORECAST)
    expect(qc.getQueryData(alertsQuery('crag').queryKey)).toBe(ALERTS)
    expect(qc.getQueryData(conditionsQuery('crag', true).queryKey)).toBe(CONDITIONS)
    expect(qc.getQueryData(alertsQuery('city').queryKey)).toEqual([])
    expect(qc.getQueryData(rainNowQuery().queryKey)).toBe(RAIN)
    expect(qc.getQueryState(forecastQuery('crag').queryKey)?.dataUpdatedAt).toBe(1_000)
  })

  it('writes nothing for a failed or timed-out part, so that card asks for it', () => {
    const qc = new QueryClient()
    seedList(
      qc,
      body({
        places: [{ location_id: 'crag', forecast: failed(504), alerts: failed(500), conditions: failed(504) }],
        rain_now: failed(500),
      }),
      1_000,
    )
    expect(qc.getQueryState(forecastQuery('crag').queryKey)).toBeUndefined()
    // A failed alerts read must never become "no active alerts".
    expect(qc.getQueryState(alertsQuery('crag').queryKey)).toBeUndefined()
    expect(qc.getQueryState(conditionsQuery('crag', true).queryKey)).toBeUndefined()
    expect(qc.getQueryState(rainNowQuery().queryKey)).toBeUndefined()
  })

  it('leaves an older answer in place when the part fails, rather than overwriting it with a gap', () => {
    const qc = new QueryClient()
    qc.setQueryData(alertsQuery('crag').queryKey, ALERTS, { updatedAt: 500 })
    seedList(qc, body({ places: [{ location_id: 'crag', forecast: ok(FORECAST), alerts: failed(500), conditions: null }] }), 1_000)
    expect(qc.getQueryData(alertsQuery('crag').queryKey)).toBe(ALERTS)
    expect(qc.getQueryState(alertsQuery('crag').queryKey)?.dataUpdatedAt).toBe(500)
  })

  it('marks that older answer stale, so its card asks for it once the list settles', () => {
    const qc = new QueryClient()
    // Fetched a minute before the list: still fresh by the clock.
    qc.setQueryData(forecastQuery('crag').queryKey, FORECAST, { updatedAt: 999_000 })
    qc.setQueryData(alertsQuery('crag').queryKey, ALERTS, { updatedAt: 999_000 })
    qc.setQueryData(rainNowQuery().queryKey, RAIN, { updatedAt: 999_000 })
    seedList(
      qc,
      body({ places: [{ location_id: 'crag', forecast: failed(504), alerts: ok(ALERTS), conditions: null }], rain_now: failed(500) }),
      1_000_000,
    )
    expect(qc.getQueryState(forecastQuery('crag').queryKey)?.isInvalidated).toBe(true)
    expect(qc.getQueryState(rainNowQuery().queryKey)?.isInvalidated).toBe(true)
    // An answered part is fresh, not invalidated.
    expect(qc.getQueryState(alertsQuery('crag').queryKey)?.isInvalidated).toBe(false)
  })

  it('gives a city no conditions entry', () => {
    const qc = new QueryClient()
    seedList(qc, body(), 1_000)
    expect(qc.getQueryState(conditionsQuery('city', true).queryKey)).toBeUndefined()
  })

  it('keeps a no-frame rain-now answer as null, an answer', () => {
    const qc = new QueryClient()
    seedList(qc, body({ rain_now: ok(null) }), 1_000)
    expect(qc.getQueryState(rainNowQuery().queryKey)?.status).toBe('success')
    expect(qc.getQueryData(rainNowQuery().queryKey)).toBeNull()
  })
})

describe('held', () => {
  it('holds a query while the list is in flight', () => {
    expect(held(forecastQuery('crag'), false).enabled).toBe(false)
    expect(held(forecastQuery('crag'), true).enabled).toBe(true)
  })

  it("never turns on a city's conditions", () => {
    expect(held(conditionsQuery('city', false), true).enabled).toBe(false)
  })
})

describe('coveredByList', () => {
  it('leaves the per-place keys to the list only while the list answers', () => {
    const qc = new QueryClient()
    expect(coveredByList(qc, ['forecast', 'crag'])).toBe(false)
    qc.setQueryData(LIST_KEY, 'seeded')
    expect(coveredByList(qc, ['forecast', 'crag'])).toBe(true)
    expect(coveredByList(qc, ['rain-now'])).toBe(true)
    expect(coveredByList(qc, ['locations'])).toBe(false)
    expect(coveredByList(qc, ['hourly', 'crag'])).toBe(false)
  })

  it('refetches every card itself against an API without /list', () => {
    const qc = new QueryClient()
    qc.setQueryData(LIST_KEY, 'unavailable')
    expect(coveredByList(qc, ['conditions', 'crag'])).toBe(false)
  })
})

describe('seedFreshCards and the list', () => {
  it('stands a fresh snapshot in for the list request, with its stamp', () => {
    const qc = new QueryClient()
    const savedAt = new Date('2026-11-15T10:05:00').getTime()
    const seeded = seedFreshCards(
      qc,
      { savedAt, cards: { crag: { forecast: FORECAST, alerts: ALERTS, conditions: CONDITIONS } } },
      savedAt + 60_000,
    )
    expect(seeded).toBe(true)
    expect(qc.getQueryData(LIST_KEY)).toBe('remembered')
    expect(qc.getQueryState(LIST_KEY)?.dataUpdatedAt).toBe(savedAt)
  })

  it('leaves the list to fetch when the snapshot is stale', () => {
    const qc = new QueryClient()
    const savedAt = new Date('2026-11-15T10:05:00').getTime()
    seedFreshCards(qc, { savedAt, cards: { crag: { forecast: FORECAST, alerts: ALERTS, conditions: CONDITIONS } } }, savedAt + 20 * 60_000)
    expect(qc.getQueryState(LIST_KEY)).toBeUndefined()
  })
})
