import { createHmac } from 'node:crypto';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { requireApiAuth } from './apiAuth.js';

const SECRET = 'test-secret-value';
const BOT_TOKEN = '123456:test-bot-token';
const OWNER_ID = 42;

type MockRes = Response & { statusCode: number | null; body: unknown };

function makeRes(): MockRes {
  const res: { statusCode: number | null; body: unknown; status: (c: number) => unknown; json: (p: unknown) => unknown } = {
    statusCode: null,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as unknown as MockRes;
}

function makeReq(authorization?: string): Request {
  return {
    headers: authorization === undefined ? {} : { authorization },
    path: '/locations',
    method: 'GET',
  } as unknown as Request;
}

/** Signs a launch payload the way Telegram does. See lib/telegram/initData.test.ts. */
function signInitData(userId: number): string {
  const fields: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: userId, first_name: 'Tim' }),
  };
  const dataCheckString = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  const params = new URLSearchParams(fields);
  params.set('hash', createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));
  return params.toString();
}

describe('requireApiAuth', () => {
  const originalEnv = {
    secret: process.env['API_SHARED_SECRET'],
    token: process.env['TELEGRAM_BOT_TOKEN'],
    chat: process.env['TELEGRAM_CHAT_ID'],
  };

  beforeEach(() => {
    process.env['API_SHARED_SECRET'] = SECRET;
    process.env['TELEGRAM_BOT_TOKEN'] = BOT_TOKEN;
    process.env['TELEGRAM_CHAT_ID'] = String(OWNER_ID);
  });

  afterEach(() => {
    for (const [key, value] of [
      ['API_SHARED_SECRET', originalEnv.secret],
      ['TELEGRAM_BOT_TOKEN', originalEnv.token],
      ['TELEGRAM_CHAT_ID', originalEnv.chat],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  describe('Bearer scheme (server-side callers)', () => {
    it('calls next() for a correct Bearer token', () => {
      const next = vi.fn() as unknown as NextFunction;
      const res = makeRes();
      requireApiAuth(makeReq(`Bearer ${SECRET}`), res, next);
      expect(next).toHaveBeenCalledOnce();
      expect(res.statusCode).toBeNull();
    });

    it('accepts a lowercase scheme and surrounding whitespace', () => {
      const next = vi.fn() as unknown as NextFunction;
      requireApiAuth(makeReq(`  bearer   ${SECRET}  `), makeRes(), next);
      expect(next).toHaveBeenCalledOnce();
    });

    it('rejects a missing Authorization header with 401', () => {
      const next = vi.fn() as unknown as NextFunction;
      const res = makeRes();
      requireApiAuth(makeReq(), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ data: null, error: 'Unauthorized', status: 401 });
    });

    it('rejects a wrong secret with 401', () => {
      const next = vi.fn() as unknown as NextFunction;
      const res = makeRes();
      requireApiAuth(makeReq('Bearer wrong-secret'), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    it('rejects a secret of a different length without throwing', () => {
      // timingSafeEqual throws on unequal buffer lengths — the sha256 digest step
      // exists to prevent that. A short token must 401, not 500.
      const next = vi.fn() as unknown as NextFunction;
      const res = makeRes();
      expect(() => requireApiAuth(makeReq('Bearer x'), res, next)).not.toThrow();
      expect(res.statusCode).toBe(401);
    });

    it('rejects an unrecognised scheme with 401', () => {
      const next = vi.fn() as unknown as NextFunction;
      const res = makeRes();
      requireApiAuth(makeReq(`Basic ${SECRET}`), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    it('rejects the bare secret with no scheme', () => {
      const next = vi.fn() as unknown as NextFunction;
      const res = makeRes();
      requireApiAuth(makeReq(SECRET), res, next);
      expect(res.statusCode).toBe(401);
    });

    it('does not echo the provided credential in the response', () => {
      const next = vi.fn() as unknown as NextFunction;
      const res = makeRes();
      requireApiAuth(makeReq('Bearer super-secret-guess'), res, next);
      expect(JSON.stringify(res.body)).not.toContain('super-secret-guess');
    });
  });

  describe('tma scheme (Telegram Mini App)', () => {
    it('calls next() for signed initData from the owner', () => {
      const next = vi.fn() as unknown as NextFunction;
      const res = makeRes();
      requireApiAuth(makeReq(`tma ${signInitData(OWNER_ID)}`), res, next);
      expect(next).toHaveBeenCalledOnce();
      expect(res.statusCode).toBeNull();
    });

    it('tolerates whitespace around TELEGRAM_CHAT_ID', () => {
      // A pasted Vercel value picks up a trailing newline or space easily, and
      // without the trim every Mini App request 401s with "not the owner" while
      // the dashboard shows the id looking correct. Nothing asserted the trim.
      // Found by mutation testing.
      process.env['TELEGRAM_CHAT_ID'] = ` ${String(OWNER_ID)}\n`;
      const next = vi.fn() as unknown as NextFunction;
      const res = makeRes();
      requireApiAuth(makeReq(`tma ${signInitData(OWNER_ID)}`), res, next);
      expect(next).toHaveBeenCalledOnce();
      expect(res.statusCode).toBeNull();
    });

    it('rejects a valid signature from a different Telegram user', () => {
      // The signature proves the launch came from Telegram, not that it came
      // from the owner. Anyone can open the bot's menu button.
      const next = vi.fn() as unknown as NextFunction;
      const res = makeRes();
      requireApiAuth(makeReq(`tma ${signInitData(OWNER_ID + 1)}`), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    it('rejects unsigned or tampered initData', () => {
      const next = vi.fn() as unknown as NextFunction;
      const res = makeRes();
      requireApiAuth(makeReq('tma auth_date=1&user=%7B%22id%22%3A42%7D&hash=deadbeef'), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    it('rejects the shared secret presented under the tma scheme', () => {
      const next = vi.fn() as unknown as NextFunction;
      const res = makeRes();
      requireApiAuth(makeReq(`tma ${SECRET}`), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    it('rejects with 401, not 503, when the bot token is unset', () => {
      // The Bearer scheme is unaffected and the gate is still shut, so this is
      // an unusable credential rather than an unconfigured server.
      delete process.env['TELEGRAM_BOT_TOKEN'];
      const next = vi.fn() as unknown as NextFunction;
      const res = makeRes();
      requireApiAuth(makeReq(`tma ${signInitData(OWNER_ID)}`), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    it('does not echo the provided initData in the response', () => {
      const next = vi.fn() as unknown as NextFunction;
      const res = makeRes();
      const initData = signInitData(OWNER_ID + 1);
      requireApiAuth(makeReq(`tma ${initData}`), res, next);
      expect(JSON.stringify(res.body)).not.toContain(initData);
    });
  });

  it('fails CLOSED with 503 when API_SHARED_SECRET is unset', () => {
    delete process.env['API_SHARED_SECRET'];
    const next = vi.fn() as unknown as NextFunction;
    const res = makeRes();
    requireApiAuth(makeReq(`Bearer ${SECRET}`), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
  });

  it('fails CLOSED with 503 for a valid tma credential too', () => {
    // The shared secret is what holds the door shut; an unconfigured server must
    // not be reachable through the second scheme either.
    delete process.env['API_SHARED_SECRET'];
    const next = vi.fn() as unknown as NextFunction;
    const res = makeRes();
    requireApiAuth(makeReq(`tma ${signInitData(OWNER_ID)}`), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
  });
});
