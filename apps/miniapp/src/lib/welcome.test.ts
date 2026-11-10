import { describe, expect, it } from 'vitest'
import { DEFAULT_PREFERENCES, SETUP_VERSION, fToC, type Preferences, type SetupPreviewDay } from '@weatherteam6/types'
import { DEFAULT_DRAFT } from './preferencesForm.js'
import {
  SCORE_LEGEND,
  TEMP_TRACK_F,
  WELCOME_SKIP,
  dayLine,
  dayReason,
  previewParams,
  setHighF,
  setHour,
  setLowF,
  shouldShowWelcome,
  versusDefault,
  weekday,
  welcomeSave,
} from './welcome.js'

const hours = (tempF: (h: number) => number | null, rain: (h: number) => number = () => 0) =>
  Array.from({ length: 24 }, (_, hour) => {
    const f = tempF(hour)
    return { hour, score: 100, air_temp_c: f === null ? null : fToC(f), precip_mm: rain(hour) }
  })

const day = (over: Partial<SetupPreviewDay>): SetupPreviewDay => ({
  date: '2026-10-01',
  score: 50,
  default_score: 50,
  held_back_by: [],
  hours: hours(() => 45),
  ...over,
})

describe('shouldShowWelcome', () => {
  it('shows for an account that never finished or skipped it', () => {
    expect(shouldShowWelcome({ ...DEFAULT_PREFERENCES, setup_version: null })).toBe(true)
  })

  it('does not show once the current version is saved', () => {
    expect(shouldShowWelcome({ ...DEFAULT_PREFERENCES, setup_version: SETUP_VERSION })).toBe(false)
  })

  it('does not show before preferences load, or on an older API that sends no field', () => {
    expect(shouldShowWelcome(undefined)).toBe(false)
    const { setup_version: _omitted, ...older } = DEFAULT_PREFERENCES
    expect(shouldShowWelcome(older as Preferences)).toBe(false)
  })
})

describe('welcomeSave and WELCOME_SKIP', () => {
  it('Save sends what changed, as Profile does, with the version', () => {
    expect(welcomeSave(DEFAULT_PREFERENCES, { ...DEFAULT_DRAFT, highF: 70, firstHour: 6 })).toEqual({
      temp_high_c: fToC(70),
      climb_first_hour: 6,
      setup_version: SETUP_VERSION,
    })
  })

  it('Save on the defaults still marks the screen done', () => {
    expect(welcomeSave(DEFAULT_PREFERENCES, DEFAULT_DRAFT)).toEqual({ setup_version: SETUP_VERSION })
  })

  it('Skip changes no setting', () => {
    expect(WELCOME_SKIP).toEqual({ setup_version: SETUP_VERSION })
  })
})

describe('previewParams', () => {
  it('sends the hours and the range in °C', () => {
    expect(previewParams({ ...DEFAULT_DRAFT, lowF: 20, highF: 70, firstHour: 6, lastHour: 20 })).toEqual({
      first: 6,
      last: 20,
      low_c: fToC(20),
      high_c: fToC(70),
    })
  })
})

describe('the sliders', () => {
  it('hold the range to its limits and the 10 °F gap', () => {
    expect(setLowF(DEFAULT_DRAFT, -20).lowF).toBe(0)
    expect(setLowF(DEFAULT_DRAFT, 58).lowF).toBe(50)
    expect(setLowF({ ...DEFAULT_DRAFT, highF: 45 }, 40).lowF).toBe(35)
    expect(setHighF(DEFAULT_DRAFT, 99).highF).toBe(85)
    expect(setHighF(DEFAULT_DRAFT, 32).highF).toBe(40)
  })

  it('the temperature track runs from the lowest low to the highest high', () => {
    expect(TEMP_TRACK_F).toEqual({ min: 0, max: 85 })
  })

  it('hold the hours inside the day and three hours apart', () => {
    expect(setHour(DEFAULT_DRAFT, 'first', 17)).toMatchObject({ firstHour: 16, lastHour: 18 })
    expect(setHour(DEFAULT_DRAFT, 'last', 9)).toMatchObject({ firstHour: 8, lastHour: 10 })
    expect(setHour(DEFAULT_DRAFT, 'first', 3)).toMatchObject({ firstHour: 3, lastHour: 18 })
  })
})

describe('SCORE_LEGEND', () => {
  it('rungs the chips on SCORE_BANDS, with a gap for no data', () => {
    expect(SCORE_LEGEND.map((c) => `${c.figure} ${c.note}`)).toEqual(['60 and up', '40 to 59', '0 to 39', '— no data'])
  })
})

describe('the example day', () => {
  it('names the weekday from the local date', () => {
    expect(weekday('2026-10-01')).toBe('Thu')
    expect(weekday('2026-10-05')).toBe('Mon')
  })

  it('compares with the default only when both are read and differ', () => {
    expect(versusDefault(day({ score: 75, default_score: 50 }))).toEqual({ arrow: '▲ 25', up: true })
    expect(versusDefault(day({ score: 40, default_score: 50 }))).toEqual({ arrow: '▼ 10', up: false })
    expect(versusDefault(day({ score: 50, default_score: 50 }))).toBeNull()
    expect(versusDefault(day({ score: null, default_score: 50 }))).toBeNull()
  })

  it('a withheld score prints a dash, never a number', () => {
    expect(dayLine(day({ score: null, default_score: 47 }))).toBe('Thu: 47 on the defaults, — with yours.')
    expect(dayLine(day({ score: 47, default_score: 47 }))).toBe('Thu scores 47 on the defaults. Move the sliders to see it change.')
  })
})

describe('dayReason', () => {
  it('reads the temperature inside the climbing hours only', () => {
    // 90 °F at 4 am, outside 8 am to 6 pm; 50 °F in the hours.
    const r = dayReason(day({ hours: hours((h) => (h === 4 ? 90 : 50)) }), DEFAULT_DRAFT)
    expect(r).toBe('Your hours stay at 50°F, inside your range.')
  })

  it('says how far past the top and the bottom of the range it goes', () => {
    expect(dayReason(day({ hours: hours((h) => 50 + h) }), DEFAULT_DRAFT)).toBe(
      'It reaches 68°F in your hours, above your 60°F.',
    )
    expect(dayReason(day({ hours: hours(() => 10) }), DEFAULT_DRAFT)).toBe(
      'Your hours never get above 10°F, below your 30°F.',
    )
    expect(dayReason(day({ hours: hours(() => 70) }), DEFAULT_DRAFT)).toBe(
      'Your hours never drop below 70°F, above your 60°F.',
    )
  })

  it('names the rain and when it stopped', () => {
    const wet = hours(
      () => 50,
      (h) => (h >= 2 && h <= 10 ? 0.3 : 0),
    )
    expect(dayReason(day({ hours: wet }), DEFAULT_DRAFT)).toMatch(/^0\.11 in of rain until 10 am, then the rock dries\./)
  })

  it('leaves out an hour with no temperature rather than read it as 32 °F, and drops the sentence when none has one', () => {
    expect(dayReason(day({ hours: hours((h) => (h === 12 ? null : 50)) }), DEFAULT_DRAFT)).toBe(
      'Your hours stay at 50°F, inside your range.',
    )
    expect(dayReason(day({ hours: hours(() => null) }), DEFAULT_DRAFT)).toBe('')
  })
})
