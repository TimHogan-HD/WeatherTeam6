import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { INIT_DATA_MAX_AGE_SECONDS, validateInitData } from './initData.js';

const BOT_TOKEN = '123456:test-bot-token';
const OWNER_ID = 42;

/**
 * Signs a payload exactly the way Telegram does, so these tests exercise the
 * real derivation rather than a mirror of the implementation's own mistakes.
 */
function signInitData(fields: Record<string, string>): string {
  const dataCheckString = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const params = new URLSearchParams(fields);
  params.set('hash', hash);
  return params.toString();
}

function validFields(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAAAAAAA',
    user: JSON.stringify({ id: OWNER_ID, first_name: 'Tim', username: 'tim' }),
    ...overrides,
  };
}

describe('validateInitData', () => {
  it('accepts a correctly signed payload and returns the user id', () => {
    const result = validateInitData(signInitData(validFields()), BOT_TOKEN);
    expect(result).toMatchObject({ ok: true, user: { id: OWNER_ID } });
  });

  it('rejects a payload signed with a different bot token', () => {
    const result = validateInitData(signInitData(validFields()), 'other:token');
    expect(result).toEqual({ ok: false, reason: 'hash mismatch' });
  });

  it('rejects a tampered field even though the hash is well-formed', () => {
    const raw = signInitData(validFields());
    const tampered = raw.replace(/query_id=[^&]*/, 'query_id=BBBBBBBB');
    expect(tampered).not.toBe(raw);
    expect(validateInitData(tampered, BOT_TOKEN)).toEqual({ ok: false, reason: 'hash mismatch' });
  });

  it('rejects an appended field, so extra parameters cannot ride along', () => {
    const raw = `${signInitData(validFields())}&injected=1`;
    expect(validateInitData(raw, BOT_TOKEN)).toEqual({ ok: false, reason: 'hash mismatch' });
  });

  it('rejects a second hash parameter rather than reading only the first', () => {
    const raw = `${signInitData(validFields())}&hash=deadbeef`;
    expect(validateInitData(raw, BOT_TOKEN)).toEqual({
      ok: false,
      reason: 'missing or duplicated hash',
    });
  });

  /**
   * The regression that matters. This test previously asserted the opposite —
   * it signed a payload WITHOUT `signature`, appended one, and expected the
   * launch to validate. That is the Ed25519 third-party rule, not the bot-token
   * rule, and applying it here meant the check string was missing a field on
   * every launch from a Bot API 7.10+ client: **every Mini App request 401'd
   * from the day auth shipped.** The suite stayed green because the helper
   * signed payloads with the same mistake.
   *
   * `signInitData` now signs whatever fields it is given, so passing
   * `signature` through it reproduces what a real client sends.
   */
  it('includes `signature` in the check string — Telegram signs it with everything else', () => {
    const raw = signInitData(validFields({ signature: 'kJ8_Ed25519SignatureFromTelegram' }));
    expect(raw).toContain('signature=');
    expect(validateInitData(raw, BOT_TOKEN)).toMatchObject({ ok: true, user: { id: OWNER_ID } });
  });

  it('rejects a payload whose `signature` was signed and then altered', () => {
    const raw = signInitData(validFields({ signature: 'original' })).replace(
      /signature=[^&]*/,
      'signature=tampered',
    );
    expect(validateInitData(raw, BOT_TOKEN)).toEqual({ ok: false, reason: 'hash mismatch' });
  });

  it('still accepts a launch with no `signature` at all — older clients send none', () => {
    const raw = signInitData(validFields());
    expect(raw).not.toContain('signature=');
    expect(validateInitData(raw, BOT_TOKEN)).toMatchObject({ ok: true, user: { id: OWNER_ID } });
  });

  it('rejects initData older than the maximum age', () => {
    const stale = String(Math.floor(Date.now() / 1000) - INIT_DATA_MAX_AGE_SECONDS - 60);
    const raw = signInitData(validFields({ auth_date: stale }));
    expect(validateInitData(raw, BOT_TOKEN)).toEqual({ ok: false, reason: 'initData expired' });
  });

  it('accepts initData just inside the maximum age', () => {
    const nowMs = Date.now();
    const edge = String(Math.floor(nowMs / 1000) - INIT_DATA_MAX_AGE_SECONDS + 60);
    const raw = signInitData(validFields({ auth_date: edge }));
    expect(validateInitData(raw, BOT_TOKEN, nowMs)).toMatchObject({ ok: true });
  });

  it('rejects a signed payload with no user — it cannot be attributed to the owner', () => {
    const { user: _user, ...withoutUser } = validFields();
    const raw = signInitData(withoutUser);
    expect(validateInitData(raw, BOT_TOKEN)).toEqual({ ok: false, reason: 'no user in initData' });
  });

  it('rejects an empty string and an empty bot token', () => {
    expect(validateInitData('', BOT_TOKEN)).toEqual({ ok: false, reason: 'empty initData' });
    expect(validateInitData(signInitData(validFields()), '')).toEqual({
      ok: false,
      reason: 'no bot token configured',
    });
  });

  it('rejects junk without throwing', () => {
    expect(() => validateInitData('%%%not-a-query%%%', BOT_TOKEN)).not.toThrow();
    expect(validateInitData('%%%not-a-query%%%', BOT_TOKEN).ok).toBe(false);
  });
});
