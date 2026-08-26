import { describe, expect, it } from 'vitest'
import type { TelegramWebApp } from '../telegram/types.js'
import {
  type HistoryLike,
  applyDeepLink,
  parseLocationStartParam,
  readStartParam,
} from './deepLink.js'

const UUID = '3f8a1c22-9d4e-4b31-8a77-1c0e5b2d9f04'

function webApp(startParam?: string): TelegramWebApp {
  return { initDataUnsafe: { start_param: startParam } } as TelegramWebApp
}

function fakeHistory(): HistoryLike & { calls: Array<[string, string]> } {
  const calls: Array<[string, string]> = []
  return {
    calls,
    replaceState: (_d, _u, url) => void calls.push(['replace', url]),
    pushState: (_d, _u, url) => void calls.push(['push', url]),
  }
}

describe('parseLocationStartParam', () => {
  it('extracts the uuid from loc_<uuid>', () => {
    expect(parseLocationStartParam(`loc_${UUID}`)).toBe(UUID)
  })

  it('preserves the dashes exactly as they arrived', () => {
    expect(parseLocationStartParam(`loc_${UUID}`)).toBe(UUID)
    // A corrupted parameter must NOT be repaired into a well-formed wrong uuid.
    expect(parseLocationStartParam(`loc_${UUID.replace(/-/g, '')}`)).toBeNull()
  })

  it('rejects anything that is not loc_<uuid>', () => {
    expect(parseLocationStartParam(null)).toBeNull()
    expect(parseLocationStartParam(undefined)).toBeNull()
    expect(parseLocationStartParam('')).toBeNull()
    expect(parseLocationStartParam(UUID)).toBeNull() // no prefix
    expect(parseLocationStartParam('loc_')).toBeNull()
    expect(parseLocationStartParam('loc_nonsense')).toBeNull()
    expect(parseLocationStartParam(`loc_${UUID}x`)).toBeNull()
    expect(parseLocationStartParam(`trip_${UUID}`)).toBeNull()
  })

  it('accepts an uppercase uuid', () => {
    expect(parseLocationStartParam(`loc_${UUID.toUpperCase()}`)).toBe(UUID.toUpperCase())
  })
})

describe('readStartParam', () => {
  const empty = { search: '', hash: '' }

  it('prefers initDataUnsafe.start_param', () => {
    const loc = { search: `?tgWebAppStartParam=loc_${UUID}`, hash: '' }
    expect(readStartParam(webApp('loc_from-initdata'), loc)).toBe('loc_from-initdata')
  })

  it('falls back to the tgWebAppStartParam query parameter', () => {
    expect(readStartParam(webApp(), { search: `?tgWebAppStartParam=loc_${UUID}`, hash: '' })).toBe(
      `loc_${UUID}`,
    )
  })

  it('falls back to the hash, where Telegram also delivers its launch parameters', () => {
    const hash = `#tgWebAppData=abc&tgWebAppVersion=7.10&tgWebAppStartParam=loc_${UUID}`
    expect(readStartParam(webApp(), { search: '', hash })).toBe(`loc_${UUID}`)
  })

  it('returns null with no SDK and no parameters — the plain-browser case', () => {
    expect(readStartParam(null, empty)).toBeNull()
  })

  it('treats an empty start_param as absent rather than as a value', () => {
    expect(readStartParam(webApp(''), { search: `?tgWebAppStartParam=loc_${UUID}`, hash: '' })).toBe(
      `loc_${UUID}`,
    )
  })

  it('returns the raw value without validating it — validation is the parser’s job', () => {
    expect(readStartParam(webApp('garbage'), empty)).toBe('garbage')
  })
})

describe('applyDeepLink', () => {
  it('seats the list underneath the detail screen, list first', () => {
    // The acceptance criterion for Task 7. Pushing only /location/:id would
    // leave it as the first history entry, so BackButton closes the Mini App
    // instead of revealing the list.
    const history = fakeHistory()
    expect(applyDeepLink(`loc_${UUID}`, history)).toBe(UUID)
    expect(history.calls).toEqual([
      ['replace', '/'],
      ['push', `/location/${UUID}`],
    ])
  })

  it('leaves history untouched for an invalid parameter, so the app boots on /', () => {
    const history = fakeHistory()
    expect(applyDeepLink('loc_nonsense', history)).toBeNull()
    expect(history.calls).toEqual([])
  })

  it('leaves history untouched when there is no parameter at all', () => {
    const history = fakeHistory()
    expect(applyDeepLink(null, history)).toBeNull()
    expect(history.calls).toEqual([])
  })

  it('discards the launch url, whose tgWebApp parameters the SDK has already read', () => {
    const history = fakeHistory()
    applyDeepLink(`loc_${UUID}`, history)
    expect(history.calls[0]?.[1]).toBe('/')
  })
})
