import { describe, expect, it } from 'vitest'
import { measuresUrl, parseMeasures, range5, rankedSoilPoints, type WisconetHour } from './wisconet.js'

// The shape api.wisconet.wisc.edu answered on 2026-11-12 for DFRC, field ids as it gave them.
const FIELDS = [
  { id: 17, standard_name: '60min_rain_in_tot' },
  { id: 25, standard_name: '60min_soil_moisture_pct_avg@8in' },
  { id: 34, standard_name: '60min_soil_moisture_pct_avg@2in' },
  { id: 40, standard_name: '60min_soil_temp_f_avg@8in' },
  { id: 49, standard_name: '60min_soil_temp_f_avg@2in' },
]
const T = 1794391200 // 2026-11-11T10:00Z

describe('parseMeasures', () => {
  it('reads fields by name, converts °F and inches, and keeps a missing value null, never 0', () => {
    const hours = parseMeasures({
      fieldlist: FIELDS,
      data: [
        { collection_time: T + 3600, measures: [[17, null], [34, 0.251], [49, 32]] },
        { collection_time: T, measures: [[17, 0.1], [25, 0.317], [34, 0.255], [40, 49.8], [49, 46.9]] },
      ],
    })
    expect(hours).toEqual([
      { endMs: T * 1000, vwc_5: 0.255, temp_5_c: 8.3, vwc_20: 0.317, temp_20_c: 9.9, rain_mm: 2.54 },
      { endMs: (T + 3600) * 1000, vwc_5: 0.251, temp_5_c: 0, vwc_20: null, temp_20_c: null, rain_mm: null },
    ])
  })

  it('drops an out-of-range value, and refuses a body of another shape', () => {
    const [h] = parseMeasures({ fieldlist: FIELDS, data: [{ collection_time: T, measures: [[34, -6999], [17, 'NAN'], [49, 50]] }] })
    expect(h).toMatchObject({ vwc_5: null, rain_mm: null, temp_5_c: 10 })
    expect(() => parseMeasures({ detail: 'Service Unavailable' })).toThrow()
    expect(() => parseMeasures(null)).toThrow()
  })
})

describe('rankedSoilPoints', () => {
  const h = (i: number, vwc_5: number | null, temp_5_c: number | null): WisconetHour => ({
    endMs: T * 1000 + i * 3_600_000,
    vwc_5,
    temp_5_c,
    vwc_20: null,
    temp_20_c: null,
    rain_mm: 0,
  })

  it('ranks among thawed hours only, and gives a frozen hour no percentile', () => {
    // The frozen 0.05 reads dry and must not drag the ranking down.
    const pts = rankedSoilPoints([h(0, 0.05, -1), h(1, 0.2, 5), h(2, 0.3, 5)])
    expect(pts.map((p) => p.pct_5)).toEqual([null, 0.25, 0.75])
    expect(range5([h(0, 0.05, -1), h(1, 0.2, 5), h(2, 0.3, 5)])).toEqual({ lo_5: 0.2, hi_5: 0.3 })
  })

  it('has nothing to rank against with no thawed hour', () => {
    expect(rankedSoilPoints([h(0, 0.2, null)])[0]?.pct_5).toBeNull()
    expect(range5([h(0, 0.2, 0)])).toEqual({ lo_5: null, hi_5: null })
  })
})

describe('measuresUrl', () => {
  it('asks for the five fields over the span in Unix seconds', () => {
    const u = new URL(measuresUrl({ id: 'DFRC' }, 1_000_500, 2_000_500))
    expect(u.pathname).toBe('/api/v1/stations/DFRC/measures')
    expect(u.searchParams.get('start_time')).toBe('1000')
    expect(u.searchParams.get('end_time')).toBe('2001')
    expect(u.searchParams.get('fields')?.split(',')).toHaveLength(5)
  })
})
