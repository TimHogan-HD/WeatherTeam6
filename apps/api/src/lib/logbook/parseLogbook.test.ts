import { describe, it, expect } from 'vitest'
import { POSITION_ACCURACY_MAX_M, TICK_NOTE_MAX } from '@weatherteam6/types'
import { parsePositionInput, parseTickInput } from './parseLogbook.js'
import { areaExists, routeExists } from '../guidebook/guidebook.js'
import { MN_GUIDEBOOK } from '../guidebook/guidebookMn.js'

// 22:00 UTC, so "tomorrow in UTC" is a different day from "today in UTC".
const NOW = Date.parse('2026-09-29T22:00:00.000Z')

const TICK = { route_id: 'some-route', ticked_on: '2026-09-29', style: 'send' }

function error(result: { error: string } | object): string | null {
  return 'error' in result && typeof result.error === 'string' ? result.error : null
}

describe('parseTickInput', () => {
  it('accepts a minimal tick and fills the optional fields with null', () => {
    expect(parseTickInput(TICK, NOW)).toEqual({ ...TICK, laps: null, note: null })
  })

  it('refuses an unknown key rather than ignoring it', () => {
    expect(error(parseTickInput({ ...TICK, date: '2026-09-29' }, NOW))).toMatch(/Unsupported field\(s\): date/)
  })

  it('refuses a date the calendar does not have', () => {
    expect(error(parseTickInput({ ...TICK, ticked_on: '2026-02-30' }, NOW))).toMatch(/not a real date/)
    expect(error(parseTickInput({ ...TICK, ticked_on: '2026-9-29' }, NOW))).toMatch(/YYYY-MM-DD/)
  })

  it('accepts tomorrow in UTC and refuses the day after', () => {
    expect(error(parseTickInput({ ...TICK, ticked_on: '2026-09-30' }, NOW))).toBeNull()
    expect(error(parseTickInput({ ...TICK, ticked_on: '2026-10-01' }, NOW))).toMatch(/future/)
  })

  it('refuses a style outside the list', () => {
    expect(error(parseTickInput({ ...TICK, style: 'redpoint' }, NOW))).toMatch(/style/)
  })

  it('takes laps from 1 to 999 and refuses 0, 1000 and fractions', () => {
    expect(parseTickInput({ ...TICK, laps: 1 }, NOW)).toMatchObject({ laps: 1 })
    expect(parseTickInput({ ...TICK, laps: 999 }, NOW)).toMatchObject({ laps: 999 })
    expect(error(parseTickInput({ ...TICK, laps: 0 }, NOW))).toMatch(/laps/)
    expect(error(parseTickInput({ ...TICK, laps: 1000 }, NOW))).toMatch(/laps/)
    expect(error(parseTickInput({ ...TICK, laps: 2.5 }, NOW))).toMatch(/laps/)
  })

  it('trims a note, stores a blank one as null, and refuses one past the limit', () => {
    expect(parseTickInput({ ...TICK, note: '  pumped  ' }, NOW)).toMatchObject({ note: 'pumped' })
    expect(parseTickInput({ ...TICK, note: '   ' }, NOW)).toMatchObject({ note: null })
    expect(error(parseTickInput({ ...TICK, note: 'x'.repeat(TICK_NOTE_MAX) }, NOW))).toBeNull()
    expect(error(parseTickInput({ ...TICK, note: 'x'.repeat(TICK_NOTE_MAX + 1) }, NOW))).toMatch(/longer/)
  })
})

describe('parsePositionInput', () => {
  const FIX = { lat: 44.566, lon: -92.53, accuracy_m: 8 }

  it('accepts a good fix', () => {
    expect(parsePositionInput(FIX)).toEqual(FIX)
  })

  it(`accepts exactly ${POSITION_ACCURACY_MAX_M} m and refuses anything rougher as too rough`, () => {
    expect(error(parsePositionInput({ ...FIX, accuracy_m: POSITION_ACCURACY_MAX_M }))).toBeNull()
    expect(error(parsePositionInput({ ...FIX, accuracy_m: POSITION_ACCURACY_MAX_M + 0.1 }))).toMatch(/too rough/)
  })

  it('refuses a zero or missing accuracy', () => {
    expect(error(parsePositionInput({ ...FIX, accuracy_m: 0 }))).toMatch(/accuracy_m/)
    expect(error(parsePositionInput({ lat: FIX.lat, lon: FIX.lon }))).toMatch(/accuracy_m/)
  })

  it('refuses coordinates off the globe or not finite', () => {
    expect(error(parsePositionInput({ ...FIX, lat: 90.01 }))).toMatch(/lat/)
    expect(error(parsePositionInput({ ...FIX, lon: -180.01 }))).toMatch(/lon/)
    expect(error(parsePositionInput({ ...FIX, lat: '44.5' }))).toMatch(/lat/)
  })

  it('refuses an unknown key, including one that would name who recorded it', () => {
    expect(error(parsePositionInput({ ...FIX, recorded_by: 'someone' }))).toMatch(/recorded_by/)
  })
})

describe('snapshot lookups', () => {
  const area = MN_GUIDEBOOK.find((a) => a.routes.length > 0)

  it('know an area and a route from the snapshot, and refuse ids it does not hold', () => {
    expect(area).toBeDefined()
    if (area === undefined) return
    expect(areaExists(area.id)).toBe(true)
    expect(routeExists(area.routes[0]?.id ?? '')).toBe(true)
    // An area id is not a route id, and the other way round.
    expect(routeExists(area.id)).toBe(false)
    expect(areaExists(area.routes[0]?.id ?? '')).toBe(false)
    expect(routeExists('00000000-0000-4000-8000-000000000000')).toBe(false)
  })
})
