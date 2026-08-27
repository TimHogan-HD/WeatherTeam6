import { describe, expect, it } from 'vitest'
import { MINI_APP_DIRECT_LINK, alertKeyboard, locationDeepLink } from './deepLink.js'

const UUID = '3f8a1c22-9d4e-4b31-8a77-1c0e5b2d9f04'

describe('locationDeepLink', () => {
  it('builds the Direct Link Mini App url with the uuid intact', () => {
    expect(locationDeepLink(UUID)).toBe(`${MINI_APP_DIRECT_LINK}?startapp=loc_${UUID}`)
  })

  it('keeps the dashes — startapp permits them, and reinserting them at fixed offsets would fabricate a wrong uuid', () => {
    const link = locationDeepLink(UUID)
    expect(link).toContain(UUID)
    expect(link?.split('startapp=loc_')[1]).toBe(UUID)
  })

  it('is a t.me direct link, not a web_app url — a web_app button never delivers start_param', () => {
    expect(MINI_APP_DIRECT_LINK).toBe('https://t.me/WeatherTeam6_bot/Alert')
  })

  it('returns null for anything that is not a uuid', () => {
    expect(locationDeepLink('')).toBeNull()
    expect(locationDeepLink('not-a-uuid')).toBeNull()
    expect(locationDeepLink(`${UUID}extra`)).toBeNull()
    expect(locationDeepLink(UUID.replace(/-/g, ''))).toBeNull()
  })

  it('returns null for a uuid with junk in front of it, not just behind it', () => {
    // Both anchors need their own case. The suffix above is caught by `$`; with
    // only that, dropping `^` from UUID_RE leaves every test green while a
    // prefixed id builds a link to `loc_junk<uuid>`. Found by mutation testing.
    expect(locationDeepLink(`junk${UUID}`)).toBeNull()
    expect(locationDeepLink(` ${UUID}`)).toBeNull()
    expect(alertKeyboard(`junk${UUID}`)).toBeNull()
  })

  it('accepts an uppercase uuid', () => {
    expect(locationDeepLink(UUID.toUpperCase())).toContain(UUID.toUpperCase())
  })
})

describe('alertKeyboard', () => {
  it('is one row with one url button', () => {
    expect(alertKeyboard(UUID)).toEqual({
      inline_keyboard: [[{ text: 'View forecast', url: `${MINI_APP_DIRECT_LINK}?startapp=loc_${UUID}` }]],
    })
  })

  it('returns null rather than a best-effort button for a bad id', () => {
    // A malformed button url is a 400, sendTelegramMessage treats 400 as
    // non-retryable, and notifyPendingAlerts then re-sends the identical broken
    // message forever — so a bad link would cost the whole alert, not just the
    // button.
    expect(alertKeyboard('nonsense')).toBeNull()
  })
})
