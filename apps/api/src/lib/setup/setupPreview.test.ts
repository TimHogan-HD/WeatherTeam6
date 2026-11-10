import { describe, expect, it } from 'vitest'
import { CLIMB_HOURS_DEFAULT, TEMP_RANGE_DEFAULT_F, fToC, type SetupPreview } from '@weatherteam6/types'
import { buildSetupPreview, parsePreviewQuery, type PreviewDraft } from './setupPreview.js'

const DEFAULTS: PreviewDraft = {
  climbHours: { ...CLIMB_HOURS_DEFAULT },
  range: { lowC: fToC(TEMP_RANGE_DEFAULT_F.low), highC: fToC(TEMP_RANGE_DEFAULT_F.high) },
}

const draft = (over: { first?: number; last?: number; lowF?: number; highF?: number }): PreviewDraft => ({
  climbHours: { first: over.first ?? CLIMB_HOURS_DEFAULT.first, last: over.last ?? CLIMB_HOURS_DEFAULT.last },
  range: {
    lowC: fToC(over.lowF ?? TEMP_RANGE_DEFAULT_F.low),
    highC: fToC(over.highF ?? TEMP_RANGE_DEFAULT_F.high),
  },
})

const scores = (p: SetupPreview) => p.days.map((d) => d.score)
const THU = 0
const FRI = 1
const SAT = 2
const SUN = 3
const MON = 4

describe('buildSetupPreview: the example week', () => {
  const base = buildSetupPreview(DEFAULTS)

  it('is five local days, Thu 1 Oct to Mon 5 Oct, each all 24 hours in order', () => {
    expect(base.crag_name).toBe('Red Wing')
    expect(base.days.map((d) => d.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05'])
    for (const d of base.days) expect(d.hours.map((h) => h.hour)).toEqual(Array.from({ length: 24 }, (_, i) => i))
  })

  it('on the defaults, the draft and default scores are the same number', () => {
    for (const d of base.days) expect(d.score).toBe(d.default_score)
  })

  // Each day is in the week for one slider; these hold it to that job.
  it('on the defaults: Thu held back by cold, Fri full marks, Sat and Sun by heat, Mon by wet rock', () => {
    const [thu, fri, sat, sun, mon] = base.days
    expect(thu!.score).toBeLessThan(60)
    expect(thu!.held_back_by?.[0]).toBe('cold')
    expect(fri!.score).toBe(100)
    expect(fri!.held_back_by).toEqual([])
    expect(sat!.score).toBeLessThan(90)
    expect(sat!.held_back_by?.[0]).toBe('heat')
    expect(sun!.score).toBeLessThan(60)
    expect(sun!.held_back_by?.[0]).toBe('heat')
    expect(mon!.score).toBeLessThan(90)
    expect(mon!.held_back_by?.[0]).toBe('wet_rock')
  })

  it('lowering the bottom of the range lifts Thursday and only Thursday', () => {
    const p = buildSetupPreview(draft({ lowF: 0 }))
    expect(p.days[THU]!.score!).toBeGreaterThan(base.days[THU]!.score! + 20)
    for (const i of [FRI, SAT, SUN, MON]) expect(p.days[i]!.score).toBe(base.days[i]!.score)
  })

  it('raising the top of the range lifts Saturday', () => {
    const p = buildSetupPreview(draft({ highF: 80 }))
    expect(p.days[SAT]!.score!).toBeGreaterThan(base.days[SAT]!.score! + 20)
    expect(p.days[THU]!.score).toBe(base.days[THU]!.score)
  })

  it('an earlier start lifts Sunday, the hot day', () => {
    const p = buildSetupPreview(draft({ first: 5 }))
    expect(p.days[SUN]!.score!).toBeGreaterThan(base.days[SUN]!.score! + 10)
  })

  it('a later finish lifts Monday, which dries into the evening', () => {
    const p = buildSetupPreview(draft({ last: 23 }))
    expect(p.days[MON]!.score!).toBeGreaterThan(base.days[MON]!.score! + 20)
  })

  it('the default score never moves with the draft', () => {
    const p = buildSetupPreview(draft({ first: 5, last: 23, lowF: 0, highF: 85 }))
    expect(p.days.map((d) => d.default_score)).toEqual(scores(base))
  })

  it('hours carry the rain that makes Monday wet, and none on the dry days', () => {
    expect(base.days[MON]!.hours.some((h) => (h.precip_mm ?? 0) > 0)).toBe(true)
    for (const i of [THU, FRI, SAT, SUN]) expect(base.days[i]!.hours.every((h) => h.precip_mm === 0)).toBe(true)
  })
})

describe('parsePreviewQuery', () => {
  it('an empty query is the defaults', () => {
    expect(parsePreviewQuery({})).toEqual({ ok: true, draft: DEFAULTS })
  })

  it('reads hours and °C ends from strings', () => {
    const r = parsePreviewQuery({ first: '6', last: '20', low_c: String(fToC(20)), high_c: String(fToC(70)) })
    expect(r).toEqual({ ok: true, draft: { climbHours: { first: 6, last: 20 }, range: { lowC: fToC(20), highC: fToC(70) } } })
  })

  it('an end left out is the default, as a save would read it', () => {
    const r = parsePreviewQuery({ high_c: String(fToC(70)) })
    expect(r.ok && r.draft.range.lowC).toBe(fToC(TEMP_RANGE_DEFAULT_F.low))
  })

  it('400 for a malformed, blank, repeated, out-of-limit or unknown parameter', () => {
    for (const q of [
      { first: 'abc' },
      { first: '' },
      { first: '7.5' },
      { first: ['6', '7'] },
      { low_c: String(fToC(-5)) },
      { last: '24' },
      { tab: 'daily' },
    ]) {
      expect(parsePreviewQuery(q)).toMatchObject({ ok: false, status: 400 })
    }
  })

  it('409 for a range or window narrower than a save allows', () => {
    expect(parsePreviewQuery({ low_c: String(fToC(45)), high_c: String(fToC(50)) })).toMatchObject({ ok: false, status: 409 })
    expect(parsePreviewQuery({ first: '10', last: '11' })).toMatchObject({ ok: false, status: 409 })
  })
})
