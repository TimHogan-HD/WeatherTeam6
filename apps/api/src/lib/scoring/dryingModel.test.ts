import { describe, it, expect } from 'vitest'
import {
  dryingModel,
  rainfallEventsThrough,
  type DryingModelInput,
  type DryingModelOutput,
} from './dryingModel.js'

// Phase 4 contract test. These tests assert the output shape and invariants,
// not specific values, so they pass against the current stub and remain valid
// when Phase 4 replaces it with real logic.

describe('dryingModel (contract test)', () => {
  const baseInput: DryingModelInput = {
    rockType: 'sandstone',
    cliffAngle: 45,
    rainfallEvents: [],
    asOf: new Date('2025-06-01T12:00:00Z'),
  }

  it('returns an object with the correct shape', () => {
    const result: DryingModelOutput = dryingModel(baseInput)

    expect(typeof result.hours_since_significant_rain).toBe('number')
    expect(typeof result.last_rain_mm).toBe('number')
    expect(typeof result.estimated_dry).toBe('boolean')
    expect(['low', 'medium', 'high']).toContain(result.confidence)
  })

  // These ran against `baseInput`, whose `rainfallEvents` is empty — so they
  // exercised only the 720 sentinel branch and never touched the arithmetic that
  // can actually go negative. The invariant they claimed to check was false:
  // rain dated today ends at 23:59:59Z, in the future relative to `asOf`, and
  // produced about -14h, which the Mini App rendered as "no rain in -14h".
  it('hours_since_significant_rain is non-negative — including for rain dated today', () => {
    expect(dryingModel(baseInput).hours_since_significant_rain).toBeGreaterThanOrEqual(0)

    const rainedToday = dryingModel({
      ...baseInput,
      rainfallEvents: [{ date: '2025-06-01', precip_mm: 15 }],
      asOf: new Date('2025-06-01T10:00:00Z'),
    })
    expect(rainedToday.hours_since_significant_rain).toBe(0)
    expect(rainedToday.last_rain_mm).toBe(15)
    expect(rainedToday.estimated_dry).toBe(false)
    expect(rainedToday.confidence).toBe('low')
  })

  it('last_rain_mm is non-negative', () => {
    const result = dryingModel(baseInput)
    expect(result.last_rain_mm).toBeGreaterThanOrEqual(0)
  })

  it('accepts all valid rock types without throwing', () => {
    const rockTypes: DryingModelInput['rockType'][] = [
      'sandstone',
      'limestone',
      'granite',
      'basalt',
      'unknown',
    ]
    for (const rockType of rockTypes) {
      expect(() => dryingModel({ ...baseInput, rockType })).not.toThrow()
    }
  })

  it('accepts rainfall events without throwing', () => {
    const inputWithRain: DryingModelInput = {
      ...baseInput,
      rainfallEvents: [
        { date: '2025-05-30', precip_mm: 15.2 },
        { date: '2025-05-31', precip_mm: 3.1 },
      ],
    }
    const result: DryingModelOutput = dryingModel(inputWithRain)
    expect(typeof result.hours_since_significant_rain).toBe('number')
  })
})

describe('dryingModel (behavior)', () => {
  // Rainfall date 2025-05-31 ends at 23:59:59Z. With asOf at 2025-06-01T05:00:00Z,
  // hoursSince = 5h 1s ≈ 5h.
  const asOfFiveHoursAfter = new Date('2025-06-01T05:00:00Z')

  it('granite, rain 5h ago, cliff_angle=0 → not dry, medium confidence', () => {
    const result = dryingModel({
      rockType: 'granite',
      cliffAngle: 0,
      rainfallEvents: [{ date: '2025-05-31', precip_mm: 8 }],
      asOf: asOfFiveHoursAfter,
    })
    expect(result.estimated_dry).toBe(false)
    expect(result.confidence).toBe('medium') // granite minDry=1h, maxDry=6h; 5h is between
    expect(result.hours_since_significant_rain).toBeCloseTo(5, 0)
    expect(result.last_rain_mm).toBe(8)
  })

  it('sandstone (kind not recorded), rain 125h ago, cliff_angle=0 → dry, high confidence', () => {
    // Unrecorded sandstone takes sandstone_soft's 120h ceiling. asOf is 125h
    // after 2025-05-28T23:59:59Z.
    const asOf = new Date('2025-06-03T04:59:59Z')
    const result = dryingModel({
      rockType: 'sandstone',
      cliffAngle: 0,
      rainfallEvents: [{ date: '2025-05-28', precip_mm: 12 }],
      asOf,
    })
    expect(result.estimated_dry).toBe(true)
    expect(result.confidence).toBe('high')
    expect(result.hours_since_significant_rain).toBeCloseTo(125, 0)
  })

  it('no rainfall events at all → dry, high confidence, sentinel hours', () => {
    const result = dryingModel({
      rockType: 'granite',
      cliffAngle: 30,
      rainfallEvents: [],
      asOf: asOfFiveHoursAfter,
    })
    expect(result.estimated_dry).toBe(true)
    expect(result.hours_since_significant_rain).toBe(720)
    expect(result.last_rain_mm).toBe(0)
    expect(result.confidence).toBe('high')
  })

  it('all events below 2mm threshold → treated as no rain', () => {
    const result = dryingModel({
      rockType: 'granite',
      cliffAngle: 0,
      rainfallEvents: [
        { date: '2025-05-31', precip_mm: 0.5 },
        { date: '2025-05-30', precip_mm: 1.8 },
      ],
      asOf: asOfFiveHoursAfter,
    })
    expect(result.estimated_dry).toBe(true)
    expect(result.hours_since_significant_rain).toBe(720)
    expect(result.last_rain_mm).toBe(0)
    expect(result.confidence).toBe('high')
  })

  it('cliff_angle modifier: at 13h elapsed, angle=0 → high, angle=90 → medium', () => {
    // weathered granite maxDry=12h; at angle=0, factor=1.0, so 13h > 12h → high confidence (dry)
    // at angle=90, factor=1.3, so maxDry=15.6h → 13h < 15.6h → medium confidence (not dry)
    const asOf = new Date('2025-06-01T12:59:59Z') // 13h after 2025-05-31T23:59:59Z
    const events = [{ date: '2025-05-31', precip_mm: 8 }]

    const vertical = dryingModel({
      rockType: 'granite_weathered',
      cliffAngle: 0,
      rainfallEvents: events,
      asOf,
    })
    expect(vertical.estimated_dry).toBe(true)
    expect(vertical.confidence).toBe('high')

    const slab = dryingModel({
      rockType: 'granite_weathered',
      cliffAngle: 90,
      rainfallEvents: events,
      asOf,
    })
    expect(slab.estimated_dry).toBe(false)
    expect(slab.confidence).toBe('medium')
  })

  it('picks the most recent significant event when multiple are present', () => {
    const asOf = new Date('2025-06-01T05:00:00Z')
    const result = dryingModel({
      rockType: 'granite',
      cliffAngle: 0,
      rainfallEvents: [
        { date: '2025-05-25', precip_mm: 50 }, // older heavier event
        { date: '2025-05-31', precip_mm: 4 }, // recent smaller event
      ],
      asOf,
    })
    expect(result.last_rain_mm).toBe(4)
    expect(result.hours_since_significant_rain).toBeCloseTo(5, 0)
  })

  it('picks the most recent event even when the list is not in date order', () => {
    // The case above lists events oldest-first, so "take the latest" and "take
    // the last one in the array" give the same answer and the date comparison
    // is asserted by nothing — replace it with `true` and every test stays
    // green. Real input has no ordering guarantee: ACIS and the Open-Meteo
    // archive are separate sources and neither promises one. Reversed here, the
    // unguarded version reports the older, heavier event and a wall that rained
    // yesterday reads as seven days dry. Found by mutation testing.
    const asOf = new Date('2025-06-01T05:00:00Z')
    const result = dryingModel({
      rockType: 'granite',
      cliffAngle: 0,
      rainfallEvents: [
        { date: '2025-05-31', precip_mm: 4 }, // recent, listed first
        { date: '2025-05-25', precip_mm: 50 }, // older and heavier, listed last
      ],
      asOf,
    })
    expect(result.last_rain_mm).toBe(4)
    expect(result.hours_since_significant_rain).toBeCloseTo(5, 0)
  })

  it('treats exactly 2mm as not significant — the threshold is strict', () => {
    // The "below threshold" case uses values well under 2mm, so the boundary
    // itself is untested and `>` can become `>=` unnoticed.
    const result = dryingModel({
      rockType: 'granite',
      cliffAngle: 0,
      rainfallEvents: [{ date: '2025-05-31', precip_mm: 2 }],
      asOf: new Date('2025-06-01T05:00:00Z'),
    })
    expect(result.last_rain_mm).toBe(0)
    expect(result.hours_since_significant_rain).toBe(720)
  })
})

describe('dryingModel — the basalt split', () => {
  /**
   * The drying window is what the split exists to change, and `estimated_dry` is
   * where it becomes observable. 24h after 10mm on a vertical wall sits between
   * dense basalt's 8h ceiling and the 48h the other two carry, so one input
   * separates all three rows — an assertion on `MAX_HOURS` itself would only
   * prove the table agrees with itself.
   */
  function dryAfter24h(rockType: DryingModelInput['rockType']): boolean {
    return dryingModel({
      rockType,
      cliffAngle: 0,
      rainfallEvents: [{ date: '2025-05-31', precip_mm: 10 }],
      asOf: new Date('2025-06-01T23:59:59Z'),
    }).estimated_dry
  }

  it('dense basalt is dry at 24h where vesicular is not', () => {
    expect(dryAfter24h('basalt_dense')).toBe(true)
    expect(dryAfter24h('basalt_vesicular')).toBe(false)
  })

  /**
   * **The regression guard, and the reason `basalt` was kept rather than
   * migrated.** Every row in production holds `basalt`, so if this changes, real
   * saved locations silently moved. It must track vesicular, not sit between the
   * two: an unrecorded kind is not an average.
   */
  it('unspecified basalt is unchanged, and matches vesicular rather than splitting the difference', () => {
    expect(dryAfter24h('basalt')).toBe(false)
    expect(dryAfter24h('basalt')).toBe(dryAfter24h('basalt_vesicular'))
  })

  /**
   * **Fresh granite now dries before dense basalt, and the order flipped on
   * purpose.** The basalt split put dense basalt at 8h against granite's 12h,
   * following porosity (0.1-1.0% against 0.5-1.5%), and recorded that granite's
   * constant "was not re-examined". `rock-drying-research.md` §7 re-examined it
   * and put fresh granite at 6h; weathered, grussy granite is its own 12h row.
   *
   * Pinned because the ordering has now changed twice and is still not obvious:
   * neither number is a measured drying time.
   */
  it('fresh granite dries within 6h and dense basalt within 8h (§7)', () => {
    function dryAt(rockType: DryingModelInput['rockType'], asOf: string): boolean {
      return dryingModel({
        rockType,
        cliffAngle: 0,
        rainfallEvents: [{ date: '2025-05-31', precip_mm: 10 }],
        asOf: new Date(asOf),
      }).estimated_dry
    }
    // Rain ends 2025-05-31T23:59:59Z. +7h is 06:59:59Z on 06-01 — past
    // granite's 6h ceiling and short of dense basalt's 8h.
    expect(dryAt('granite', '2025-06-01T06:59:59Z')).toBe(true)
    expect(dryAt('basalt_dense', '2025-06-01T06:59:59Z')).toBe(false)
    // +9h: past both. +5h: short of both.
    expect(dryAt('basalt_dense', '2025-06-01T08:59:59Z')).toBe(true)
    expect(dryAt('granite', '2025-06-01T04:59:59Z')).toBe(false)
  })
})

describe('rainfallEventsThrough — the rain one forecast day is entitled to see (issue #108)'
, () => {
  const TODAY = '2026-09-16'
  const history = [
    { date: '2026-09-10', precip_mm: 8 },
    { date: '2026-09-16', precip_mm: 3 }, // today, as measured so far
  ]
  const forecast = [
    { date: '2026-09-16', precip_mm: 11 }, // today, as the ensemble expects it
    { date: '2026-09-17', precip_mm: 0 },
    { date: '2026-09-18', precip_mm: 6 },
    { date: '2026-09-19', precip_mm: 0 },
  ]

  it('gives today the measured figure and never the forecast one', () => {
    // Both sources carry today. Taking both would double-count it, and which
    // one won would come down to array order — so today resolves to history,
    // 3mm, and the 11mm forecast for the same date is not in the list at all.
    const events = rainfallEventsThrough(history, forecast, TODAY, TODAY)
    expect(events).toEqual(history)
    expect(events.some((e) => e.precip_mm === 11)).toBe(false)
  })

  it('is exactly the history when the day asked about is today', () => {
    // The property that made #108 safe to ship: today’s drying input does not
    // move, whatever the forecast says. Asserted against the input array itself,
    // not against a recomputation of what the function does.
    expect(rainfallEventsThrough(history, forecast, TODAY, TODAY)).toEqual(history)
  })

  it('adds forecast rain up to the day asked about, and nothing after it', () => {
    const events = rainfallEventsThrough(history, forecast, TODAY, '2026-09-18')
    expect(events.map((e) => e.date)).toEqual([
      '2026-09-10',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
    ])
    // 09-19 is in the forecast and must NOT appear: at 09-18 it has not
    // happened. `dryingModel` takes the LATEST event, so including it would
    // reset the clock from rain that is still two days away and hand 09-18 a
    // drying score of 0.
    expect(events.some((e) => e.date === '2026-09-19')).toBe(false)
  })

  it('drops historical rain that falls after the day asked about', () => {
    // No caller reaches this today — `fetchEnsemble` requests no past days, so
    // `asOfDate` is never earlier than the archive’s last entry. Asserted so the
    // function means what its name says for any date, not just the ones one
    // caller happens to pass.
    const events = rainfallEventsThrough(history, forecast, TODAY, '2026-09-12')
    expect(events).toEqual([{ date: '2026-09-10', precip_mm: 8 }])
  })

  it('a dry history and a dry forecast stay empty, so the sentinel survives', () => {
    // `dryingModel` answers the 720-hour sentinel for an empty list. If this
    // function invented a zero-mm event, that sentinel would become a real
    // measurement nobody took — defect class 1.
    expect(rainfallEventsThrough([], [], TODAY, '2026-09-20')).toEqual([])
    expect(dryingModel({
      rockType: 'sandstone',
      cliffAngle: 45,
      rainfallEvents: rainfallEventsThrough([], [], TODAY, '2026-09-20'),
      asOf: new Date('2026-09-20T12:00:00Z'),
    }).hours_since_significant_rain).toBe(720)
  })
})
