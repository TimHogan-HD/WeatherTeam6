import { describe, expect, it } from 'vitest'
import type {
  ConditionsReadings,
  ConditionsScore,
  ForecastSnapshot,
  HourlyReading,
} from '@weatherteam6/types'
import { FRICTION_ESTIMATE_NOTE } from '@weatherteam6/types'
import {
  formatConditionsReply,
  formatLocationNotFound,
  type ActiveAlert,
  type ConditionsReplyInput,
} from './conditionsMessage.js'
import { NOT_A_CRAG_READINGS } from '../runs/conditionsReadings.js'

/**
 * The copy rules are the thing this project keeps violating, and they are not
 * type-checkable. Two replies have shipped from this file and both were wrong
 * about the same day:
 *
 * - *"looks great — go climb"* for 103 °F under an Extreme Heat Warning.
 * - *"Dry, settled — Score 88"* for the same day, once the ladder replaced it.
 *   Honest about suppression, and still mapping a number that could not see
 *   heat onto a reassuring word.
 *
 * The fixtures below are that day. The readings are what the v2 model actually
 * returns for it — `Rock: Dry`, `Friction: Poor`, 58 — so the assertions are
 * about a case the model can really produce rather than one invented here.
 */

const TODAY = '2026-08-26'

function day(over: Partial<ForecastSnapshot> = {}): ForecastSnapshot {
  return {
    id: 'snap',
    location_id: 'loc',
    captured_at: `${TODAY}T00:00:00.000Z`,
    forecast_date: TODAY,
    precip_mm_p10: 0,
    precip_mm_p50: 0,
    precip_mm_p90: 0,
    temp_c_min: 26,
    temp_c_max: 39.5,
    wind_kmh_max: 34,
    humidity_pct: 17,
    model_sources: ['gfs_seamless', 'ecmwf_ifs025'],
    created_at: `${TODAY}T00:00:00.000Z`,
    ...over,
  }
}

/** Red Rock exactly as production returned it: 103 °F, temp component 0, total 80. */
function redRockScore(over: Partial<ConditionsScore> = {}): ConditionsScore {
  return {
    id: 'score',
    location_id: 'loc',
    forecast_date: TODAY,
    score: 80,
    confidence: 'high',
    component_drying_time: 40,
    component_upcoming_rain: 25,
    component_wind: 15,
    component_temp: 0,
    component_humidity: 8,
    score_breakdown: {
      drying: {
        score: 40,
        hours_since_rain: 72,
        hours_remaining: 0,
        rock_type: 'sandstone',
        modifiers: { angle: 1.15, wind: 1, humidity: 1 },
      },
      rain: { score: 25, forecast_72h_mm: 0 },
      wind: { score: 15, max_kmh: 34 },
      temp: { score: 0, temp_c: 39.5 },
      humidity: { score: 8, pct: 17 },
      total: 80,
      confidence: 'high',
      computed_at: `${TODAY}T12:00:00.000Z`,
    },
    computed_at: `${TODAY}T12:00:00.000Z`,
    created_at: `${TODAY}T12:00:00.000Z`,
    ...over,
  }
}

function hour(over: Partial<HourlyReading> = {}): HourlyReading {
  return {
    valid_at: `${TODAY}T20:00:00.000Z`,
    rock: { level: 'dry', qualified: false },
    friction: { level: 'poor', condensing: false, qualified: false },
    score: 58,
    t_surface_c: 48.2,
    condensation_margin_c: 21.4,
    ...over,
  }
}

function readings(over: Partial<ConditionsReadings> = {}): ConditionsReadings {
  return {
    model: 'gfs_seamless',
    unavailable_reason: null,
    // Red Rock is UTC-7, so the window's 13:00-16:00Z is 6am-9am locally. A
    // reply that printed 1pm-4pm would be reading the server's clock.
    utc_offset_seconds: -7 * 3600,
    now: hour(),
    today: {
      local_date: TODAY,
      window: {
        from: `${TODAY}T13:00:00.000Z`,
        to: `${TODAY}T16:00:00.000Z`,
        hours: 4,
        min_score: 62,
        qualified: false,
      },
      best: hour({ score: 71 }),
    },
    ...over,
  }
}

const heatWarning: ActiveAlert = {
  event: 'Extreme Heat Warning',
  severity: 'Extreme',
  headline: 'Extreme Heat Warning in effect through August 28',
}

function input(over: Partial<ConditionsReplyInput> = {}): ConditionsReplyInput {
  return {
    locationName: 'Red Rock',
    isClimbingLocation: true,
    today: day(),
    todayScore: redRockScore(),
    readings: readings(),
    activeAlerts: [],
    ...over,
  }
}

describe('formatConditionsReply — the locked copy rules', () => {
  it('never states a climbing opinion', () => {
    const reply = formatConditionsReply(input())
    expect(reply).not.toMatch(/go climb|climbable|not recommended|marginal|looks great/i)
  })

  it('leads with weather in imperial units, before any reading', () => {
    const reply = formatConditionsReply(input())
    expect(reply).toContain('High 103°F · wind to 21 mph · humidity 17%')
    expect(reply.indexOf('103°F')).toBeLessThan(reply.indexOf('Friction'))
  })

  it('leads the reading block with the two words and puts the number after them', () => {
    const reply = formatConditionsReply(input())
    expect(reply).toContain('Dryness: Dry · Friction: Poor')
    expect(reply).toContain('Score: 58')
    expect(reply.indexOf('Friction: Poor')).toBeLessThan(reply.indexOf('Score: 58'))
  })

  /**
   * The phase's acceptance criterion, on the day it was written for. The old
   * ladder printed "Dry, settled" here because 103 °F cost 12 of 100 points.
   */
  it('never renders a bare good-looking summary for a day with poor friction', () => {
    const reply = formatConditionsReply(input())
    expect(reply).toContain('Friction: Poor')
    expect(reply).not.toContain('Dry, settled')
    expect(reply).not.toContain('Mostly dry')
  })

  it('names the window on the location clock, not the server one', () => {
    expect(formatConditionsReply(input())).toContain('Good hours: 6am–9am')
  })

  it('says the friction reading is an estimate, on the surface', () => {
    // Phase 3 acceptance criterion, § Open Questions 6. The one unvalidated
    // step in the model is quarantined by two things and this is one of them.
    expect(formatConditionsReply(input())).toContain(FRICTION_ESTIMATE_NOTE)
  })

  it('publishes no friction magnitude anywhere', () => {
    // The other half of the quarantine. A 0-1 factor would read as a decimal.
    const reply = formatConditionsReply(input({ today: null }))
    expect(reply).not.toMatch(/friction[^\n]*\d*\.\d/i)
  })

  it('puts a Severe+ alert above the reading and drops the number', () => {
    const reply = formatConditionsReply(input({ activeAlerts: [heatWarning] }))
    expect(reply).toContain('⚠️ Extreme Heat Warning (NWS)')
    expect(reply).toContain('see the Extreme Heat Warning above')
    // The readings stay: they are the same fact the warning is about, and they
    // now come from physics that sees heat. The *number* is what suppression
    // removes — it is the part that reads as actionable.
    expect(reply).toContain('Friction: Poor')
    expect(reply).not.toContain('Score: 58')
    expect(reply.indexOf('Extreme Heat Warning')).toBeLessThan(reply.indexOf('Friction: Poor'))
  })

  it('carries no sources footer at all', () => {
    // What this used to print: `Sources: Open-Meteo (gfs_seamless,
    // ecmwf_ifs025, icon_seamless_eps, gem_global) · Open-Meteo archive` —
    // four raw API model keys and a repeated vendor name, on the panel whose
    // whole job is three readable lines.
    //
    // §7 rule 6 requires a named source to be *computed* rather than hardcoded;
    // it does not require one to be shown. `forecastSourceLabel` and
    // `rainfallSourceLabel` are untouched and the Mini App still renders them.
    const reply = formatConditionsReply(input())
    expect(reply).not.toContain('Sources:')
    expect(reply).not.toContain('gfs_seamless')
    expect(reply).not.toContain('Open-Meteo')
    expect(reply).not.toContain('ACIS')
  })

  it('still names NWS on the alert itself, where the attribution carries meaning', () => {
    // The footer went; this did not. An alert is a claim about the world made
    // by a specific agency, and dropping that would be the attribution defect
    // rather than a tidier panel.
    const reply = formatConditionsReply(input({ activeAlerts: [heatWarning] }))
    expect(reply).toContain('(NWS)')
  })

  it('caps hours since rain at the sentinel', () => {
    const base = redRockScore()
    const breakdown = base.score_breakdown
    if (breakdown === null) throw new Error('fixture must carry a breakdown')
    const reply = formatConditionsReply(
      input({
        todayScore: {
          ...base,
          score_breakdown: { ...breakdown, drying: { ...breakdown.drying, hours_since_rain: 720 } },
        },
      }),
    )
    expect(reply).toContain('no rain in 30+ days')
    expect(reply).not.toContain('720')
  })
})

describe('formatConditionsReply — a non-climbing location', () => {
  it('reports weather and alerts but no reading of any kind', () => {
    const reply = formatConditionsReply(
      input({
        isClimbingLocation: false,
        locationName: 'Chicago',
        readings: NOT_A_CRAG_READINGS,
        activeAlerts: [heatWarning],
      }),
    )
    expect(reply).toContain('High 103°F')
    expect(reply).toContain('Extreme Heat Warning')
    expect(reply).not.toContain('Score')
    expect(reply).not.toMatch(/friction/i)
    expect(reply).not.toContain('no rain in')
    // No rainfall source either — the drying model's output is not being shown.
    expect(reply).not.toContain('ACIS')
  })

  it('says nothing even when readings were somehow supplied', () => {
    // The flag is the gate, not the contents of `readings`. A caller that
    // passed a crag's readings for a city must still print none.
    const reply = formatConditionsReply(input({ isClimbingLocation: false }))
    expect(reply).not.toMatch(/friction/i)
  })
})

describe('formatConditionsReply — plain text, not markup (issue #26)', () => {
  /**
   * **Escaping moved, it did not go away.** The panel is a rich message now,
   * whose blocks are structured JSON — Probe B specimen 8a put
   * `Bear & Cub <north face>` through unaltered. Escaping here as well would put
   * a literal `&amp;` in the native table, which is issue #26 in reverse.
   *
   * `panelToHtml` is the one place that escapes, on the `<pre>` fallback path,
   * and `panels.test.ts` asserts it there. These tests hold the other half of
   * that contract: this module must emit the characters as they came.
   */
  it('leaves an ampersand in the location name alone', () => {
    const reply = formatConditionsReply(input({ locationName: 'Bear & Cub' }))
    expect(reply).toContain('Bear & Cub')
    expect(reply).not.toContain('&amp;')
  })

  it('leaves an ampersand in an NWS headline alone', () => {
    const reply = formatConditionsReply(
      input({
        activeAlerts: [
          { event: 'Flood Watch', severity: 'Severe', headline: 'Rivers & streams flooding' },
        ],
      }),
    )
    expect(reply).toContain('Rivers & streams')
    expect(reply).not.toContain('&amp;')
  })

  it('emits no markup of its own, so a value cannot be mistaken for one', () => {
    const reply = formatConditionsReply(input({ locationName: '<i>x</i>' }))
    // The name comes through as typed, and the module adds no tags around it —
    // so there is nothing for a reader of the rich path to confuse.
    expect(reply).toContain('<i>x</i>')
    expect(reply).not.toContain('<b>')
  })

  it('leaves the searched name alone in the not-found reply', () => {
    // User input, straight from the /conditions command. It reaches the rich
    // path unaltered and the HTML fallback escapes it on the way out.
    const reply = formatLocationNotFound('Bear & <b>Cub</b>')
    expect(reply).toContain('Bear & <b>Cub</b>')
    expect(reply).not.toContain('&amp;')
  })

  it('points at a surface that exists, not the archived mobile app', () => {
    expect(formatLocationNotFound('x')).not.toMatch(/save it in the app first/i)
    expect(formatLocationNotFound('x')).toMatch(/menu button/i)
  })
})

describe('formatConditionsReply — missing data', () => {
  it('says today has no reading rather than showing a plausible 32°F', () => {
    const reply = formatConditionsReply(input({ today: null, todayScore: null }))
    expect(reply).toContain('No reading for today yet.')
    expect(reply).not.toContain('32°F')
  })

  it('renders an em dash for null weather values', () => {
    const reply = formatConditionsReply(
      input({ today: day({ temp_c_max: null, wind_kmh_max: null, humidity_pct: null }) }),
    )
    expect(reply).toContain('High —')
    expect(reply).not.toContain('32°F')
    expect(reply).not.toContain('0 mph')
  })

  it('says why there are no readings rather than falling silent', () => {
    const reply = formatConditionsReply(
      input({
        readings: {
          model: null,
          unavailable_reason: 'insufficient_history',
          utc_offset_seconds: 0,
          now: null,
          today: null,
        },
      }),
    )
    expect(reply).toContain('Not enough recent weather yet')
    expect(reply).not.toMatch(/friction/i)
    // A statement about us, never one about the rock.
    expect(reply).not.toMatch(/dryness/i)
  })

  it('still answers the day when the run does not reach this hour', () => {
    // No headline, because there is no hour to describe — but the day's window
    // is a separate fact and dropping it would leave the block empty.
    const reply = formatConditionsReply(input({ readings: readings({ now: null }) }))
    expect(reply).not.toMatch(/friction/i)
    expect(reply).toContain('Good hours: 6am–9am')
  })

  it('says so when no run of hours cleared the minimum', () => {
    const reply = formatConditionsReply(
      input({
        readings: readings({
          now: hour({ rock: { level: 'wet', qualified: true }, score: 4 }),
          today: { local_date: TODAY, window: null, best: null },
        }),
      }),
    )
    expect(reply).toContain('Dryness: Wet')
    expect(reply).toContain('Good hours: None')
  })
})

/**
 * Issue #34, as it stands after the v2 readings took over the reply.
 *
 * `scoreUnavailable` means the **rainfall history lookup** failed. The v2
 * readings never consult it — their drying clock runs off the hourly
 * precipitation in the stored run — so the readings are unaffected and are
 * still printed. What it must still withhold is the rain clause, because the
 * sentinel behind it is the same value for a dry month and for an outage.
 */
describe('formatConditionsReply — a withheld rainfall history (#34)', () => {
  it('never implies a dry spell — that is the defect it exists for', () => {
    const reply = formatConditionsReply(
      input({ scoreUnavailable: 'rainfall_unavailable', todayScore: redRockScore() }),
    )
    expect(reply).not.toContain('no rain in')
  })

  it('still reports the readings, which do not depend on that lookup', () => {
    const reply = formatConditionsReply(input({ scoreUnavailable: 'rainfall_unavailable' }))
    expect(reply).toContain('Dryness: Dry · Friction: Poor')
  })

  it('prints the rain clause when nothing was withheld', () => {
    expect(formatConditionsReply(input({ scoreUnavailable: null }))).toContain('no rain in 72h')
  })

  it('says nothing about rain at all for a non-climbing location', () => {
    const reply = formatConditionsReply(
      input({
        isClimbingLocation: false,
        readings: NOT_A_CRAG_READINGS,
        scoreUnavailable: 'rainfall_unavailable',
      }),
    )
    expect(reply).not.toContain('no rain in')
  })
})
