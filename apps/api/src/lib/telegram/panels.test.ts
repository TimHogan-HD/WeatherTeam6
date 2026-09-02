import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ForecastSnapshot } from '@weatherteam6/types'
import {
  buildAlertsPanel,
  buildConditionsPanel,
  buildListPanel,
  buildNoticePanel,
  buildRetryPanel,
  clockLabel,
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
    today: null,
    todayScore: null,
    scoreUnavailable: null,
    activeAlerts: [],
    ...over,
  }
}

const STATE = 'a1b2c3d4'

describe('buildListPanel', () => {
  it('says the list is empty rather than showing bare navigation', () => {
    const panel = buildListPanel(STATE, [])
    expect(panel.text).toContain('No saved locations')
    // Only the nav row, and it drops the button for the view already showing.
    expect(panel.keyboard?.inline_keyboard).toHaveLength(1)
    expect(panel.keyboard?.inline_keyboard[0]).toHaveLength(2)
  })

  it('gives each location its own row and does not also list it in the text', () => {
    const panel = buildListPanel(STATE, [
      { id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', name: 'Red Rock' },
      { id: '3f2504e0-4f89-41d3-9a0c-0305e82c3302', name: 'Indian Creek' },
    ])
    // The buttons are the list. Printing the names above them as well put every
    // location on screen twice.
    expect(panel.text).not.toContain('Red Rock')
    expect(panel.text).not.toContain('Indian Creek')
    // Two location rows plus the footer row.
    expect(panel.keyboard?.inline_keyboard).toHaveLength(3)
    expect(panel.keyboard?.inline_keyboard[0]).toHaveLength(1)
    expect(panel.keyboard?.inline_keyboard[0]?.[0]).toMatchObject({ text: 'Red Rock' })
  })

  it('leaves an ampersand alone on a button label', () => {
    // Button labels are not parsed by Telegram, so escaping one would put a
    // literal "&amp;" on the button. The opposite rule governs the text.
    const panel = buildListPanel(STATE, [
      { id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', name: 'Bear & Cub' },
    ])
    expect(panel.keyboard?.inline_keyboard[0]?.[0]).toMatchObject({ text: 'Bear & Cub' })
  })

  it('names a location in the text when its button could not be built', () => {
    // 40 characters, past the value ceiling, so `encodeAction` returns null. A
    // missing button is a control the user can work around; a missing location
    // is the bot claiming they never saved it. Since the names are no longer
    // listed above the buttons, this line is the only thing standing between
    // that location and disappearing from the panel altogether.
    const panel = buildListPanel(STATE, [{ id: 'x'.repeat(40), name: 'Unencodable' }])
    expect(panel.text).toContain('Unencodable')
    expect(panel.text).toContain('Open the app')
    // The footer row survives on its own — the list panel offers Alerts rather
    // than a button back to the view already showing.
    expect(panel.keyboard?.inline_keyboard).toHaveLength(1)
    expect(panel.keyboard?.inline_keyboard[0]?.[1]).toMatchObject({ text: '⚠️ Alerts' })
  })

  it('escapes an unencodable name in the text, where HTML rules apply', () => {
    // The same name, on the path that puts it in the message body rather than
    // on a button. An unescaped `&` there is a 400 that costs the whole panel.
    const panel = buildListPanel(STATE, [{ id: 'x'.repeat(40), name: 'Bear & Cub' }])
    expect(panel.text).toContain('Bear &amp; Cub')
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

describe('clockLabel', () => {
  it('reads the clock the way a person says it', () => {
    expect(clockLabel(15)).toBe('3pm')
    expect(clockLabel(9)).toBe('9am')
    expect(clockLabel(23)).toBe('11pm')
  })

  it('names the two hours that have words rather than numbers', () => {
    // `12am` and `0am` are both wrong, and `12pm` is the one people misread.
    expect(clockLabel(0)).toBe('midnight')
    expect(clockLabel(12)).toBe('noon')
  })

  it('refuses anything that is not an hour of the day', () => {
    // The caller falls back to the 24-hour form. Returning a string here would
    // put `NaNpm` in a sentence.
    expect(clockLabel(24)).toBeNull()
    expect(clockLabel(-1)).toBeNull()
    expect(clockLabel(9.5)).toBeNull()
    expect(clockLabel(Number.NaN)).toBeNull()
  })
})

describe('buildConditionsPanel', () => {
  const panel = buildConditionsPanel({
    stateId: STATE,
    locationId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    conditions: conditions({ today: snapshot({ is_today: true }) }),
  })

  it('keeps the whole panel to two rows of buttons', () => {
    // The redesign's binding constraint. The panel this replaced carried five
    // rows and up to thirteen buttons under three lines of text.
    expect(panel.keyboard?.inline_keyboard).toHaveLength(2)
    for (const row of panel.keyboard?.inline_keyboard ?? []) {
      expect(row.length).toBeLessThanOrEqual(3)
    }
  })

  it('offers the other two views of the same location, and never itself', () => {
    const labels = panel.keyboard?.inline_keyboard[0]?.map((b) => b.text)
    expect(labels).toEqual(['⏱ Hourly', '🌧 Rain', '🔄'])
  })

  it('deep-links the app to this location rather than to the list', () => {
    const open = panel.keyboard?.inline_keyboard[1]?.[0]
    expect(open).toMatchObject({ text: '📲 Open in app' })
    // `startapp=loc_<uuid>` is what carries the location through a Direct Link.
    // Without it the app opens on the list with no idea which one was meant.
    expect(open?.url).toContain('startapp=loc_3f2504e0-4f89-41d3-9a0c-0305e82c3301')
  })

  it('falls back to the app’s list when there is no location to link', () => {
    const noLocation = buildConditionsPanel({
      stateId: STATE,
      locationId: null,
      conditions: conditions(),
    })
    const open = noLocation.keyboard?.inline_keyboard[1]?.[0]
    // A button, still — the base link is a constant and always valid. Only the
    // `startapp` parameter can fail to build.
    expect(open?.url).not.toContain('startapp')
    expect(open?.url).toContain('t.me/')
  })

  it('no longer carries the seven-day outlook or a mode toggle', () => {
    // Both moved to the Mini App. The hourly panel's day pager walks the same
    // week one day at a time.
    expect(panel.text).not.toContain('Next days')
    const labels = panel.keyboard?.inline_keyboard.flat().map((b) => b.text) ?? []
    expect(labels).not.toContain('⚙ Advanced')
    expect(labels).not.toContain('◀ Simple')
  })
})

describe('buildRetryPanel', () => {
  it('carries the button its own copy names', () => {
    // The defect this replaced: the copy lived in `telegramWebhook.ts` and the
    // keyboard was built here, so when the nav row lost its 🔄 the message went
    // on telling the user to tap a button that was no longer on it. Neither
    // file was wrong alone, which is why nothing caught it.
    const panel = buildRetryPanel(STATE)
    expect(panel.text).toContain('🔄')
    const labels = panel.keyboard?.inline_keyboard.flat().map((b) => b.text) ?? []
    expect(labels.some((l) => l.includes('🔄'))).toBe(true)
  })

  it('drops the promise along with the button when the id will not encode', () => {
    // `encodeAction` refuses a state id that is not 8 hex characters. Keeping
    // the copy while losing the button is exactly the mismatch above, one layer
    // down.
    const panel = buildRetryPanel('not-a-state-id')
    expect(panel.text).not.toContain('🔄')
    expect(panel.text).toContain('/locations')
    const labels = panel.keyboard?.inline_keyboard.flat().map((b) => b.text) ?? []
    expect(labels.some((l) => l.includes('🔄'))).toBe(false)
  })

  it('does not put a retry on a plain notice, which would redraw the same words', () => {
    // A deleted location re-renders the identical notice, so a retry there is a
    // button that visibly does nothing — the reason `DisabledButton` was
    // rejected in the first place.
    const notice = buildNoticePanel(STATE, 'That location is no longer saved.')
    const labels = notice.keyboard?.inline_keyboard.flat().map((b) => b.text) ?? []
    expect(labels.some((l) => l.includes('🔄'))).toBe(false)
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
