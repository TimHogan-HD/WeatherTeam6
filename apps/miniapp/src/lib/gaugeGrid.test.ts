import { describe, expect, it } from 'vitest'
import { EM_DASH, type RainGaugeReadings } from '@weatherteam6/types'
import type { GaugeSide, ModelDay } from './gaugeLines.js'
import { cellShade, cellText, inchFigure, localDateOf, rainGrid, rainTabWord, SHADE_FULL_MM, totalText } from './gaugeGrid.js'

const IN = 25.4
const DATES = ['2026-11-06', '2026-11-07', '2026-11-08']

const airportDay = (mm: number | null) => ({ station: '04W', distance_km: 13, rain_mm: mm, hours_reported: mm === null ? 20 : 24, hours_expected: 24 })
const volunteerDay = (date: string, mm: number) => ({
  station: 'MN-PN-1',
  name: 'Finlayson 3.3 SE',
  distance_km: 5,
  rain_mm: mm,
  report_date: date,
  obs_hour: 8,
})

function readings(over: Partial<RainGaugeReadings> = {}): RainGaugeReadings {
  return {
    airport: { station: '04W', distance_km: 13, answered: true },
    volunteer: { stations: 2, failed: 0 },
    days: [
      { local_date: DATES[0]!, gauge: airportDay(null), volunteer_gauge: volunteerDay(DATES[0]!, 0) },
      { local_date: DATES[1]!, gauge: airportDay(0), volunteer_gauge: volunteerDay(DATES[1]!, 0.05 * IN) },
      { local_date: DATES[2]!, gauge: airportDay(0.3 * IN), volunteer_gauge: volunteerDay(DATES[2]!, 0.002) },
    ],
    ...over,
  }
}

const models = (entries: [string, ModelDay][]) => new Map<string, ModelDay>(entries)
const allModels = models([
  [DATES[0]!, { kind: 'partial' }],
  [DATES[1]!, { kind: 'value', mm: 0.25 }],
  [DATES[2]!, { kind: 'value', mm: 0.4 * IN }],
])

describe('rainGrid', () => {
  it('leaves a part day out of the total and keeps the rest', () => {
    const g = rainGrid(readings(), allModels)
    const [m, air, vol] = g.rows
    expect(g.dates).toEqual(DATES)
    expect(m?.cells[0]).toEqual({ kind: 'part' })
    expect(m?.totalMm).toBeCloseTo(0.25 + 0.4 * IN)
    expect(air?.cells.map(cellText)).toEqual(['part', '0', '0.30'])
    expect(air?.totalMm).toBeCloseTo(0.3 * IN)
    // The volunteer's trace is a word, never 0.00, and counts in the total.
    expect(vol?.cells.map(cellText)).toEqual(['0', '0.05', 'trace'])
    expect(totalText(vol!)).toBe('0.05')
  })

  it('withholds a row total when any day has no figure, rather than printing a drier week', () => {
    const r = readings()
    const days = r.days.map((d, i) => (i === 1 ? { ...d, gauge: null, volunteer_gauge: null } : d))
    const g = rainGrid({ ...r, days }, allModels)
    const air = g.rows.find((x) => x.key === 'airport')!
    expect(air.cells[1]).toEqual({ kind: 'gap', why: 'no report' })
    expect(air.totalMm).toBeNull()
    expect(totalText(air)).toBe(EM_DASH)
  })

  it('says a missing day is a failed read when the gauge did not answer', () => {
    const r = readings({ airport: { station: '04W', distance_km: 13, answered: false } })
    const g = rainGrid({ ...r, days: r.days.map((d) => ({ ...d, gauge: null })) }, allModels)
    expect(g.rows.find((x) => x.key === 'airport')?.cells[0]).toEqual({ kind: 'gap', why: 'no reading' })
  })

  it('gives the models a gap, not 0, outside the hours the tab drew', () => {
    const g = rainGrid(readings(), models([[DATES[2]!, { kind: 'value', mm: 1 }]]))
    expect(g.rows[0]?.cells[0]).toEqual({ kind: 'gap', why: 'no figure' })
    expect(g.rows[0]?.totalMm).toBeNull()
  })

  it('draws only the gauges in reach', () => {
    const g = rainGrid(readings({ airport: null, volunteer: { stations: 0, failed: 0 } }), allModels)
    expect(g.rows.map((x) => x.key)).toEqual(['models'])
  })
})

describe('inchFigure and cellShade', () => {
  it('prints a measured zero as 0 and a trace as a word', () => {
    expect(inchFigure(0)).toBe('0')
    expect(inchFigure(0.1)).toBe('trace')
    expect(inchFigure(0.01 * IN)).toBe('0.01')
  })

  it('shades only measured rain, on one fixed scale', () => {
    expect(cellShade({ kind: 'value', mm: 0 })).toBeNull()
    expect(cellShade({ kind: 'value', mm: 0.1 })).toBeNull()
    expect(cellShade({ kind: 'part' })).toBeNull()
    expect(cellShade({ kind: 'gap', why: 'no report' })).toBeNull()
    expect(cellShade({ kind: 'value', mm: SHADE_FULL_MM })).toBeCloseTo(0.6)
    expect(cellShade({ kind: 'value', mm: 3 * SHADE_FULL_MM })).toBeCloseTo(0.6)
    const light = cellShade({ kind: 'value', mm: 0.01 * IN })!
    const heavy = cellShade({ kind: 'value', mm: 0.3 * IN })!
    expect(light).toBeGreaterThan(0.12)
    expect(heavy).toBeGreaterThan(light)
  })
})

describe('rainTabWord', () => {
  const side = (read: GaugeSide['read']): GaugeSide => ({ kind: 'airport', gaugeMm: 1, modelsMm: 1, days: 5, read })
  it('says little rain when no gauge could tell, and a dash when none had a whole day', () => {
    expect(rainTabWord([side('little'), { ...side('little'), kind: 'volunteer' }])).toBe('Little rain')
    expect(rainTabWord([])).toBe(EM_DASH)
  })
  it('lets a gauge that could tell speak over one that could not', () => {
    expect(rainTabWord([side('matched'), { ...side('little'), kind: 'volunteer' }])).toBe('Models matched')
  })
})

describe('localDateOf', () => {
  it('reads the date on the crag clock, not UTC', () => {
    // 03:00 UTC on Nov 9 is 9 PM on Nov 8 in Minnesota (UTC-6).
    expect(localDateOf('2026-11-09T03:00:00Z', -6 * 3600)).toBe('2026-11-08')
    expect(localDateOf('nope', 0)).toBeNull()
  })
})
