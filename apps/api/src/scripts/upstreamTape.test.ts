import { describe, expect, it } from 'vitest'
import { addEntry, daysBetween, recordingFetch, replayingFetch, shiftBody, tapeDay, tapeKey, type Tape } from './upstreamTape.js'

describe('tapeKey', () => {
  it('writes a near date as its offset and leaves a normals date literal', () => {
    const url = 'https://data.rcc-acis.org/StnData?sdate=1991-01-01&edate=2020-12-31&start_date=2026-10-14&end_date=2026-10-21'
    expect(tapeKey(url, '2026-10-21')).toBe(
      'https://data.rcc-acis.org/StnData?sdate=1991-01-01&edate=2020-12-31&start_date=@D-7&end_date=@D+0',
    )
  })

  it('gives the same key for the same relative request on a later day', () => {
    expect(tapeKey('https://x.test/?start_date=2026-11-02', '2026-11-09')).toBe(tapeKey('https://x.test/?start_date=2026-10-14', '2026-10-21'))
  })

  it('keys a place-naming call on ~1 km, and a forecast on its exact point', () => {
    const reverse = (lat: string) => `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=-92.6616&format=jsonv2`
    const elevation = (lat: string) => `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=-92.6616`
    expect(tapeKey(reverse('45.41032'), '2026-10-26')).toBe(tapeKey(reverse('45.41177'), '2026-10-26'))
    expect(tapeKey(elevation('45.41032'), '2026-10-26')).toBe(tapeKey(elevation('45.41177'), '2026-10-26'))
    expect(tapeKey(reverse('45.3955'), '2026-10-26')).not.toBe(tapeKey(reverse('45.41032'), '2026-10-26'))
    const forecast = 'https://api.open-meteo.com/v1/forecast?latitude=45.3955&longitude=-92.6616'
    expect(tapeKey(forecast, '2026-10-26')).toBe(forecast)
  })

  it('replays a tape recorded with exact fixes under the rounded key', async () => {
    const tape: Tape = {
      recordedOn: '2026-10-26',
      entries: [{ key: 'https://api.open-meteo.com/v1/elevation?latitude=45.41177&longitude=-92.6616', status: 200, contentType: 'application/json', body: '{"elevation":[285]}' }],
    }
    const misses = new Set<string>()
    const res = await replayingFetch(fetch, tape, '2026-10-26', misses)('https://api.open-meteo.com/v1/elevation?latitude=45.41032&longitude=-92.6616')
    expect(res.status).toBe(200)
    expect(misses.size).toBe(0)
  })
})

describe('shiftBody', () => {
  const recorded = '2026-10-21'

  it('moves dates, date-times and epoch seconds and milliseconds by whole days', () => {
    const sec = Date.UTC(2026, 9, 21, 19, 53) / 1000
    const body = JSON.stringify({ time: ['2026-10-21T00:00', '2026-10-22T01:00'], day: '2026-10-21', unix: sec, ms: sec * 1000 })
    expect(JSON.parse(shiftBody(body, recorded, 3))).toEqual({
      time: ['2026-10-24T00:00', '2026-10-25T01:00'],
      day: '2026-10-24',
      unix: sec + 3 * 86_400,
      ms: (sec + 3 * 86_400) * 1000,
    })
  })

  it('crosses a month end', () => {
    expect(shiftBody('"2026-10-30"', recorded, 5)).toBe('"2026-11-04"')
  })

  it('leaves a 1991-2020 normals period and short numbers alone', () => {
    const body = '{"sdate":"1991-01-01","lat":45.3955,"lon":-92.1792612380,"elev":274,"id":42}'
    expect(shiftBody(body, recorded, 9)).toBe(body)
  })
})

describe('daysBetween and tapeDay', () => {
  it('counts calendar days', () => {
    expect(daysBetween('2026-10-21', '2026-11-02')).toBe(12)
  })

  it('reads the day in Minnesota, not UTC', () => {
    expect(tapeDay(new Date('2026-10-22T03:00:00Z'))).toBe('2026-10-21')
  })
})

describe('addEntry', () => {
  it('keeps a success over a failure for the same key, whichever came first', () => {
    const tape: Tape = { recordedOn: '2026-10-21', entries: [] }
    addEntry(tape, { key: 'k', status: 500, contentType: null, body: 'a' })
    addEntry(tape, { key: 'k', status: 200, contentType: null, body: 'b' })
    addEntry(tape, { key: 'k', status: 503, contentType: null, body: 'c' })
    expect(tape.entries).toEqual([{ key: 'k', status: 200, contentType: null, body: 'b' }])
  })
})

describe('record, then replay on a later day', () => {
  const upstream = (input: Parameters<typeof fetch>[0]): Promise<Response> =>
    Promise.resolve(
      new Response(JSON.stringify({ asked: String(input), time: ['2026-10-21T00:00'] }), { headers: { 'content-type': 'application/json' } }),
    )

  it('serves the recorded answer, moved to the replay day, and passes local calls through', async () => {
    const tape: Tape = { recordedOn: '2026-10-21', entries: [] }
    const rec = recordingFetch(upstream as typeof fetch, tape)
    await rec('https://api.open-meteo.com/v1/forecast?start_date=2026-10-14')
    await rec('http://localhost:3096/api/v1/locations')
    expect(tape.entries.map((e) => e.key)).toEqual(['https://api.open-meteo.com/v1/forecast?start_date=@D-7'])

    const misses = new Set<string>()
    const local: string[] = []
    const play = replayingFetch(((input: Parameters<typeof fetch>[0]) => {
      local.push(String(input))
      return Promise.resolve(new Response('local'))
    }) as typeof fetch, tape, '2026-10-25', misses)

    const res = await play('https://api.open-meteo.com/v1/forecast?start_date=2026-10-18')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(((await res.json()) as { time: string[] }).time).toEqual(['2026-10-25T00:00'])

    expect(await (await play('http://localhost:5173/')).text()).toBe('local')
    expect(local).toEqual(['http://localhost:5173/'])
    expect(misses.size).toBe(0)
  })

  it('answers a request the tape does not hold with a 404 and lists it', async () => {
    const misses = new Set<string>()
    const play = replayingFetch(upstream as typeof fetch, { recordedOn: '2026-10-21', entries: [] }, '2026-10-21', misses)
    expect((await play('https://api.weather.gov/alerts/active?point=45,-92')).status).toBe(404)
    expect([...misses]).toEqual(['https://api.weather.gov/alerts/active?point=45,-92'])
  })
})
