import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ForecastSnapshot } from '@weatherteam6/types'
import {
  buildAlertsPanel,
  buildConditionsPanel,
  buildListPanel,
  formatOutlook,
  weekdayLabel,
} from './panels.js'
import type { ConditionsReplyInput } from './conditionsMessage.js'

function snapshot(over: Partial<ForecastSnapshot> = {}): ForecastSnapshot {
  return {
    id: 'snap',
    location_id: 'loc',
    captured_at: '2026-08-31T12:00:00Z',
    forecast_date: '2026-08-31',
    precip_mm_p10: null,
    precip_mm_p50: null,
    precip_mm_p90: null,
    temp_c_min: null,
    temp_c_max: null,
    wind_kmh_max: null,
    humidity_pct: null,
    model_sources: null,
    created_at: '2026-08-31T12:00:00Z',
    ...over,
  }
}

function conditions(over: Partial<ConditionsReplyInput> = {}): ConditionsReplyInput {
  return {
    locationName: 'Red Rock',
    isClimbingLocation: true,
    asosStation: null,
    today: null,
    todayScore: null,
    scoreUnavailable: null,
    activeAlerts: [],
    snapshots: [],
    ...over,
  }
}

const STATE = 'a1b2c3d4'

describe('buildListPanel', () => {
  it('says the list is empty rather than showing bare navigation', () => {
    const panel = buildListPanel(STATE, [])
    expect(panel.text).toContain('no saved locations')
    // Only the nav row, and it drops the button for the view already showing.
    expect(panel.keyboard?.inline_keyboard).toHaveLength(1)
    expect(panel.keyboard?.inline_keyboard[0]).toHaveLength(2)
  })

  it('gives each location its own row and lists them all in the text', () => {
    const panel = buildListPanel(STATE, [
      { id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', name: 'Red Rock' },
      { id: '3f2504e0-4f89-41d3-9a0c-0305e82c3302', name: 'Indian Creek' },
    ])
    expect(panel.text).toContain('Red Rock')
    expect(panel.text).toContain('Indian Creek')
    // Two location rows plus the nav row.
    expect(panel.keyboard?.inline_keyboard).toHaveLength(3)
    expect(panel.keyboard?.inline_keyboard[0]).toHaveLength(1)
  })

  it('escapes the name in the text and leaves the button label alone', () => {
    // The two rules are opposites, and getting either backwards is visible to
    // the user: an unescaped `&` in HTML text is a 400 that costs the whole
    // message, and an escaped one on a button reads as a literal "&amp;".
    const panel = buildListPanel(STATE, [
      { id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', name: 'Bear & Cub' },
    ])
    expect(panel.text).toContain('Bear &amp; Cub')
    expect(panel.keyboard?.inline_keyboard[0]?.[0]).toMatchObject({ text: 'Bear & Cub' })
  })

  it('drops only the button when an id will not encode — never the location', () => {
    // 40 characters, past the value ceiling, so `encodeAction` returns null. A
    // missing button is a control the user can work around; a missing location
    // is the bot claiming they never saved it.
    const panel = buildListPanel(STATE, [{ id: 'x'.repeat(40), name: 'Unencodable' }])
    expect(panel.text).toContain('Unencodable')
    // The nav row survives on its own — the list panel drops its own
    // "Locations" button, so what is left starts with Alerts.
    expect(panel.keyboard?.inline_keyboard).toHaveLength(1)
    expect(panel.keyboard?.inline_keyboard[0]?.[0]).toMatchObject({ text: '⚠️ Alerts' })
  })
})

describe('weekdayLabel', () => {
  const originalTz = process.env['TZ']

  beforeAll(() => {
    // A negative-offset zone, because that is the only way this assertion can
    // fail: under UTC — which is what CI runs in — reading the date locally and
    // reading it as UTC give the same answer, and the bug hides.
    process.env['TZ'] = 'America/Los_Angeles'
  })

  afterAll(() => {
    process.env['TZ'] = originalTz
  })

  it('reads the local calendar day as UTC, not in the server’s zone', () => {
    // 2026-08-31 is a Monday. In Los Angeles the same instant is Sunday
    // afternoon, so a `getDay()` here would label the row Sun — the off-by-one
    // day that issue #33 fixed, reintroduced one layer up.
    expect(weekdayLabel('2026-08-31')).toBe('Mon')
    expect(weekdayLabel('2026-09-05')).toBe('Sat')
  })

  it('returns null for anything that is not a calendar day', () => {
    expect(weekdayLabel('2026-08-31T00:00:00Z')).toBeNull()
    expect(weekdayLabel('not-a-date')).toBeNull()
    expect(weekdayLabel('')).toBeNull()
  })
})

describe('formatOutlook', () => {
  it('renders a row with no readings as gaps, not as a mild sunny day', () => {
    // Every field here is null, which is the shipped shape of ForecastSnapshot.
    // `cToF(null)` is 32°F, `kmhToMph(null)` is 0 mph and `mmToIn(null)` is
    // 0.00 in — three numbers a user would believe.
    const out = String(formatOutlook([snapshot()]))
    expect(out).toContain('—')
    expect(out).not.toContain('32°F')
    expect(out).not.toContain('0 mph')
    expect(out).not.toContain('0.00 in')
  })

  it('labels the today row from the server flag', () => {
    const out = String(formatOutlook([snapshot({ is_today: true, temp_c_max: 37 })]))
    expect(out).toContain('Today')
    expect(out).toContain('99°F')
  })

  it('labels a row with no flag by weekday — a missing flag is unknown, not false', () => {
    const out = String(formatOutlook([snapshot({ forecast_date: '2026-08-31' })]))
    expect(out).not.toContain('Today')
    expect(out).toContain('Mon')
  })

  it('returns null for an empty feed rather than a header with no rows', () => {
    expect(formatOutlook([])).toBeNull()
  })
})

describe('buildConditionsPanel', () => {
  it('shows no outlook in simple mode, and offers the way in', () => {
    const panel = buildConditionsPanel({
      stateId: STATE,
      mode: 'simple',
      conditions: conditions({ snapshots: [snapshot({ is_today: true })] }),
    })
    expect(panel.text).not.toContain('Next days')
    expect(panel.keyboard?.inline_keyboard[0]?.[0]).toMatchObject({ text: '⚙ Advanced' })
  })

  it('adds the outlook in advanced mode, and offers the way back', () => {
    const panel = buildConditionsPanel({
      stateId: STATE,
      mode: 'advanced',
      conditions: conditions({ snapshots: [snapshot({ is_today: true, temp_c_max: 20 })] }),
    })
    expect(panel.text).toContain('Next days')
    expect(panel.text).toContain('<pre>')
    expect(panel.keyboard?.inline_keyboard[0]?.[0]).toMatchObject({ text: '◀ Simple' })
  })

  it('omits the outlook heading entirely when there are no rows to put under it', () => {
    const panel = buildConditionsPanel({
      stateId: STATE,
      mode: 'advanced',
      conditions: conditions({ snapshots: [] }),
    })
    expect(panel.text).not.toContain('Next days')
  })
})

describe('buildAlertsPanel', () => {
  it('does not say NWS reports nothing when the table is simply empty', () => {
    // These rows come from a cron. An empty table equally means NWS was never
    // asked, and naming a source that did not answer is the attribution defect
    // this repo keeps shipping.
    const panel = buildAlertsPanel(STATE, [])
    expect(panel.text).toContain('background NWS check')
    expect(panel.text).not.toContain('Source: NWS')
  })

  it('names NWS only when there is an alert that came from it, and escapes the name', () => {
    const panel = buildAlertsPanel(STATE, [
      {
        locationName: 'Bear & Cub',
        event: 'Excessive Heat Warning',
        severity: 'Severe',
        headline: 'Highs 105 to 110',
      },
    ])
    expect(panel.text).toContain('Source: NWS')
    expect(panel.text).toContain('Bear &amp; Cub')
    expect(panel.text).toContain('Highs 105 to 110')
  })

  it('falls back to the event when there is no headline, rather than printing null', () => {
    const panel = buildAlertsPanel(STATE, [
      { locationName: 'Red Rock', event: 'Wind Advisory', severity: 'Moderate', headline: null },
    ])
    expect(panel.text).not.toContain('null')
    expect(panel.text).toContain('Wind Advisory')
  })
})
