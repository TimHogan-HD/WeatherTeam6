import { describe, expect, it } from 'vitest'
import { CLIMB_HOURS_DEFAULT, type WallHour, type WallReadings } from '@weatherteam6/types'
import { gridTitle, nowColumn, wallGrid } from './wallGrid.js'

/** Red Wing in October: CDT, five hours behind UTC. */
const OFFSET = -5 * 3600
const TODAY = '2026-10-19'

/** Every hour stamp from 2026-10-19 06:00 local to 2026-10-20 23:00 local, as UTC ISO. */
const STAMPS = Array.from({ length: 42 }, (_, i) => new Date(Date.parse('2026-10-19T11:00:00Z') + i * 3_600_000).toISOString())

const localHour = (iso: string) => new Date(Date.parse(iso) + OFFSET * 1000).getUTCHours()

const wall = (name: string, at: (iso: string) => Omit<WallHour, 'valid_at'> | null, treeShaded = false): WallReadings => ({
  name,
  aspect_deg: 180,
  tree_shaded: treeShaded,
  hours: STAMPS.flatMap((valid_at) => {
    const h = at(valid_at)
    return h === null ? [] : [{ valid_at, ...h }]
  }),
  days: [],
})

/** Winter Wall bakes from 11 to 3; Large Roof sits under trees at 100. */
const winter = wall('Winter Wall', (iso) => {
  const h = localHour(iso)
  const sun = h >= 11 && h <= 15
  return { score: sun ? 20 : 90, in_sun: sun }
})
const roof = wall('Large Roof', () => ({ score: 100, in_sun: false }), true)

const at = (localIso: string) => Date.parse(localIso) - OFFSET * 1000

describe('wallGrid', () => {
  it('lays out today’s climbing hours, 8 AM to 6 PM, one column each', () => {
    const g = wallGrid([winter, roof], TODAY, CLIMB_HOURS_DEFAULT, OFFSET, at('2026-10-19T09:30:00Z'))!
    expect(g.localDate).toBe(TODAY)
    expect(g.columns.map((c) => c.label)).toEqual(['8a', '9a', '10a', '11a', '12p', '1p', '2p', '3p', '4p', '5p', '6p'])
  })

  it('lists walls A–Z and carries each hour’s score and sun', () => {
    const g = wallGrid([winter, roof], TODAY, CLIMB_HOURS_DEFAULT, OFFSET, at('2026-10-19T09:30:00Z'))!
    expect(g.rows.map((r) => r.name)).toEqual(['Large Roof', 'Winter Wall'])
    expect(g.rows[0]!.treeShaded).toBe(true)
    const w = g.rows[1]!.cells
    expect(w[0]).toEqual({ score: 90, inSun: false }) // 8 AM
    expect(w[5]).toEqual({ score: 20, inSun: true }) // 1 PM
  })

  it('follows the reader’s climbing hours', () => {
    const g = wallGrid([winter], TODAY, { first: 10, last: 14 }, OFFSET, at('2026-10-19T09:30:00Z'))!
    expect(g.columns.map((c) => c.label)).toEqual(['10a', '11a', '12p', '1p', '2p'])
  })

  it('keeps today while one climbing hour is still open', () => {
    // 5:30 PM: the 6 PM stamp covers 5–6 PM and is still ahead.
    expect(wallGrid([winter], TODAY, CLIMB_HOURS_DEFAULT, OFFSET, at('2026-10-19T17:30:00Z'))!.localDate).toBe(TODAY)
  })

  it('moves to tomorrow once today’s climbing hours are over', () => {
    const g = wallGrid([winter], TODAY, CLIMB_HOURS_DEFAULT, OFFSET, at('2026-10-19T18:30:00Z'))!
    expect(g.localDate).toBe('2026-10-20')
    expect(g.columns).toHaveLength(11)
  })

  it('leaves a gap where one wall lacks an hour, never a neighbour’s figure', () => {
    const short = wall('Cyclops', (iso) => (localHour(iso) === 13 ? null : { score: 60, in_sun: false }))
    const g = wallGrid([winter, short], TODAY, CLIMB_HOURS_DEFAULT, OFFSET, at('2026-10-19T09:30:00Z'))!
    const cyclops = g.rows.find((r) => r.name === 'Cyclops')!.cells
    expect(g.columns).toHaveLength(11)
    expect(cyclops[5]).toBeNull()
    expect(cyclops[4]).toEqual({ score: 60, inSun: false })
  })

  it('keeps an unscored hour unscored', () => {
    const blank = wall('Blank', () => ({ score: null, in_sun: true }))
    const g = wallGrid([blank], TODAY, CLIMB_HOURS_DEFAULT, OFFSET, at('2026-10-19T09:30:00Z'))!
    expect(g.rows[0]!.cells.every((c) => c !== null && c.score === null)).toBe(true)
  })

  it('says nothing without walls, without today, or past the window', () => {
    expect(wallGrid([], TODAY, CLIMB_HOURS_DEFAULT, OFFSET, at('2026-10-19T09:30:00Z'))).toBeNull()
    expect(wallGrid([winter], null, CLIMB_HOURS_DEFAULT, OFFSET, at('2026-10-19T09:30:00Z'))).toBeNull()
    expect(wallGrid([winter], TODAY, CLIMB_HOURS_DEFAULT, OFFSET, at('2026-10-20T20:00:00Z'))).toBeNull()
  })

  it('never shows a day before today', () => {
    // Today per the forecast is the 20th; the 19th's hours are history.
    const g = wallGrid([winter], '2026-10-20', CLIMB_HOURS_DEFAULT, OFFSET, at('2026-10-19T09:30:00Z'))!
    expect(g.localDate).toBe('2026-10-20')
  })
})

describe('gridTitle', () => {
  it('names today and tomorrow, and a later day by its weekday rather than as tomorrow', () => {
    expect(gridTitle('2026-10-19', '2026-10-19')).toBe('Walls today')
    expect(gridTitle('2026-10-20', '2026-10-19')).toBe('Walls tomorrow')
    expect(gridTitle('2026-10-21', '2026-10-19')).toBe('Walls on Wednesday')
    expect(gridTitle('2026-10-20', null)).toBe('Walls on Tuesday')
  })
})

describe('nowColumn', () => {
  const g = wallGrid([winter], TODAY, CLIMB_HOURS_DEFAULT, OFFSET, at('2026-10-19T09:30:00Z'))!

  it('lights the hour whose stamp is next: 12:30 PM is the 1 PM column', () => {
    expect(g.columns[nowColumn(g, at('2026-10-19T12:30:00Z'))]!.label).toBe('1p')
  })

  it('lights nothing before the first climbing hour', () => {
    expect(nowColumn(g, at('2026-10-19T05:30:00Z'))).toBe(-1)
  })
})
