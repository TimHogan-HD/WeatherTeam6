import { describe, expect, it } from 'vitest'
import {
  buildHourlySeries,
  hourHasModelData,
  precipChancePct,
  selectModelByCoverage,
  windowDates,
} from './hourlySeries.js'
import type { DeterministicRuns, EnsembleRunHour, EnsembleRuns, ModelRun, RunHour } from './latestRuns.js'

/**
 * Every fixture here is built to reach a branch that would otherwise be unreachable —
 * defect class 11. In particular the models below deliberately have **different** hour
 * counts and **different** null patterns: a fixture where every model returns the same
 * hours would pass whether `selectModelByCoverage` measured coverage or just took the
 * first entry, which is the exact bug it exists to prevent.
 */

const HOUR_MS = 60 * 60 * 1000

/** Las Vegas in September: UTC-7. Negative, so a UTC-day comparison gets it wrong. */
const PDT = -7 * 3600

function det(overrides: Partial<RunHour> & { valid_at: Date }): RunHour {
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
    shortwave_wm2: null,
    ...overrides,
  }
}

function ens(overrides: Partial<EnsembleRunHour> & { valid_at: Date }): EnsembleRunHour {
  return {
    precip_mm_p10: null,
    precip_mm_p50: null,
    precip_mm_p90: null,
    temp_c_p10: null,
    temp_c_p50: null,
    temp_c_p90: null,
    wind_kmh_p10: null,
    wind_kmh_p50: null,
    wind_kmh_p90: null,
    precip_mm_mean: null,
    members_wet: null,
    member_count: 0,
    model_member_counts: {},
    ...overrides,
  }
}

function model(name: string, hours: RunHour[], shared: boolean | null = false): ModelRun {
  return { model: name, hours, probability_is_shared: shared }
}

function runs(models: ModelRun[], fetchedAt: Date | null = new Date('2026-09-08T12:00:00Z')): DeterministicRuns {
  return { models, unavailable_models: [], utc_offset_seconds: PDT, fetched_at: fetchedAt }
}

function ensRuns(hours: EnsembleRunHour[], fetchedAt: Date | null = new Date('2026-09-08T12:00:00Z')): EnsembleRuns {
  return { hours, utc_offset_seconds: PDT, fetched_at: fetchedAt }
}

describe('hourHasModelData', () => {
  const at = new Date('2026-09-08T12:00:00Z')

  it('is false for a padded hour where every value is null', () => {
    expect(hourHasModelData(det({ valid_at: at }))).toBe(false)
  })

  it('is true when a value is 0 — zero rain is a measurement, not a gap', () => {
    // Guards against a `!h.precip_mm` truthiness check, which would call a genuinely dry
    // hour "no coverage" and shorten every model's horizon by however many dry hours it had.
    expect(hourHasModelData(det({ valid_at: at, precip_mm: 0 }))).toBe(true)
    expect(hourHasModelData(det({ valid_at: at, temp_c: 0 }))).toBe(true)
  })

  it('does NOT count precip_prob_pct as evidence the model answered', () => {
    // The line this constrains is the field list in hourHasModelData: `precip_prob_pct` is
    // absent from it deliberately. That series runs past the horizon of the model it was
    // requested with, so counting it would report ~276h of coverage for a 54h model.
    expect(hourHasModelData(det({ valid_at: at, precip_prob_pct: 40 }))).toBe(false)
  })
})

describe('selectModelByCoverage', () => {
  const base = new Date('2026-09-08T00:00:00Z')
  const hoursAt = (n: number, filled: number): RunHour[] =>
    Array.from({ length: n }, (_, i) =>
      det({ valid_at: new Date(base.getTime() + i * HOUR_MS), temp_c: i < filled ? 20 : null }),
    )

  it('picks the model with the most hours carrying values, not the first in the list', () => {
    // `short` is first and has more *rows*; `long` has more rows with data. Selecting by
    // request order or by array length picks `short` and the assertion fails.
    const chosen = selectModelByCoverage([
      model('short', hoursAt(168, 48)),
      model('long', hoursAt(168, 160)),
    ])
    expect(chosen?.model).toBe('long')
  })

  it('breaks a tie by list order, so the choice is not left to row ordering', () => {
    const chosen = selectModelByCoverage([
      model('first', hoursAt(100, 50)),
      model('second', hoursAt(100, 50)),
    ])
    expect(chosen?.model).toBe('first')
  })

  it('returns null when every model is padding, rather than naming one that said nothing', () => {
    // Constrains the `bestCount > 0` guard. Without it this returns `all-null`, and the
    // caller would print a model name over 168 rows of em dashes.
    expect(selectModelByCoverage([model('all-null', hoursAt(48, 0))])).toBeNull()
  })

  it('returns null for an empty model list', () => {
    expect(selectModelByCoverage([])).toBeNull()
  })
})

describe('precipChancePct', () => {
  it('is null when members_wet was never recorded — not 0%', () => {
    // A row stored before the column existed. 0 here would be a confident "no chance of
    // rain" that nobody computed.
    expect(precipChancePct(null, 143)).toBeNull()
  })

  it('is null when no member reached the hour, rather than dividing by zero', () => {
    expect(precipChancePct(0, 0)).toBeNull()
  })

  it('is 0 when the count is real and no member is wet', () => {
    // The other side of the null case: this 0 *was* computed and must survive.
    expect(precipChancePct(0, 143)).toBe(0)
  })

  it('rounds to a whole percent', () => {
    expect(precipChancePct(86, 143)).toBe(60)
  })
})

describe('windowDates', () => {
  it('uses the location local day, not the UTC day', () => {
    // 03:00 UTC on the 9th is 20:00 on the 8th in Las Vegas. A UTC-based window starts a
    // day late and the first row of the response is not the day the user is standing in.
    // This is issue #33 in miniature.
    const dates = windowDates(new Date('2026-09-09T03:00:00Z'), PDT, 3)
    expect(dates).toEqual(['2026-09-08', '2026-09-09', '2026-09-10'])
  })

  it('rolls over a month boundary through Date rather than string arithmetic', () => {
    const dates = windowDates(new Date('2026-09-30T18:00:00Z'), PDT, 3)
    expect(dates).toEqual(['2026-09-30', '2026-10-01', '2026-10-02'])
  })

  it('returns WINDOW_DAYS entries by default', () => {
    expect(windowDates(new Date('2026-09-08T18:00:00Z'), PDT)).toHaveLength(7)
  })
})

describe('buildHourlySeries', () => {
  const now = new Date('2026-09-08T18:00:00Z') // 11:00 local, 2026-09-08

  it('joins deterministic and ensemble hours on the instant', () => {
    const at = new Date('2026-09-08T20:00:00Z')
    const series = buildHourlySeries({
      locationId: 'loc-1',
      deterministic: runs([model('gfs_seamless', [det({ valid_at: at, temp_c: 31.5 })])]),
      ensemble: ensRuns([ens({ valid_at: at, temp_c_p50: 31.0, temp_c_p10: 28, temp_c_p90: 34 })]),
      allModels: false,
      now,
      scoring: null,
    })

    expect(series.hours).toHaveLength(1)
    expect(series.hours[0]?.temp_c).toBe(31.5)
    expect(series.hours[0]?.temp_c_p50).toBe(31.0)
    expect(series.hours[0]?.local_date).toBe('2026-09-08')
  })

  it('keeps an hour that only one source has, with nulls on the other side', () => {
    // Constrains the union-of-instants loop. An intersection would drop both of these and
    // the chart would show a gap where one source had a real reading.
    const detOnly = new Date('2026-09-08T20:00:00Z')
    const ensOnly = new Date('2026-09-08T21:00:00Z')
    const series = buildHourlySeries({
      locationId: 'loc-1',
      deterministic: runs([model('gfs_seamless', [det({ valid_at: detOnly, temp_c: 30 })])]),
      ensemble: ensRuns([ens({ valid_at: ensOnly, temp_c_p50: 29 })]),
      allModels: false,
      now,
      scoring: null,
    })

    expect(series.hours).toHaveLength(2)
    expect(series.hours[0]?.temp_c).toBe(30)
    expect(series.hours[0]?.temp_c_p50).toBeNull()
    expect(series.hours[1]?.temp_c).toBeNull()
    expect(series.hours[1]?.temp_c_p50).toBe(29)
  })

  it('orders hours ascending even when the sources are interleaved', () => {
    const t = (h: number) => new Date(`2026-09-08T${String(h).padStart(2, '0')}:00:00Z`)
    const series = buildHourlySeries({
      locationId: 'loc-1',
      deterministic: runs([model('gfs_seamless', [det({ valid_at: t(22), temp_c: 1 }), det({ valid_at: t(19), temp_c: 2 })])]),
      ensemble: ensRuns([ens({ valid_at: t(20), temp_c_p50: 3 })]),
      allModels: false,
      now,
      scoring: null,
    })
    expect(series.hours.map((h) => h.valid_at)).toEqual([
      t(19).toISOString(),
      t(20).toISOString(),
      t(22).toISOString(),
    ])
  })

  it('drops hours outside the seven local days', () => {
    const inside = new Date('2026-09-08T20:00:00Z')
    const outside = new Date('2026-09-20T20:00:00Z') // ensemble reaches 16 days; the window is 7
    const series = buildHourlySeries({
      locationId: 'loc-1',
      deterministic: runs([model('gfs_seamless', [det({ valid_at: inside, temp_c: 30 })])]),
      ensemble: ensRuns([ens({ valid_at: inside, temp_c_p50: 29 }), ens({ valid_at: outside, temp_c_p50: 25 })]),
      allModels: false,
      now,
      scoring: null,
    })
    expect(series.hours).toHaveLength(1)
    expect(series.days).toHaveLength(7)
  })

  it('marks a day uncovered when the model only padded it', () => {
    // The padded hour exists and is inside the window, so a presence check would call the
    // day covered and the client would offer a drill-down into 24 em dashes.
    const real = new Date('2026-09-08T20:00:00Z')
    const padded = new Date('2026-09-09T20:00:00Z')
    const series = buildHourlySeries({
      locationId: 'loc-1',
      deterministic: runs([
        model('gfs_seamless', [det({ valid_at: real, temp_c: 30 }), det({ valid_at: padded })]),
      ]),
      ensemble: ensRuns([]),
      allModels: false,
      now,
      scoring: null,
    })

    expect(series.days[0]).toMatchObject({ local_date: '2026-09-08', has_deterministic: true })
    expect(series.days[1]).toMatchObject({ local_date: '2026-09-09', has_deterministic: false })
    // The hour is still returned — it is a gap in the chart, not a missing row.
    expect(series.hours).toHaveLength(2)
    expect(series.hours[1]?.temp_c).toBeNull()
  })

  it('leaves every deterministic column null when no model answered, without borrowing', () => {
    const at = new Date('2026-09-08T20:00:00Z')
    const series = buildHourlySeries({
      locationId: 'loc-1',
      deterministic: runs([model('gfs_seamless', [det({ valid_at: at })])]),
      ensemble: ensRuns([ens({ valid_at: at, temp_c_p50: 29 })]),
      allModels: false,
      now,
      scoring: null,
    })
    expect(series.model).toBeNull()
    expect(series.hours[0]?.temp_c).toBeNull()
    expect(series.hours[0]?.temp_c_p50).toBe(29)
  })

  it('carries unavailable_models through rather than dropping them', () => {
    const at = new Date('2026-09-08T20:00:00Z')
    const d = runs([model('gfs_seamless', [det({ valid_at: at, temp_c: 30 })])])
    const series = buildHourlySeries({
      locationId: 'loc-1',
      deterministic: { ...d, unavailable_models: ['ncep_hrrr_conus'] },
      ensemble: ensRuns([]),
      allModels: false,
      now,
      scoring: null,
    })
    expect(series.unavailable_models).toEqual(['ncep_hrrr_conus'])
  })

  it('omits `models` unless allModels is set', () => {
    const at = new Date('2026-09-08T20:00:00Z')
    const series = buildHourlySeries({
      locationId: 'loc-1',
      deterministic: runs([model('gfs_seamless', [det({ valid_at: at, temp_c: 30 })])]),
      ensemble: ensRuns([]),
      allModels: false,
      now,
      scoring: null,
    })
    expect(series.models).toBeUndefined()
  })

  it('under allModels reports each model on the shared axis with its own measured coverage', () => {
    const t1 = new Date('2026-09-08T20:00:00Z')
    const t2 = new Date('2026-09-08T21:00:00Z')
    const series = buildHourlySeries({
      locationId: 'loc-1',
      deterministic: runs([
        model('gfs_seamless', [det({ valid_at: t1, temp_c: 30 }), det({ valid_at: t2, temp_c: 31 })]),
        // Reaches only the first hour; the second is padding.
        model('ncep_hrrr_conus', [det({ valid_at: t1, temp_c: 29 }), det({ valid_at: t2 })], null),
      ]),
      ensemble: ensRuns([]),
      allModels: true,
      now,
      scoring: null,
    })

    expect(series.model).toBe('gfs_seamless')
    expect(series.models).toHaveLength(2)

    const hrrr = series.models?.find((m) => m.model === 'ncep_hrrr_conus')
    expect(hrrr?.hours_with_data).toBe(1)
    // Same axis length as the joined series, so a client can index across models.
    expect(hrrr?.hours).toHaveLength(series.hours.length)
    expect(hrrr?.hours[1]?.temp_c).toBeNull()
    // Null survives as null: this run predates the flag and cannot claim the column.
    expect(hrrr?.probability_is_shared).toBeNull()
  })

  it('falls back to the ensemble offset when no deterministic run was stored', () => {
    // `deterministic.utc_offset_seconds` defaults to 0 when there are no rows. Bucketing a
    // Las Vegas evening by UTC puts it on tomorrow — issue #33's failure mode.
    const at = new Date('2026-09-09T03:00:00Z') // 20:00 local on the 8th
    const series = buildHourlySeries({
      locationId: 'loc-1',
      deterministic: { models: [], unavailable_models: [], utc_offset_seconds: 0, fetched_at: null },
      ensemble: ensRuns([ens({ valid_at: at, temp_c_p50: 24 })]),
      allModels: false,
      now,
      scoring: null,
    })
    expect(series.utc_offset_seconds).toBe(PDT)
    expect(series.hours[0]?.local_date).toBe('2026-09-08')
  })

  it('derives precip_chance_pct from the members, and withholds it when unknown', () => {
    const t1 = new Date('2026-09-08T20:00:00Z')
    const t2 = new Date('2026-09-08T21:00:00Z')
    const series = buildHourlySeries({
      locationId: 'loc-1',
      deterministic: runs([]),
      ensemble: ensRuns([
        ens({ valid_at: t1, members_wet: 86, member_count: 143 }),
        ens({ valid_at: t2, members_wet: null, member_count: 143 }),
      ]),
      allModels: false,
      now,
      scoring: null,
    })
    expect(series.hours[0]?.precip_chance_pct).toBe(60)
    expect(series.hours[0]?.member_count).toBe(143)
    expect(series.hours[1]?.precip_chance_pct).toBeNull()
  })

  it('reports the older of the two runs as fetched_at', () => {
    // The two runs are cached and refetched independently, so they can be an hour apart.
    // A surface printing "fetched N min ago" is making a claim about what the reader is
    // looking at, and the staler half bounds it. Preferring the deterministic run — what
    // this did until 2026-09-15 — let a chart drawn entirely from ensemble columns report
    // the age of a run it does not draw. The fixture puts the deterministic run *newer*,
    // which is the ordering the old code got wrong.
    const at = new Date('2026-09-08T20:00:00Z')
    const series = buildHourlySeries({
      locationId: 'loc-1',
      deterministic: runs([model('gfs_seamless', [det({ valid_at: at, temp_c: 20 })])], new Date('2026-09-08T19:00:00Z')),
      ensemble: ensRuns([ens({ valid_at: at, temp_c_p50: 21 })], new Date('2026-09-08T18:00:00Z')),
      allModels: false,
      now,
      scoring: null,
    })
    expect(series.fetched_at).toBe('2026-09-08T18:00:00.000Z')
  })

  it('takes whichever run carried a timestamp when the other did not', () => {
    const at = new Date('2026-09-08T20:00:00Z')
    const series = buildHourlySeries({
      locationId: 'loc-1',
      deterministic: runs([model('gfs_seamless', [det({ valid_at: at, temp_c: 20 })])], null),
      ensemble: ensRuns([ens({ valid_at: at, temp_c_p50: 21 })], new Date('2026-09-08T18:00:00Z')),
      allModels: false,
      now,
      scoring: null,
    })
    expect(series.fetched_at).toBe('2026-09-08T18:00:00.000Z')
  })
})

describe('buildHourlySeries — offset selection', () => {
  const now = new Date('2026-09-08T18:00:00Z')

  it('keeps a genuine UTC offset of 0 rather than falling through to the ensemble', () => {
    // Iceland, Ghana, Britain in winter. A `||` on the offset treats a real 0 as "absent"
    // and silently adopts the ensemble's — the same class of defect as a null rendering
    // as a value. Constrains the `models.length > 0` check, not the truthiness of 0.
    const at = new Date('2026-09-08T20:00:00Z')
    const series = buildHourlySeries({
      locationId: 'loc-utc',
      deterministic: {
        models: [model('gfs_seamless', [det({ valid_at: at, temp_c: 11 })])],
        unavailable_models: [],
        utc_offset_seconds: 0,
        fetched_at: null,
      },
      ensemble: { hours: [], utc_offset_seconds: 3600, fetched_at: null },
      allModels: false,
      now,
      scoring: null,
    })
    expect(series.utc_offset_seconds).toBe(0)
  })
})

describe('buildHourlySeries — a recorded wall never replaces the crag score', () => {
  /**
   * Owner decision 2026-09-24: a location's readings are Crag A's, whatever
   * aspect and angle it records. Wall A scores individual walls and nothing
   * else. If a recorded wall reached the readings, a north wall would read
   * cooler at noon than the horizontal series and this would fail.
   */
  const now = new Date('2026-09-08T18:00:00Z')
  const hours: RunHour[] = []
  for (let i = -120; i <= 48; i++) {
    const at = new Date(now.getTime() + i * HOUR_MS)
    const utc = at.getUTCHours()
    hours.push(
      det({
        valid_at: at,
        temp_c: 30,
        dewpoint_c: 5,
        humidity_pct: 20,
        precip_mm: 0,
        wind_kmh: 5,
        cloud_pct: 0,
        // Daylight at Las Vegas in September is roughly 13Z-02Z.
        shortwave_wm2: utc >= 14 || utc <= 1 ? 800 : 0,
      }),
    )
  }
  const build = (wall: { lat: number; lon: number; aspectDeg: number; cliffAngleDeg: number } | null) =>
    buildHourlySeries({
      locationId: 'loc-1',
      deterministic: runs([model('gfs_seamless', hours)]),
      ensemble: ensRuns([]),
      allModels: false,
      now,
      scoring: { rockType: 'granite', lat: 36.13, lon: -115.43, cliffAngleDeg: 0, wall },
    })
  const noon = (s: ReturnType<typeof build>) =>
    s.readings?.hours.find((h) => h.valid_at === '2026-09-08T20:00:00.000Z')

  it('produces identical readings with and without a recorded wall', () => {
    const without = build(null)
    const withWall = build({ lat: 36.13, lon: -115.43, aspectDeg: 0, cliffAngleDeg: -30 })
    expect(noon(without)?.score).not.toBeNull()
    expect(withWall.readings).toEqual(without.readings)
  })

  it('qualifies both readings: Crag A reads every direction by design', () => {
    const h = noon(build(null))
    expect(h?.rock?.qualified).toBe(true)
    expect(h?.friction?.qualified).toBe(true)
  })
})
