import { describe, it, expect } from 'vitest'
import { CLIMB_HOURS_DEFAULT, sunShadeAt, sunShadeOnDay, sunWallsFor } from '@weatherteam6/types'
import { evaluateWallA, HEAT_START_C } from '../scoring/cragModel.js'
import {
  RED_WING_ONE_PM,
  RED_WING_UTC_OFFSET_S,
  redWing20261019,
} from '../scoring/redWing20261019.fixture.js'
import { buildWallReadings, type WallReadingsInput } from './wallReadings.js'
import { scoringWallsFor } from './scoringLocation.js'

const walls = scoringWallsFor('red-wing')
const winter = sunWallsFor('red-wing')!.walls.find((w) => w.name === 'Winter Wall')!
const weather = redWing20261019(winter.foot.lat, winter.foot.lon)
const DAY = '2026-10-19'
const ONE_PM = weather[RED_WING_ONE_PM]!.valid_at

const build = (over: Partial<WallReadingsInput> = {}) =>
  buildWallReadings({
    weather,
    walls,
    rockType: 'carbonate_cherty',
    dates: [DAY],
    utcOffsetSeconds: RED_WING_UTC_OFFSET_S,
    // 6 AM local: the whole climbing day is still ahead.
    now: new Date('2026-10-19T11:00:00Z'),
    climbHours: CLIMB_HOURS_DEFAULT,
    ...over,
  })

describe('scoringWallsFor', () => {
  it("marks the owner's four tree-shaded walls at Red Wing, and nothing elsewhere", () => {
    expect(walls.filter((w) => w.treeShaded).map((w) => w.skyline.name).sort()).toEqual([
      'Annadonia Area',
      'Large Roof Area',
      'New Vice Area',
      'Perfect Crimb Area',
    ])
    expect(walls.filter((w) => !w.treeShaded).map((w) => w.skyline.name).sort()).toEqual(['Cyclops Area', 'Winter Wall'])
    // Willow River has no confirmed sun and shade, and a place that is no known crag has no walls.
    expect(scoringWallsFor('willow-river')).toEqual([])
    expect(scoringWallsFor(null)).toEqual([])
  })
})

describe('buildWallReadings — Red Wing, 2026-10-19', () => {
  const out = build()
  const byName = (name: string) => out.find((w) => w.name === name)!

  it('publishes only the window, one hour per hour, each wall on its own clock', () => {
    expect(out).toHaveLength(6)
    for (const w of out) {
      expect(w.hours).toHaveLength(24)
      expect(w.days.map((d) => d.local_date)).toEqual([DAY])
    }
    // Trimming the hours past the window changes nothing inside it: the model only looks back.
    const full = evaluateWallA(weather, {
      rockType: 'carbonate_cherty',
      wall: { lat: winter.foot.lat, lon: winter.foot.lon, aspectDeg: winter.aspect_deg, cliffAngleDeg: 0 },
      skyline: winter,
    })
    expect(byName('Winter Wall').hours.find((h) => h.valid_at === ONE_PM)!.score).toBe(full[RED_WING_ONE_PM]!.score)
  })

  it('never puts a tree-shaded wall in sun, and puts nothing in sun at night', () => {
    for (const w of out.filter((x) => x.tree_shaded)) expect(w.hours.every((h) => !h.in_sun)).toBe(true)
    const midnight = out.map((w) => w.hours[0]!)
    expect(midnight.every((h) => !h.in_sun)).toBe(true)
    expect(byName('Winter Wall').hours.find((h) => h.valid_at === ONE_PM)!.in_sun).toBe(true)
  })

  it('splits 1 PM into a hot wall in sun and a good one in shade, more than the alike margin apart', () => {
    const pair = sunShadeAt(out, ONE_PM)!
    expect(pair.sun.best!.score).toBeLessThan(40)
    expect(pair.shade.best!.score).toBeGreaterThanOrEqual(90)
    expect(pair.alike).toBe(false)
    expect(pair.sun.walls + pair.shade.walls).toBe(6)
  })

  it('splits the day by sun hours: the south walls are the sun group, the tree-shaded ones the shade', () => {
    expect(byName('Winter Wall').days[0]!.sun_hours).toBeGreaterThanOrEqual(2)
    expect(byName('Large Roof Area').days[0]!.sun_hours).toBe(0)
    const pair = sunShadeOnDay(out, DAY)!
    expect(pair.shade.walls).toBeGreaterThanOrEqual(4)
    expect(pair.sun.best!.score).toBeLessThan(pair.shade.best!.score)
    expect(pair.alike).toBe(false)
  })

  it("reads the reader's temperature range: a hotter top edge eases the sunny wall", () => {
    const tolerant = build({ range: { lowC: -1, highC: HEAT_START_C + 15 } })
    const at = (ws: typeof out) => ws.find((w) => w.name === 'Winter Wall')!.hours.find((h) => h.valid_at === ONE_PM)!.score!
    expect(at(tolerant)).toBeGreaterThan(at(out))
  })

  it("counts only today's hours still ahead, as the crag's day does", () => {
    // 5:30 PM local: two climbing hours left, no three-hour run, and only those hours' sun.
    const late = build({ now: new Date('2026-10-19T22:30:00Z') })
    for (const w of late) {
      expect(w.days[0]!.score).toBeNull()
      expect(w.days[0]!.sun_hours).toBeLessThanOrEqual(2)
    }
    expect(sunShadeOnDay(late, DAY)!.alike).toBeNull()
  })

  it('withholds a sunny wall whose sun was not measured, and with it the sun group', () => {
    const gap = weather.map((h, i) => (i === RED_WING_ONE_PM ? { ...h, shortwave_wm2: null } : h))
    const ws = build({ weather: gap })
    expect(ws.find((w) => w.name === 'Winter Wall')!.hours.find((h) => h.valid_at === ONE_PM)!.score).toBeNull()
    const pair = sunShadeAt(ws, ONE_PM)!
    expect(pair.sun.best).toBeNull()
    expect(pair.alike).toBeNull()
  })

  it('is empty with no walls', () => {
    expect(build({ walls: [] })).toEqual([])
  })
})
