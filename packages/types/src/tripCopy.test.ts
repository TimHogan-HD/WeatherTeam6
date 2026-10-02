import { describe, expect, it } from 'vitest';
import { agreementShare, rainChanceShare } from './tripCopy.js';

describe('agreementShare', () => {
  it('is the majority side, whichever side that is', () => {
    expect(agreementShare({ members_wet: 9, member_count: 50 })).toBe(41 / 50);
    expect(agreementShare({ members_wet: 41, member_count: 50 })).toBe(41 / 50);
  });

  it('is one half at an even split and one when every run agrees', () => {
    expect(agreementShare({ members_wet: 25, member_count: 50 })).toBe(0.5);
    expect(agreementShare({ members_wet: 0, member_count: 50 })).toBe(1);
    expect(agreementShare({ members_wet: 50, member_count: 50 })).toBe(1);
  });

  it('is withheld when the wet count is unknown or no member reached the day', () => {
    expect(agreementShare({ members_wet: null, member_count: 50 })).toBeNull();
    expect(agreementShare({ members_wet: 0, member_count: 0 })).toBeNull();
  });
});

describe('rainChanceShare', () => {
  it('is the share of members wet, and unknown rather than zero without a count', () => {
    expect(rainChanceShare({ members_wet: 9, member_count: 50 })).toBe(0.18);
    expect(rainChanceShare({ members_wet: null, member_count: 50 })).toBeNull();
    expect(rainChanceShare({ members_wet: 0, member_count: 0 })).toBeNull();
  });
});
