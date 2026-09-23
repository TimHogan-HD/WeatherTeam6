import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { requireApiAuth } from './apiAuth.js';
import { expiryFrom, signToken } from '../lib/auth/token.js';

const SECRET = 'test-secret-value';
const TOKEN_SECRET = 'test-token-signing-secret';
const DEFAULT_USER_ID = '00000000-0000-0000-0000-000000000001';
/** A second, unrelated user — the one Bearer must never resolve to. */
const OTHER_USER_ID = '00000000-0000-0000-0000-0000000000bb';

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

/** A session token for `sub`, valid for the next 30 days. */
function sessionFor(sub: string, secret = TOKEN_SECRET): string {
  return signToken({ sub, exp: expiryFrom() }, secret);
}

describe('requireApiAuth', () => {
  const originalEnv = {
    secret: process.env['API_SHARED_SECRET'],
    tokenSecret: process.env['AUTH_TOKEN_SECRET'],
    defaultUser: process.env['DEFAULT_USER_ID'],
  };

  beforeEach(() => {
    process.env['API_SHARED_SECRET'] = SECRET;
    process.env['AUTH_TOKEN_SECRET'] = TOKEN_SECRET;
    process.env['DEFAULT_USER_ID'] = DEFAULT_USER_ID;
  });

  afterEach(() => {
    for (const [key, value] of [
      ['API_SHARED_SECRET', originalEnv.secret],
      ['AUTH_TOKEN_SECRET', originalEnv.tokenSecret],
      ['DEFAULT_USER_ID', originalEnv.defaultUser],
    ] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  describe('Bearer scheme (server-side callers)', () => {
    it('calls next() for a correct Bearer token, acting as DEFAULT_USER_ID', () => {
      // resolveUser is deleted with the Telegram webhook, so this middleware is
      // the only thing anywhere that sets req.userId. If it stops, every route
      // queries with `undefined` through a type that says it cannot be —
      // defect class 8, no type error and no test failure without this line.
      const next = vi.fn() as unknown as NextFunction;
      const res = makeRes();
      const req = makeReq(`Bearer ${SECRET}`);
      requireApiAuth(req, res, next);
      expect(next).toHaveBeenCalledOnce();
      expect(res.statusCode).toBeNull();
      expect(req.userId).toBe(DEFAULT_USER_ID);
    });

    it('answers 500, not 401, when DEFAULT_USER_ID is unset', () => {
      // An authenticated caller reaching a server with no owner identity is a
      // misconfigured server, not a bad credential — and continuing silently
      // would hand every route `undefined`.
      delete process.env['DEFAULT_USER_ID'];
      const next = vi.fn() as unknown as NextFunction;
      const res = makeRes();
      const req = makeReq(`Bearer ${SECRET}`);
      requireApiAuth(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(500);
      expect(req.userId).toBeUndefined();
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

  describe('the deleted tma scheme', () => {
    /**
     * **What these two do and do not constrain.**
     *
     * They pin the user-facing property — a `tma` credential buys no access —
     * and that is worth keeping, because it is the one an outsider can test.
     *
     * They do **not** detect the branch being re-added: `initDataAccepted` would
     * reject both of these payloads with the same 401, and the middleware
     * deliberately never tells the caller which half was wrong, so the response
     * is identical either way. Claiming otherwise would be defect class 11 in
     * this file rather than in the code.
     *
     * The guard against revival is mechanical and lives elsewhere:
     * `lib/telegram/initData.ts` is deleted, so a restored branch does not
     * compile.
     */
    it('401s a tma credential rather than resolving it to a user', () => {
      const next = vi.fn() as unknown as NextFunction;
      const res = makeRes();
      const req = makeReq('tma auth_date=1&user=%7B%22id%22%3A42%7D&hash=deadbeef');
      requireApiAuth(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(req.userId).toBeUndefined();
    });

    it('does not accept the shared secret under the tma scheme', () => {
      // The credential is real; the scheme is not. This one *would* have failed
      // before the deletion for a different reason (invalid initData), so it is
      // a statement about the scheme, not about the branch.
      const next = vi.fn() as unknown as NextFunction;
      const res = makeRes();
      requireApiAuth(makeReq(`tma ${SECRET}`), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });
  });

  describe('Session scheme (a logged-in user)', () => {
    it('calls next() and sets req.userId to the TOKEN subject, not DEFAULT_USER_ID', () => {
      // This single line is what makes the API multi-user. Every route scopes
      // its query by req.userId, so if this fell back to DEFAULT_USER_ID every
      // partner would see the owner's crags — and every test above would still
      // pass.
      const next = vi.fn() as unknown as NextFunction;
      const res = makeRes();
      const req = makeReq(`Session ${sessionFor(OTHER_USER_ID)}`);
      requireApiAuth(req, res, next);
      expect(next).toHaveBeenCalledOnce();
      expect(res.statusCode).toBeNull();
      expect(req.userId).toBe(OTHER_USER_ID);
      expect(req.userId).not.toBe(DEFAULT_USER_ID);
    });

    it('does not need DEFAULT_USER_ID to be set at all', () => {
      // A session carries its own identity. Coupling it to DEFAULT_USER_ID
      // would make a real user's login depend on an owner-only variable.
      delete process.env['DEFAULT_USER_ID'];
      const next = vi.fn() as unknown as NextFunction;
      const res = makeRes();
      const req = makeReq(`Session ${sessionFor(OTHER_USER_ID)}`);
      requireApiAuth(req, res, next);
      expect(next).toHaveBeenCalledOnce();
      expect(req.userId).toBe(OTHER_USER_ID);
    });

    it('accepts a lowercase scheme and surrounding whitespace', () => {
      const next = vi.fn() as unknown as NextFunction;
      const req = makeReq(`  session   ${sessionFor(OTHER_USER_ID)}  `);
      requireApiAuth(req, makeRes(), next);
      expect(next).toHaveBeenCalledOnce();
      expect(req.userId).toBe(OTHER_USER_ID);
    });

    it('rejects a token signed with a different secret', () => {
      const next = vi.fn() as unknown as NextFunction;
      const res = makeRes();
      const req = makeReq(`Session ${sessionFor(OTHER_USER_ID, 'not-the-server-secret')}`);
      requireApiAuth(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(req.userId).toBeUndefined();
    });

    it('rejects an expired token', () => {
      const expired = signToken(
        { sub: OTHER_USER_ID, exp: Math.floor(Date.now() / 1000) - 1 },
        TOKEN_SECRET,
      );
      const next = vi.fn() as unknown as NextFunction;
      const res = makeRes();
      requireApiAuth(makeReq(`Session ${expired}`), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    it('rejects a token whose payload was edited after signing', () => {
      const [payload, signature] = sessionFor(OTHER_USER_ID).split('.');
      const forged = Buffer.from(
        JSON.stringify({ sub: DEFAULT_USER_ID, exp: expiryFrom() }),
        'utf8',
      ).toString('base64url');
      const next = vi.fn() as unknown as NextFunction;
      const res = makeRes();
      const req = makeReq(`Session ${forged}.${String(signature)}`);
      requireApiAuth(req, res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
      expect(req.userId).toBeUndefined();
      // The unused first segment is only destructured to show what was kept.
      expect(payload).not.toBe(forged);
    });

    it('rejects the shared secret presented under the Session scheme', () => {
      const next = vi.fn() as unknown as NextFunction;
      const res = makeRes();
      requireApiAuth(makeReq(`Session ${SECRET}`), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    it('does not fall through to the Bearer branch when the token is bad', () => {
      // Scheme dispatch must be exclusive. A Session credential that fails has
      // to be a rejection, not an invitation to try the next scheme with the
      // same string.
      const next = vi.fn() as unknown as NextFunction;
      const res = makeRes();
      requireApiAuth(makeReq(`Session garbage`), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(401);
    });

    it('does not echo the provided token in the response', () => {
      const next = vi.fn() as unknown as NextFunction;
      const res = makeRes();
      const token = sessionFor(OTHER_USER_ID, 'not-the-server-secret');
      requireApiAuth(makeReq(`Session ${token}`), res, next);
      expect(JSON.stringify(res.body)).not.toContain(token);
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

  it('fails CLOSED with 503 for a valid Session token too', () => {
    delete process.env['API_SHARED_SECRET'];
    const next = vi.fn() as unknown as NextFunction;
    const res = makeRes();
    requireApiAuth(makeReq(`Session ${sessionFor(OTHER_USER_ID)}`), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
  });

  it('fails CLOSED with 503 when AUTH_TOKEN_SECRET is unset, on EVERY scheme', () => {
    // The whole point of checking both secrets before the scheme is read: a
    // half-configured server must not be reachable through the schemes that do
    // not happen to need the missing one. Without the Bearer case here, an
    // unset signing key would leave the owner path wide open and look fine.
    delete process.env['AUTH_TOKEN_SECRET'];
    for (const header of [
      `Bearer ${SECRET}`,
      `Session ${signToken({ sub: OTHER_USER_ID, exp: expiryFrom() }, TOKEN_SECRET)}`,
      undefined,
    ]) {
      const next = vi.fn() as unknown as NextFunction;
      const res = makeRes();
      requireApiAuth(makeReq(header), res, next);
      expect(next).not.toHaveBeenCalled();
      expect(res.statusCode).toBe(503);
    }
  });
});
