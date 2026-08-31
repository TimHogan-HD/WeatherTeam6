import { describe, expect, it } from 'vitest'
import { CALLBACK_DATA_MAX_BYTES, decodeAction, encodeAction } from './callbackData.js'

/**
 * Each case names the line that would have to change for it to fail. The class
 * this guards is a fixture that cannot reach the branch it claims to cover — so
 * the over-limit case is built from *legal* parts that only fail on length, and
 * the under-limit case is the payload the location buttons actually send.
 */
describe('encodeAction', () => {
  const STATE = 'a1b2c3d4'

  it('encodes a verb-only action — the refresh button', () => {
    expect(encodeAction('refresh', STATE)).toBe(`refresh:${STATE}`)
  })

  it('encodes a field and value', () => {
    expect(encodeAction('view', STATE, 'v', 'list')).toBe(`view:${STATE}:v=list`)
  })

  it('encodes the real location button — a uuid value, well inside the ceiling', () => {
    // 4 + 1 + 8 + 1 + 4 + 36 = 54 bytes. If this ever returned null every
    // location in the picker would lose its button, so it is pinned rather than
    // assumed.
    const data = encodeAction('open', STATE, 'loc', '3f2504e0-4f89-41d3-9a0c-0305e82c3301')
    expect(data).toBe(`open:${STATE}:loc=3f2504e0-4f89-41d3-9a0c-0305e82c3301`)
    expect(Buffer.byteLength(String(data), 'utf8')).toBeLessThanOrEqual(CALLBACK_DATA_MAX_BYTES)
  })

  it('refuses a payload over the 64-byte ceiling, built from otherwise legal parts', () => {
    // 8 + 1 + 8 + 1 + 12 + 1 + 36 = 67. Every component passes its own pattern,
    // so only the length check can reject this — remove it and the button ships
    // a payload Telegram answers with a 400 for the whole message.
    const verb = 'abcdefgh'
    const field = 'abcdefghijkl'
    const value = 'a'.repeat(36)
    expect(verb.length + field.length + value.length + 3 + 8).toBeGreaterThan(
      CALLBACK_DATA_MAX_BYTES,
    )
    expect(encodeAction(verb, STATE, field, value)).toBeNull()
  })

  it('refuses a value carrying a separator — it would decode as a different action', () => {
    expect(encodeAction('view', STATE, 'v', 'a:b')).toBeNull()
    expect(encodeAction('view', STATE, 'v', 'a=b')).toBeNull()
  })

  it('refuses an id that is not a panel state id', () => {
    expect(encodeAction('view', '3f2504e0-4f89-41d3-9a0c-0305e82c3301', 'v', 'list')).toBeNull()
    expect(encodeAction('view', 'A1B2C3D4', 'v', 'list')).toBeNull()
    expect(encodeAction('view', 'a1b2c3d', 'v', 'list')).toBeNull()
  })

  it('refuses half a pair — a field with no value would decode as a real empty selection', () => {
    expect(encodeAction('view', STATE, 'v')).toBeNull()
    expect(encodeAction('view', STATE, undefined, 'list')).toBeNull()
  })

  it('refuses a verb that is not one word of lowercase letters', () => {
    expect(encodeAction('', STATE)).toBeNull()
    expect(encodeAction('View', STATE)).toBeNull()
    expect(encodeAction('view2', STATE)).toBeNull()
  })
})

describe('decodeAction', () => {
  const STATE = 'a1b2c3d4'

  it('round-trips what encodeAction produced', () => {
    const data = String(encodeAction('open', STATE, 'loc', '3f2504e0-4f89-41d3-9a0c-0305e82c3301'))
    expect(decodeAction(data)).toEqual({
      verb: 'open',
      stateId: STATE,
      field: 'loc',
      value: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    })
  })

  it('reports a verb-only action with a null field and value, not an empty string', () => {
    // The dispatcher branches on `field !== 'loc'`; an empty string here would
    // read as a field that was sent and did not match.
    expect(decodeAction(`refresh:${STATE}`)).toEqual({
      verb: 'refresh',
      stateId: STATE,
      field: null,
      value: null,
    })
  })

  it('rejects a fourth segment rather than ignoring it', () => {
    expect(decodeAction(`view:${STATE}:v=list:extra`)).toBeNull()
  })

  it('rejects a third segment that is not a pair', () => {
    expect(decodeAction(`view:${STATE}:list`)).toBeNull()
  })

  it('rejects an empty value — "selected nothing" is not a selection', () => {
    expect(decodeAction(`view:${STATE}:v=`)).toBeNull()
  })

  it('rejects a payload this build did not produce, rather than guessing at it', () => {
    expect(decodeAction('')).toBeNull()
    expect(decodeAction('view')).toBeNull()
    expect(decodeAction(`view:${STATE.toUpperCase()}:v=list`)).toBeNull()
    expect(decodeAction(`view:${STATE}:V=list`)).toBeNull()
  })

  it('rejects anything past the ceiling — inbound data is not this build’s output', () => {
    expect(decodeAction(`view:${STATE}:v=${'a'.repeat(64)}`)).toBeNull()
  })
})
