import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { fetchNwsAlerts } from './nwsAlerts.js'

describe('fetchNwsAlerts', () => {
  let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>

  beforeEach(() => {
    vi.useFakeTimers()
    fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubEnv('NWS_USER_AGENT', 'test-agent/1.0')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('returns null when fetch throws a network error after all retries', async () => {
    fetchMock.mockRejectedValue(new Error('network error'))
    const resultPromise = fetchNwsAlerts(36.0, -115.0)
    await vi.runAllTimersAsync()
    const result = await resultPromise
    expect(result).toBeNull()
  })

  it('returns null for a non-ok 4xx response', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ title: 'Not Found' }), { status: 404 }),
    )
    const result = await fetchNwsAlerts(36.0, -115.0)
    expect(result).toBeNull()
  })

  it('returns null when a 200 response has no features array', async () => {
    // This expectation was `[]` and that was the bug (issue #26). `[]` means
    // "NWS confirms no active alerts", and `runAlertsCheck` acts on it by
    // deleting every stored row for the location — taking `notified_at` with
    // them, so the same alert is re-sent when it reappears. A 200 that is not a
    // FeatureCollection is an unparseable response, which is what null is for.
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ type: 'FeatureCollection' }), { status: 200 }),
    )
    const result = await fetchNwsAlerts(36.0, -115.0)
    expect(result).toBeNull()
  })

  it('returns null when a 200 response is an NWS error object', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ title: 'Service Unavailable', status: 503 }), { status: 200 }),
    )
    expect(await fetchNwsAlerts(36.0, -115.0)).toBeNull()
  })

  it('returns empty array when features is an empty array', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ type: 'FeatureCollection', features: [] }), { status: 200 }),
    )
    const result = await fetchNwsAlerts(36.0, -115.0)
    expect(result).toEqual([])
  })

  it('parses valid alert features', async () => {
    const payload = {
      type: 'FeatureCollection',
      features: [
        {
          id: 'urn:oid:2.49.0.1.840.0.abc123',
          properties: {
            event: 'Flash Flood Watch',
            severity: 'Moderate',
            certainty: 'Likely',
            headline: 'Flash Flood Watch until Saturday',
            description: 'Heavy rain expected across the region.',
            effective: '2026-06-03T00:00:00Z',
            expires: '2026-06-04T00:00:00Z',
          },
        },
      ],
    }
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }))
    const result = await fetchNwsAlerts(36.0, -115.0)
    expect(result).toHaveLength(1)
    expect(result?.[0]).toMatchObject({
      nws_alert_id: 'urn:oid:2.49.0.1.840.0.abc123',
      event: 'Flash Flood Watch',
      severity: 'Moderate',
      certainty: 'Likely',
      headline: 'Flash Flood Watch until Saturday',
      description: 'Heavy rain expected across the region.',
      effective: '2026-06-03T00:00:00Z',
      expires: '2026-06-04T00:00:00Z',
    })
  })

  it('prefers feature.id over properties.id', async () => {
    const payload = {
      type: 'FeatureCollection',
      features: [
        {
          id: 'feature-level-id',
          properties: {
            id: 'props-level-id',
            event: 'Winter Storm Watch',
            severity: 'Moderate',
            certainty: 'Possible',
          },
        },
      ],
    }
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }))
    const result = await fetchNwsAlerts(40.0, -105.0)
    expect(result?.[0]?.nws_alert_id).toBe('feature-level-id')
  })

  it('skips features with no id at either level', async () => {
    const payload = {
      type: 'FeatureCollection',
      features: [
        {
          properties: {
            event: 'Thunderstorm Warning',
            severity: 'Extreme',
            certainty: 'Observed',
          },
        },
      ],
    }
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }))
    const result = await fetchNwsAlerts(36.0, -115.0)
    expect(result).toEqual([])
  })

  it('sends the NWS_USER_AGENT header', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ features: [] }), { status: 200 }),
    )
    await fetchNwsAlerts(34.0, -118.0)
    const [, init] = fetchMock.mock.calls[0] ?? []
    const headers = (init as RequestInit | undefined)?.headers as Record<string, string> | undefined
    expect(headers?.['User-Agent']).toBe('test-agent/1.0')
  })

  it('returns null when JSON parsing fails', async () => {
    fetchMock.mockResolvedValueOnce(new Response('not json', { status: 200 }))
    const result = await fetchNwsAlerts(36.0, -115.0)
    expect(result).toBeNull()
  })
})
