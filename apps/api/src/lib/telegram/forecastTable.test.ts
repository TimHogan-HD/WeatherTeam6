import { describe, expect, it } from 'vitest'
import type { RunHour } from '../runs/latestRuns.js'
import {
  buildRows,
  compassPoint,
  dayHasData,
  DETAIL_AIR_COLUMNS,
  DETAIL_WIND_COLUMNS,
  isIntervalHours,
  isTableUnits,
  localDays,
  modelLabel,
  precipCell,
  renderTable,
  SIMPLE_COLUMNS,
  stepNote,
} from './forecastTable.js'

/**
 * Red Rock's offset, so every fixture here is a location west of Greenwich —
 * the direction where a UTC-bucketed day is wrong, and the reason issue #33
 * exists.
 */
const OFFSET = -25200 // UTC-7

/** The instant of a local wall-clock hour on 2026-09-04 at `OFFSET`. */
function at(hour: number): Date {
  return new Date(Date.parse(`2026-09-04T${String(hour).padStart(2, '0')}:00:00Z`) - OFFSET * 1000)
}

function hour(over: Partial<RunHour> & { valid_at: Date }): RunHour {
  return {
    temp_c: null,
    dewpoint_c: null,
    humidity_pct: null,
    precip_mm: null,
    wind_kmh: null,
    wind_gust_kmh: null,
    wind_dir_deg: null,
    cloud_pct: null,
    precip_prob_pct: null,
    pressure_hpa: null,
    ...over,
  }
}

describe('precipCell', () => {
  it('renders a missing amount as a gap, not as zero rain', () => {
    // The whole reason the formatters take `number | null`: 0 in this column
    // means "it will not rain", and that is not what a gap means.
    expect(precipCell(null, 'imperial', 5).trim()).toBe('—')
  })

  it('distinguishes a real zero from a trace', () => {
    expect(precipCell(0, 'imperial', 5).trim()).toBe('0')
    // 0.1 mm is 0.0039 in, which `toFixed(2)` would print as 0.00 — the same
    // string as no rain at all.
    expect(precipCell(0.1, 'imperial', 5).trim()).toBe('t')
  })

  it('converts to inches under imperial and stays in millimetres under metric', () => {
    expect(precipCell(25.4, 'imperial', 5).trim()).toBe('1.00')
    expect(precipCell(25.4, 'metric', 5).trim()).toBe('25.4')
  })

  it('pads to the requested width so a column cannot shift', () => {
    expect(precipCell(25.4, 'imperial', 6)).toHaveLength(6)
    expect(precipCell(null, 'imperial', 6)).toHaveLength(6)
  })
})

describe('compassPoint', () => {
  it('reads due north as a real direction rather than a missing one', () => {
    // 0 is falsy, and a truthiness check here would render north as a gap.
    expect(compassPoint(0)).toBe('N')
  })

  it('wraps at 360 and rounds to the nearest of sixteen', () => {
    expect(compassPoint(359)).toBe('N')
    expect(compassPoint(202.5)).toBe('SSW')
    expect(compassPoint(-90)).toBe('W')
  })

  it('has no direction for a missing reading', () => {
    expect(compassPoint(null)).toBeNull()
    expect(compassPoint(Number.NaN)).toBeNull()
  })
})

describe('localDays', () => {
  it('buckets by the location day, not the UTC one', () => {
    // 2026-09-04T02:00Z is 19:00 on the 3rd at UTC-7. Bucketing this by UTC is
    // exactly the bug issue #33 fixed, and it only shows west of Greenwich.
    const days = localDays([hour({ valid_at: new Date('2026-09-04T02:00:00Z') })], OFFSET)
    expect(days).toEqual(['2026-09-03'])
  })

  it('returns each day once, in order', () => {
    const days = localDays([hour({ valid_at: at(23) }), hour({ valid_at: at(1) })], OFFSET)
    expect(days).toEqual(['2026-09-04'])
  })
})

describe('buildRows', () => {
  it('takes the instantaneous values from the row hour itself', () => {
    const rows = buildRows([hour({ valid_at: at(12), temp_c: 30 })], OFFSET, '2026-09-04', 3)
    expect(rows.find((r) => r.hour === 12)?.at?.temp_c).toBe(30)
  })

  it('accumulates the rain that falls after the row, not before it', () => {
    // Open-Meteo stamps precipitation at the end of the hour it fell in, so
    // 12:00 is rain from 11:00–12:00 and belongs to the previous step. Summing
    // [12, 15) instead of (12, 15] would move every shower one step earlier.
    const rows = buildRows(
      [
        hour({ valid_at: at(12), precip_mm: 5 }),
        hour({ valid_at: at(13), precip_mm: 1 }),
        hour({ valid_at: at(14), precip_mm: 2 }),
        hour({ valid_at: at(15), precip_mm: 4 }),
      ],
      OFFSET,
      '2026-09-04',
      3,
    )
    expect(rows.find((r) => r.hour === 12)?.precip_mm).toBe(7)
    expect(rows.find((r) => r.hour === 9)?.precip_mm).toBe(5)
  })

  it('sums a step that is only partly present rather than dropping it', () => {
    const rows = buildRows([hour({ valid_at: at(13), precip_mm: 1 })], OFFSET, '2026-09-04', 3)
    expect(rows.find((r) => r.hour === 12)?.precip_mm).toBe(1)
  })

  it('leaves a step with no hours at all as null, not zero', () => {
    // A sum over nothing is not a forecast of no rain, and `reduce` with a 0
    // seed would make the two identical.
    const rows = buildRows([hour({ valid_at: at(1), precip_mm: 3 })], OFFSET, '2026-09-04', 3)
    expect(rows.find((r) => r.hour === 12)?.precip_mm).toBeNull()
  })

  it('emits every step of the day even past the model horizon', () => {
    // HRRR stops at 54 h. A table that ends where the model does looks like a
    // day that ends there.
    const rows = buildRows([hour({ valid_at: at(0) })], OFFSET, '2026-09-04', 3)
    expect(rows).toHaveLength(8)
    expect(rows.at(-1)?.hour).toBe(21)
    expect(rows.at(-1)?.at).toBeNull()
  })

  it('emits 24 rows at an hourly step and 2 at a 12-hourly one', () => {
    expect(buildRows([], OFFSET, '2026-09-04', 1)).toHaveLength(24)
    expect(buildRows([], OFFSET, '2026-09-04', 12)).toHaveLength(2)
  })
})

describe('dayHasData', () => {
  it('is false for the padded hours past a model’s horizon', () => {
    // Measured live at Red Rock: `ncep_hrrr_conus` answers with 168 hours of
    // which 66 carry temperature. The rest are real rows full of nulls, so
    // checking that the hour exists would call 24 em dashes a forecast.
    const padded = [hour({ valid_at: at(0) }), hour({ valid_at: at(3) })]
    expect(dayHasData(buildRows(padded, OFFSET, '2026-09-04', 3))).toBe(false)
  })

  it('is true as soon as one value in the day is real', () => {
    const partial = [hour({ valid_at: at(6), cloud_pct: 0 })]
    expect(dayHasData(buildRows(partial, OFFSET, '2026-09-04', 3))).toBe(true)
  })

  it('does not count the blended probability as the model reaching the day', () => {
    // `precipitation_probability` runs 276 h against HRRR's 54 h model and is
    // byte-identical to another model's series — it belongs to no model, so it
    // cannot be the evidence that this one answered.
    const probOnly = [hour({ valid_at: at(6), precip_prob_pct: 40 })]
    expect(dayHasData(buildRows(probOnly, OFFSET, '2026-09-04', 3))).toBe(false)
  })

  it('counts a genuine zero as data', () => {
    const zero = [hour({ valid_at: at(6), wind_kmh: 0 })]
    expect(dayHasData(buildRows(zero, OFFSET, '2026-09-04', 3))).toBe(true)
  })
})

describe('renderTable', () => {
  const rows = buildRows(
    [hour({ valid_at: at(12), temp_c: 30, dewpoint_c: 2, wind_kmh: 20, cloud_pct: 40 })],
    OFFSET,
    '2026-09-04',
    12,
  )

  it('renders a missing temperature as a gap, never as 32°F', () => {
    // `cToF(null)` is 32 and `kmhToMph(null)` is 0: both read as measurements.
    // The 00:00 row has no hour behind it at all, which is the row that would
    // carry them.
    const empty = renderTable({ rows, columns: SIMPLE_COLUMNS, units: 'imperial' })?.split('\n')[1]
    expect(empty?.startsWith('00')).toBe(true)
    expect(empty).not.toContain('32')
    // Four value columns in the default set, and every one of them a gap: a `0`
    // for wind or `32` for temperature would take one of these away.
    expect(empty?.match(/—/g)).toHaveLength(SIMPLE_COLUMNS.length)
  })

  it('converts to Fahrenheit under imperial and leaves Celsius under metric', () => {
    expect(renderTable({ rows, columns: SIMPLE_COLUMNS, units: 'imperial' })).toContain('86')
    expect(renderTable({ rows, columns: SIMPLE_COLUMNS, units: 'metric' })).toContain('30')
  })

  it('heads the temperature column with the unit it is showing', () => {
    expect(renderTable({ rows, columns: SIMPLE_COLUMNS, units: 'imperial' })?.split('\n')[0]).toContain(
      '°F',
    )
    expect(renderTable({ rows, columns: SIMPLE_COLUMNS, units: 'metric' })?.split('\n')[0]).toContain('°C')
  })

  it('stays inside a phone width in every set, including the detail ones', () => {
    // The nine-column measurement in telegram-render.md is a *rich table*; the
    // `<pre>` path scrolls sideways instead of wrapping, so width still binds
    // here and nothing in run 1 says otherwise.
    //
    // This is the assertion that forced `⚙ More` to draw two stacked tables:
    // the single nine-column detail table it replaced measured 50 characters
    // and this test is what caught it.
    for (const columns of [SIMPLE_COLUMNS, DETAIL_AIR_COLUMNS, DETAIL_WIND_COLUMNS]) {
      const table = renderTable({ rows, columns, units: 'imperial' })
      for (const line of table?.split('\n') ?? []) expect(line.length).toBeLessThanOrEqual(32)
    }
  })

  it('renders every stored hourly variable across the three sets but one', () => {
    // The redesign's claim is that `⚙ More` moved variables off the first
    // screen without removing them. This is the assertion behind it: the union
    // of the three sets is every column `COLUMNS` defines. `pop` is the single
    // deliberate exclusion — a blended field the rain panel answers better —
    // and naming it here means dropping a *second* one cannot pass silently.
    const rendered = new Set<string>([
      ...SIMPLE_COLUMNS,
      ...DETAIL_AIR_COLUMNS,
      ...DETAIL_WIND_COLUMNS,
    ])
    expect([...rendered].sort()).toEqual(
      ['cloud', 'dew', 'dir', 'gust', 'precip', 'pressure', 'rh', 'temp', 'wind'].sort(),
    )
  })

  it('has no table at all for a day with no rows', () => {
    // A header with nothing under it reads as no wind, no rain and no cloud.
    expect(renderTable({ rows: [], columns: SIMPLE_COLUMNS, units: 'imperial' })).toBeNull()
  })
})

describe('guards', () => {
  it('accepts only the four intervals', () => {
    expect(isIntervalHours(3)).toBe(true)
    expect(isIntervalHours(2)).toBe(false)
    expect(isIntervalHours(0)).toBe(false)
  })

  it('accepts only the two unit systems', () => {
    expect(isTableUnits('metric')).toBe(true)
    expect(isTableUnits('Imperial')).toBe(false)
  })
})

describe('labels', () => {
  it('shortens the models it knows', () => {
    expect(modelLabel('ncep_hrrr_conus')).toBe('HRRR')
  })

  it('shows an unknown model under its own key rather than dropping it', () => {
    expect(modelLabel('some_new_model')).toBe('some_new_model')
  })

  it('states which way the rain in a row is counted', () => {
    expect(stepNote(3)).toContain('3 hours after')
    expect(stepNote(1)).toContain('hour after')
  })
})
