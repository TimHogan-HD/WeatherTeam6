import { describe, it, expect } from 'vitest'
import {
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_OBSERVED_MAX_AGE_DAYS,
  FEEDBACK_PLACE_TEXT_MAX,
  FEEDBACK_SPAN_MAX_HOURS,
} from '@weatherteam6/types'
import { parseAppReadings, parseFeedbackInput } from './parseFeedback.js'
import { toFeedback } from './feedbackRow.js'

const NOW = Date.parse('2026-09-29T18:00:00.000Z')
const LOC = '11111111-1111-4111-8111-111111111111'
const AREA = '33333333-3333-5333-8333-333333333333'

const SNAPSHOT = {
  valid_at: '2026-09-29T18:00:00.000Z',
  model: 'gfs_seamless',
  fields: [
    { label: 'Dryness', value: 'Dry' },
    { label: 'Friction', value: 'Good' },
  ],
}

const CHECK = {
  kind: 'forecast',
  location_id: LOC,
  observed_at: '2026-09-29T17:30:00.000Z',
  observed_conditions: 'damp',
  verdict: 'missed',
  message: '  Seeping on the left side  ',
  app_readings: SNAPSHOT,
}

function error(result: ReturnType<typeof parseFeedbackInput>): string | null {
  return 'error' in result ? result.error : null
}

describe('parseFeedbackInput — app feedback', () => {
  it('accepts a message and trims it', () => {
    expect(parseFeedbackInput({ kind: 'app', message: '  Back button lost my tab ' }, NOW)).toEqual({
      kind: 'app',
      message: 'Back button lost my tab',
      location_id: null,
    })
  })

  it('keeps an optional location', () => {
    const r = parseFeedbackInput({ kind: 'app', message: 'x', location_id: LOC }, NOW)
    expect(r).toMatchObject({ location_id: LOC })
  })

  it('refuses a blank message — whitespace is not feedback', () => {
    expect(error(parseFeedbackInput({ kind: 'app', message: '   ' }, NOW))).toBe('message is required')
    expect(error(parseFeedbackInput({ kind: 'app' }, NOW))).toBe('message is required')
  })

  it('refuses a message over the limit and accepts one at it', () => {
    const at = 'a'.repeat(FEEDBACK_MESSAGE_MAX)
    expect(error(parseFeedbackInput({ kind: 'app', message: at }, NOW))).toBeNull()
    expect(error(parseFeedbackInput({ kind: 'app', message: `${at}a` }, NOW))).toMatch(/longer than/)
  })

  it('refuses a forecast-only field rather than dropping it', () => {
    const r = parseFeedbackInput({ kind: 'app', message: 'x', verdict: 'matched' }, NOW)
    expect(error(r)).toMatch(/Unsupported field\(s\) for app feedback: verdict/)
  })

  it('refuses a malformed location id', () => {
    expect(error(parseFeedbackInput({ kind: 'app', message: 'x', location_id: 'abc' }, NOW))).toMatch(/location_id/)
  })
})

describe('parseFeedbackInput — forecast checks', () => {
  it('accepts a complete check and keeps the snapshot', () => {
    const r = parseFeedbackInput(CHECK, NOW)
    expect(r).toEqual({
      kind: 'forecast',
      location_id: LOC,
      observed_at: new Date('2026-09-29T17:30:00.000Z'),
      observed_conditions: 'damp',
      verdict: 'missed',
      message: 'Seeping on the left side',
      app_readings: SNAPSHOT,
      area_id: null,
      area_name: null,
      wall: null,
      observed_until: null,
      sun_exposure: null,
    })
  })

  it('keeps where, until when and how much sun, trimmed', () => {
    const r = parseFeedbackInput(
      {
        ...CHECK,
        observed_at: '2026-09-29T14:00:00.000Z',
        area_id: AREA,
        area_name: ' Cyclops Area ',
        wall: '  left arete ',
        observed_until: '2026-09-29T17:45:00.000Z',
        sun_exposure: 'mostly_shade',
      },
      NOW,
    )
    expect(r).toMatchObject({
      area_id: AREA,
      area_name: 'Cyclops Area',
      wall: 'left arete',
      observed_until: new Date('2026-09-29T17:45:00.000Z'),
      sun_exposure: 'mostly_shade',
    })
  })

  it('reads a blank area or wall as not said, and refuses one over the limit', () => {
    expect(parseFeedbackInput({ ...CHECK, area_name: '   ', wall: '' }, NOW)).toMatchObject({ area_name: null, wall: null })
    const long = 'x'.repeat(FEEDBACK_PLACE_TEXT_MAX + 1)
    expect(error(parseFeedbackInput({ ...CHECK, wall: long }, NOW))).toMatch(/wall is longer/)
    expect(error(parseFeedbackInput({ ...CHECK, wall: 'x'.repeat(FEEDBACK_PLACE_TEXT_MAX) }, NOW))).toBeNull()
  })

  it('refuses an area id with no name, and one that is not an id', () => {
    expect(error(parseFeedbackInput({ ...CHECK, area_id: AREA }, NOW))).toMatch(/area_name is required/)
    expect(error(parseFeedbackInput({ ...CHECK, area_id: 'cyclops', area_name: 'Cyclops' }, NOW))).toMatch(/area_id/)
  })

  it('refuses an end time before the start, in the future, or past a day of climbing', () => {
    const at = (iso: string) => error(parseFeedbackInput({ ...CHECK, observed_until: iso }, NOW))
    // CHECK starts at 17:30Z; NOW is 18:00Z.
    expect(at('2026-09-29T17:30:00.000Z')).toBeNull()
    expect(at('2026-09-29T17:29:00.000Z')).toBe('observed_until is before observed_at')
    expect(at('2026-09-29T18:06:00.000Z')).toBe('observed_until is in the future')
    expect(at('2026-09-29T17:45')).toMatch(/UTC offset/)
    const early = { ...CHECK, observed_at: '2026-09-29T01:00:00.000Z' }
    const span = (h: number) => new Date(Date.parse(early.observed_at) + h * 3600_000 + 60_000).toISOString()
    expect(error(parseFeedbackInput({ ...early, observed_until: span(FEEDBACK_SPAN_MAX_HOURS) }, NOW))).toMatch(/hours after/)
    expect(error(parseFeedbackInput({ ...early, observed_until: span(FEEDBACK_SPAN_MAX_HOURS - 1) }, NOW))).toBeNull()
  })

  it('refuses a sun amount outside the list', () => {
    expect(error(parseFeedbackInput({ ...CHECK, sun_exposure: 'sunny' }, NOW))).toMatch(/sun_exposure/)
    expect(parseFeedbackInput({ ...CHECK, sun_exposure: null }, NOW)).toMatchObject({ sun_exposure: null })
  })

  it('refuses the new fields on app feedback rather than dropping them', () => {
    expect(error(parseFeedbackInput({ kind: 'app', message: 'hi', wall: 'x' }, NOW))).toMatch(/wall/)
  })

  it('accepts app_readings: null — the app had nothing for that hour', () => {
    expect(parseFeedbackInput({ ...CHECK, app_readings: null }, NOW)).toMatchObject({ app_readings: null })
  })

  it('refuses a check that omits app_readings, which is not the same as null', () => {
    const { app_readings: _omit, ...rest } = CHECK
    expect(error(parseFeedbackInput(rest, NOW))).toMatch(/app_readings is required/)
  })

  it('requires a location', () => {
    expect(error(parseFeedbackInput({ ...CHECK, location_id: null }, NOW))).toMatch(/location_id is required/)
  })

  it('refuses an observed_at without an offset — it would be read as UTC', () => {
    expect(error(parseFeedbackInput({ ...CHECK, observed_at: '2026-09-29T10:30' }, NOW))).toMatch(/UTC offset/)
  })

  it('accepts an explicit offset', () => {
    const r = parseFeedbackInput({ ...CHECK, observed_at: '2026-09-29T10:30:00-07:00' }, NOW)
    expect(r).toMatchObject({ observed_at: new Date('2026-09-29T17:30:00.000Z') })
  })

  it('allows five minutes of clock skew into the future and not more', () => {
    const skew = new Date(NOW + 5 * 60_000).toISOString()
    const past = new Date(NOW + 6 * 60_000).toISOString()
    expect(error(parseFeedbackInput({ ...CHECK, observed_at: skew }, NOW))).toBeNull()
    expect(error(parseFeedbackInput({ ...CHECK, observed_at: past }, NOW))).toBe('observed_at is in the future')
  })

  it('refuses a check older than the limit and accepts one just inside it', () => {
    const day = 24 * 3600_000
    const inside = new Date(NOW - FEEDBACK_OBSERVED_MAX_AGE_DAYS * day + 60_000).toISOString()
    const outside = new Date(NOW - FEEDBACK_OBSERVED_MAX_AGE_DAYS * day - 60_000).toISOString()
    expect(error(parseFeedbackInput({ ...CHECK, observed_at: inside }, NOW))).toBeNull()
    expect(error(parseFeedbackInput({ ...CHECK, observed_at: outside }, NOW))).toMatch(/days ago/)
  })

  it('refuses a condition or verdict outside the lists', () => {
    expect(error(parseFeedbackInput({ ...CHECK, observed_conditions: 'moist' }, NOW))).toMatch(/observed_conditions/)
    expect(error(parseFeedbackInput({ ...CHECK, verdict: true }, NOW))).toMatch(/verdict/)
  })

  it('refuses an unknown key, naming it', () => {
    expect(error(parseFeedbackInput({ ...CHECK, notes: 'x' }, NOW))).toMatch(/notes/)
  })

  it('refuses a body that is not an object, and an unknown kind', () => {
    expect(error(parseFeedbackInput(null, NOW))).toMatch(/JSON object/)
    expect(error(parseFeedbackInput([], NOW))).toMatch(/JSON object/)
    expect(error(parseFeedbackInput({ kind: 'bug' }, NOW))).toMatch(/kind/)
  })
})

describe('parseAppReadings', () => {
  it('refuses an empty field list — a snapshot of nothing is null, not []', () => {
    expect(parseAppReadings({ ...SNAPSHOT, fields: [] })).toHaveProperty('error')
  })

  it('refuses a field that is not { label, value } text', () => {
    expect(parseAppReadings({ ...SNAPSHOT, fields: [{ label: 'Friction', value: 0.29 }] })).toHaveProperty('error')
    expect(parseAppReadings({ ...SNAPSHOT, fields: [{ label: '', value: 'Dry' }] })).toHaveProperty('error')
    expect(parseAppReadings({ ...SNAPSHOT, fields: ['Dry'] })).toHaveProperty('error')
  })

  it('refuses a missing model rather than reading it as null', () => {
    const { model: _omit, ...rest } = SNAPSHOT
    expect(parseAppReadings(rest)).toHaveProperty('error')
    expect(parseAppReadings({ ...SNAPSHOT, model: null })).toMatchObject({ model: null })
  })

  it('drops extra keys on a field rather than storing them', () => {
    const r = parseAppReadings({ ...SNAPSHOT, fields: [{ label: 'Friction', value: 'Good', factor: 0.29 }] })
    expect(r).toEqual({ ...SNAPSHOT, fields: [{ label: 'Friction', value: 'Good' }] })
  })

  it('refuses an unparseable valid_at', () => {
    expect(parseAppReadings({ ...SNAPSHOT, valid_at: 'yesterday' })).toHaveProperty('error')
  })
})

describe('toFeedback', () => {
  const row = {
    id: '22222222-2222-4222-8222-222222222222',
    user_id: '00000000-0000-0000-0000-000000000001',
    kind: 'forecast' as const,
    location_id: null,
    location_name: 'Red Rock',
    lat: 36.15,
    lon: -115.45,
    message: null,
    observed_at: new Date('2026-09-29T17:30:00.000Z'),
    observed_conditions: 'wet' as const,
    verdict: 'missed' as const,
    app_readings: SNAPSHOT as unknown,
    area_id: null,
    area_name: 'Cyclops Area',
    wall: null,
    observed_until: new Date('2026-09-29T19:00:00.000Z'),
    sun_exposure: 'full_sun' as const,
    created_at: new Date('2026-09-29T18:00:00.000Z'),
    resolved_at: null,
  }

  it('returns ISO instants and keeps the name of a detached location', () => {
    expect(toFeedback(row)).toEqual({
      id: row.id,
      kind: 'forecast',
      location_id: null,
      location_name: 'Red Rock',
      message: null,
      observed_at: '2026-09-29T17:30:00.000Z',
      observed_conditions: 'wet',
      verdict: 'missed',
      app_readings: SNAPSHOT,
      area_id: null,
      area_name: 'Cyclops Area',
      wall: null,
      observed_until: '2026-09-29T19:00:00.000Z',
      sun_exposure: 'full_sun',
      created_at: '2026-09-29T18:00:00.000Z',
    })
  })

  it('reads a stored snapshot that no longer parses as no snapshot', () => {
    expect(toFeedback({ ...row, app_readings: { garbage: true } }).app_readings).toBeNull()
  })

  it('does not return the owner or the coordinates', () => {
    const out = toFeedback(row) as Record<string, unknown>
    expect(out).not.toHaveProperty('user_id')
    expect(out).not.toHaveProperty('lat')
  })
})
