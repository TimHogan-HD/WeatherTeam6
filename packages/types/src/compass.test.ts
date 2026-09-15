import { describe, expect, it } from 'vitest';
import { compassPoint } from './compass.js';

/**
 * Moved here with the function, from `apps/api`'s forecast table. The bot and
 * the Mini App now name the same bearing from one implementation.
 */

describe('compassPoint', () => {
  it('reads due north as a real direction rather than a missing one', () => {
    // 0 is falsy, and a truthiness check here would render north as a gap.
    expect(compassPoint(0)).toBe('N')
  })

  it('wraps at 360 and rounds to the nearest of sixteen', () => {
    expect(compassPoint(359)).toBe('N')
    expect(compassPoint(202.5)).toBe('SSW')
    expect(compassPoint(-90)).toBe('W')
  })

  it('has no direction for a missing reading', () => {
    expect(compassPoint(null)).toBeNull()
    expect(compassPoint(Number.NaN)).toBeNull()
  })
})
