import { describe, expect, it } from 'vitest';
import { geocodeKindLabel } from './geocodeCopy.js';

describe('geocodeKindLabel', () => {
  it('maps a park and a town to distinct plain-language labels — issue #82', () => {
    expect(geocodeKindLabel('PRK')).toBe('Park');
    expect(geocodeKindLabel('PPL')).toBe('Town');
    expect(geocodeKindLabel('DAM')).toBe('Dam');
  });

  it('returns null, never the raw code, for an unmapped feature code', () => {
    expect(geocodeKindLabel('XYZQQ')).toBeNull();
  });

  it('returns null for a null code', () => {
    expect(geocodeKindLabel(null)).toBeNull();
  });
});
