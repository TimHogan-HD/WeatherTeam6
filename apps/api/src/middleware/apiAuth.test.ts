import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { requireApiAuth } from './apiAuth.js';

const SECRET = 'test-secret-value';

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

describe('requireApiAuth', () => {
  const original = process.env['API_SHARED_SECRET'];

  beforeEach(() => {
    process.env['API_SHARED_SECRET'] = SECRET;
  });

  afterEach(() => {
    if (original === undefined) delete process.env['API_SHARED_SECRET'];
    else process.env['API_SHARED_SECRET'] = original;
  });

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

  it('rejects a non-Bearer scheme with 401', () => {
    const next = vi.fn() as unknown as NextFunction;
    const res = makeRes();
    requireApiAuth(makeReq(`tma ${SECRET}`), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('rejects the bare secret with no scheme', () => {
    const next = vi.fn() as unknown as NextFunction;
    const res = makeRes();
    requireApiAuth(makeReq(SECRET), res, next);
    expect(res.statusCode).toBe(401);
  });

  it('fails CLOSED with 503 when API_SHARED_SECRET is unset', () => {
    delete process.env['API_SHARED_SECRET'];
    const next = vi.fn() as unknown as NextFunction;
    const res = makeRes();
    requireApiAuth(makeReq(`Bearer ${SECRET}`), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(503);
  });

  it('does not echo the provided credential in the response', () => {
    const next = vi.fn() as unknown as NextFunction;
    const res = makeRes();
    requireApiAuth(makeReq('Bearer super-secret-guess'), res, next);
    expect(JSON.stringify(res.body)).not.toContain('super-secret-guess');
  });
});
