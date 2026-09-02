import { describe, expect, it } from 'vitest'
import type { ConditionsScore, ForecastSnapshot } from '@weatherteam6/types'
import {
  formatConditionsReply,
  formatLocationNotFound,
  type ActiveAlert,
  type ConditionsReplyInput,
} from './conditionsMessage.js'

/**
 * The copy rules are the thing this project keeps violating, and they are not
 * type-checkable. The reply that shipped for months said "looks great — go
 * climb" for a 103 °F day under an Extreme Heat Warning.
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
    activeAlerts: [],
    ...over,
  }
}

describe('formatConditionsReply — the locked copy rules', () => {
  it('never states a climbing opinion', () => {
    const reply = formatConditionsReply(input())
    expect(reply).not.toMatch(/go climb|climbable|not recommended|marginal|looks great/i)
  })

  it('leads with weather in imperial units, before any score', () => {
    const reply = formatConditionsReply(input())
    expect(reply).toContain('High 103°F · wind to 21 mph · humidity 17%')
    expect(reply.indexOf('103°F')).toBeLessThan(reply.indexOf('Score 80'))
  })

  it('suppresses the state label and names the limiting component', () => {
    const reply = formatConditionsReply(input())
    expect(reply).toContain('Score 80 (high confidence) — limited by temperature')
    expect(reply).not.toContain('Dry, settled')
  })

  it('puts a Severe+ alert above the score and names it instead of a component', () => {
    const reply = formatConditionsReply(input({ activeAlerts: [heatWarning] }))
    expect(reply).toContain('⚠️ Extreme Heat Warning (NWS)')
    expect(reply).toContain('see the Extreme Heat Warning above')
    expect(reply).not.toContain('limited by temperature')
    expect(reply.indexOf('Extreme Heat Warning')).toBeLessThan(reply.indexOf('Score 80'))
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
  it('reports weather and alerts but no score of any kind', () => {
    const reply = formatConditionsReply(
      input({ isClimbingLocation: false, locationName: 'Chicago', activeAlerts: [heatWarning] }),
    )
    expect(reply).toContain('High 103°F')
    expect(reply).toContain('Extreme Heat Warning')
    expect(reply).not.toContain('Score')
    expect(reply).not.toContain('no rain in')
    // No rainfall source either — the drying model's output is not being shown.
    expect(reply).not.toContain('ACIS')
  })
})

describe('formatConditionsReply — HTML escaping (issue #26)', () => {
  it('escapes an ampersand in the location name', () => {
    const reply = formatConditionsReply(input({ locationName: 'Bear & Cub' }))
    expect(reply).toContain('<b>Bear &amp; Cub</b>')
  })

  it('escapes an ampersand in an NWS headline', () => {
    const reply = formatConditionsReply(
      input({
        activeAlerts: [
          { event: 'Flood Watch', severity: 'Severe', headline: 'Rivers & streams flooding' },
        ],
      }),
    )
    expect(reply).toContain('Rivers &amp; streams')
    expect(reply).not.toMatch(/Rivers & streams/)
  })

  it('escapes angle brackets so no value can inject markup', () => {
    const reply = formatConditionsReply(input({ locationName: '<i>x</i>' }))
    expect(reply).toContain('&lt;i&gt;x&lt;/i&gt;')
    expect(reply.match(/<b>/g)).toHaveLength(1)
  })

  it('escapes the searched name in the not-found reply', () => {
    // User input, straight from the /conditions command.
    const reply = formatLocationNotFound('Bear & <b>Cub</b>')
    expect(reply).toContain('Bear &amp; &lt;b&gt;Cub&lt;/b&gt;')
    expect(reply).not.toContain('<b>')
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

  it('renders an em dash for null readings', () => {
    const reply = formatConditionsReply(
      input({ today: day({ temp_c_max: null, wind_kmh_max: null, humidity_pct: null }) }),
    )
    expect(reply).toContain('High —')
    expect(reply).not.toContain('32°F')
    expect(reply).not.toContain('0 mph')
  })

  it('distinguishes no-score-today from a date beyond the scoring window', () => {
    const reply = formatConditionsReply(input({ todayScore: null }))
    expect(reply).toContain('No conditions for today yet.')
    expect(reply).not.toContain('Too far out to score')
  })

})

/**
 * Issue #34. The bot and the Mini App must say the same thing about the same
 * location, so a withheld score cannot read as "no conditions yet" on one
 * surface and as a score on the other.
 */
describe('formatConditionsReply — a withheld score (#34)', () => {
  const base = {
    locationName: 'Red Rock',
    isClimbingLocation: true,
    asosStation: 'KLAS',
    today: null,
    todayScore: null,
    activeAlerts: [],
  }

  it('says the rainfall data is missing, not that there are no conditions yet', () => {
    const reply = formatConditionsReply({ ...base, scoreUnavailable: 'rainfall_unavailable' })
    expect(reply).toContain("Can't score right now — no rainfall data.")
    expect(reply).not.toContain('No conditions for today yet.')
  })

  it('never implies a dry spell — that is the defect it exists for', () => {
    const reply = formatConditionsReply({ ...base, scoreUnavailable: 'rainfall_unavailable' })
    expect(reply).not.toContain('no rain in')
    expect(reply).not.toContain('Dry, settled')
  })

  it('still falls back to the ordinary wording when nothing was withheld', () => {
    const reply = formatConditionsReply({ ...base, scoreUnavailable: null })
    expect(reply).toContain('No conditions for today yet.')
  })

  it('says nothing about scoring at all for a non-climbing location', () => {
    // A city has no drying story, so a rainfall outage is not its problem.
    const reply = formatConditionsReply({
      ...base,
      isClimbingLocation: false,
      scoreUnavailable: 'rainfall_unavailable',
    })
    expect(reply).not.toContain("Can't score right now")
  })
})
