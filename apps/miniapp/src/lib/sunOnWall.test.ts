import { describe, it, expect } from 'vitest'
import type { SunWalls } from '@weatherteam6/types'
import { formatSunMinutes, localYmd, sunWallRows } from './sunOnWall.js'

const level = (aspect_deg: number) => ({
  name: `Face ${aspect_deg}`,
  aspect_deg,
  height_m: 20,
  foot: { lat: 44.569, lon: -92.521 },
  horizon_deg: Array<number>(360).fill(0),
})
const DATA: SunWalls = { time_zone: 'America/Chicago', computed: '2026-10-27', walls: [level(90), level(0)] }

describe('localYmd', () => {
  it("reads the crag's own date, not UTC's", () => {
    // 03:00 UTC on Oct 28 is still the evening of Oct 27 in Minnesota.
    expect(localYmd(Date.parse('2026-10-28T03:00:00Z'), 'America/Chicago')).toBe('2026-10-27')
  })
})

describe('formatSunMinutes', () => {
  it('prints hours and minutes in words a reader scans', () => {
    expect(formatSunMinutes(575)).toBe('9 h 35 min')
    expect(formatSunMinutes(480)).toBe('8 h')
    expect(formatSunMinutes(40)).toBe('40 min')
  })
})

describe('sunWallRows', () => {
  const [east, north] = sunWallRows(DATA, '2026-03-20')

  it('names the direction and prints local clock times', () => {
    expect(east?.faces).toBe('faces E')
    expect(east?.sunText).toMatch(/^7:\d\d AM – 1:\d\d PM$/)
  })

  it('places the strip in minutes past local midnight', () => {
    const band = east?.sun[0]
    expect(band?.from).toBeGreaterThan(7 * 60)
    expect(band?.to).toBeLessThan(13 * 60 + 30)
    expect(east?.sunMinutes).toBe((band?.to ?? 0) - (band?.from ?? 0))
  })

  it('says none for a face the sun never reaches, and still draws the daylight', () => {
    expect(north?.sunText).toBeNull()
    expect(north?.sunMinutes).toBe(0)
    expect(north?.daylight.length).toBe(1)
  })
})
