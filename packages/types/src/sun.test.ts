import { describe, it, expect } from 'vitest'
import { KNOWN_CRAGS } from './knownCrags.js'
import {
  daylightSpans,
  localDayInstants,
  solarPosition,
  sunOnWallAt,
  sunSpans,
  sunWallsFor,
  type SunWall,
} from './sun.js'
import { SUN_WALLS } from './sunWallsData.js'

/** Red Rock, NV. Local solar noon on the June solstice is ~19:43 UTC. */
const RED_ROCK = { lat: 36.13, lon: -115.43 }
const JUNE_NOON = new Date('2026-06-21T19:43:00Z')
const DEC_NOON = new Date('2026-12-21T19:43:00Z')
/** 07:30 PDT on the solstice — the sun is low in the east-north-east. */
const JUNE_MORNING = new Date('2026-06-21T14:30:00Z')

describe('solarPosition', () => {
  it('puts the solstice noon sun at 90° − |lat − declination|', () => {
    // Independent of the Fourier series: at solar noon elevation is
    // 90 − |φ − δ|, with δ = ±23.44° at the solstices.
    const june = solarPosition(JUNE_NOON, RED_ROCK.lat, RED_ROCK.lon)
    const dec = solarPosition(DEC_NOON, RED_ROCK.lat, RED_ROCK.lon)
    expect(june?.elevationDeg).toBeCloseTo(90 - (36.13 - 23.44), 0)
    expect(dec?.elevationDeg).toBeCloseTo(90 - (36.13 + 23.44), 0)
  })

  it('reads azimuth clockwise from north: south at noon in the north, north in the south', () => {
    const north = solarPosition(JUNE_NOON, RED_ROCK.lat, RED_ROCK.lon)
    expect(Math.abs((north?.azimuthDeg ?? 0) - 180)).toBeLessThan(5)
    // Sydney-ish latitude, same longitude so the same instant is solar noon.
    const south = solarPosition(DEC_NOON, -33.9, RED_ROCK.lon)
    const az = south?.azimuthDeg ?? 180
    expect(Math.min(az, 360 - az)).toBeLessThan(5)
  })

  it('has the morning sun in the east and a negative elevation at night', () => {
    const morning = solarPosition(JUNE_MORNING, RED_ROCK.lat, RED_ROCK.lon)
    expect(morning?.azimuthDeg).toBeGreaterThan(45)
    expect(morning?.azimuthDeg).toBeLessThan(100)
    const night = solarPosition(new Date('2026-06-21T08:00:00Z'), RED_ROCK.lat, RED_ROCK.lon)
    expect(night?.elevationDeg).toBeLessThan(0)
  })

  it('returns null for an invalid instant or coordinate rather than a sun', () => {
    expect(solarPosition(new Date('nope'), 0, 0)).toBeNull()
    expect(solarPosition(JUNE_NOON, Number.NaN, 0)).toBeNull()
  })
})

const CHICAGO = 'America/Chicago'
/** Barn Bluff, Red Wing. Solar noon on Dec 21 is about 12:12 CST, 18:12 UTC. */
const BARN_BLUFF = { lat: 44.569, lon: -92.521 }

function wall(aspect_deg: number, horizon = 0, horizon_deg?: number[]): SunWall {
  return { name: 'Test', aspect_deg, height_m: 20, foot: BARN_BLUFF, horizon_deg: horizon_deg ?? Array<number>(360).fill(horizon) }
}

describe('localDayInstants', () => {
  it('samples a local day every 5 minutes, from the zone rather than a fixed offset', () => {
    expect(localDayInstants('2026-10-27', CHICAGO)).toHaveLength(288)
    // Clocks go back on Nov 1 (25 h) and forward on Mar 8 (23 h).
    expect(localDayInstants('2026-11-01', CHICAGO)).toHaveLength(300)
    expect(localDayInstants('2026-03-08', CHICAGO)).toHaveLength(276)
  })

  it('starts at local midnight', () => {
    expect(localDayInstants('2026-10-27', CHICAGO)[0]).toBe(Date.parse('2026-10-27T05:00:00Z'))
  })

  it('has no instants for a date it cannot read', () => {
    expect(localDayInstants('not a date', CHICAGO)).toEqual([])
  })
})

describe('sunOnWallAt', () => {
  const decNoon = Date.parse('2026-12-21T18:12:00Z')

  it('puts the winter noon sun on a south face and not on a north one', () => {
    expect(sunOnWallAt(wall(180), decNoon)).toBe(true)
    expect(sunOnWallAt(wall(0), decNoon)).toBe(false)
  })

  it('hides the sun behind a skyline higher than it', () => {
    // The sun stands about 22° up at Red Wing's winter noon.
    expect(sunOnWallAt(wall(180, 20), decNoon)).toBe(true)
    expect(sunOnWallAt(wall(180, 25), decNoon)).toBe(false)
  })

  it("reads the skyline in the sun's own direction", () => {
    const south = Array<number>(360).fill(0)
    for (let a = 170; a <= 190; a++) south[a] = 40
    expect(sunOnWallAt(wall(180, 0, south), decNoon)).toBe(false)
    // Two hours later the sun is well west of the ridge.
    expect(sunOnWallAt(wall(180, 0, south), decNoon + 2 * 3_600_000)).toBe(true)
  })

  it('never calls sun on the wall at night or without a skyline', () => {
    expect(sunOnWallAt(wall(180), Date.parse('2026-12-21T06:00:00Z'))).toBe(false)
    expect(sunOnWallAt(wall(180, 0, []), decNoon)).toBe(false)
  })
})

describe('sunSpans', () => {
  const equinox = localDayInstants('2026-03-20', CHICAGO)

  it('lights a south face under a level skyline for the whole equinox day', () => {
    const spans = sunSpans(wall(180), equinox)
    expect(spans).toHaveLength(1)
    const hours = ((spans[0]?.to ?? 0) - (spans[0]?.from ?? 0)) / 3_600_000
    expect(hours).toBeGreaterThan(11.5)
    expect(hours).toBeLessThan(12.5)
    expect(spans).toEqual(daylightSpans(wall(180), equinox))
  })

  it('lights an east face only until solar noon', () => {
    const [span, ...rest] = sunSpans(wall(90), equinox)
    expect(rest).toEqual([])
    // Solar noon at Red Wing on Mar 20 is about 13:17 CDT, 18:17 UTC.
    expect(span?.to).toBeLessThanOrEqual(Date.parse('2026-03-20T18:25:00Z'))
    expect(span?.to).toBeGreaterThan(Date.parse('2026-03-20T18:10:00Z'))
  })
})

describe('sunWallsFor', () => {
  it('answers only for a crag the owner confirmed', () => {
    expect(sunWallsFor('red-wing')).not.toBeNull()
    expect(sunWallsFor('taylors-falls')).toBeNull()
    expect(sunWallsFor(null)).toBeNull()
    expect(sunWallsFor(undefined)).toBeNull()
    expect(sunWallsFor('no-such-crag')).toBeNull()
  })

  it('has data for every confirmed crag, and none for any other', () => {
    const confirmed = KNOWN_CRAGS.filter((c) => c.sun_confirmed === true).map((c) => c.slug)
    expect(Object.keys(SUN_WALLS).sort()).toEqual(confirmed.sort())
  })

  it('stores a whole skyline for every wall', () => {
    for (const crag of Object.values(SUN_WALLS)) {
      expect(crag.walls.length).toBeGreaterThan(0)
      for (const w of crag.walls) {
        expect(w.horizon_deg).toHaveLength(360)
        expect(w.horizon_deg.every((v) => Number.isFinite(v) && v > -10 && v < 90)).toBe(true)
      }
    }
  })

  it('keeps the Winter Wall hours the owner looked at (2026-10-27)', () => {
    const red = sunWallsFor('red-wing')
    const winter = red?.walls.find((w) => w.name === 'Winter Wall')
    if (red === null || winter === undefined) throw new Error('no Winter Wall')
    const [span, ...rest] = sunSpans(winter, localDayInstants('2026-12-21', red.time_zone))
    expect(rest).toEqual([])
    // 8:00 AM – 4:25 PM CST, to within one step.
    expect(Math.abs((span?.from ?? 0) - Date.parse('2026-12-21T14:00:00Z'))).toBeLessThanOrEqual(300_000)
    expect(Math.abs((span?.to ?? 0) - Date.parse('2026-12-21T22:25:00Z'))).toBeLessThanOrEqual(300_000)
  })
})
