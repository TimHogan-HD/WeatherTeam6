import { describe, expect, it } from 'vitest';
import { geocodeKindLabel, placeSubtitle } from './geocodeCopy.js';

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

const BASE = {
  admin1: 'Wisconsin',
  country: 'United States',
  feature_code: null as string | null,
};

describe('placeSubtitle', () => {
  it('leads with the kind when the feature code maps to one — issue #82', () => {
    // The Willow River town and Willow River State Park picker rows must not
    // render identically; the kind is what tells them apart.
    expect(placeSubtitle({ ...BASE, feature_code: 'PRK' })).toBe('Park · Wisconsin, United States');
    expect(placeSubtitle({ ...BASE, feature_code: 'PPL', admin1: 'Minnesota' })).toBe(
      'Town · Minnesota, United States',
    );
  });

  it('falls back to admin1/country alone when the code is unmapped or absent', () => {
    expect(placeSubtitle({ ...BASE, feature_code: null })).toBe('Wisconsin, United States');
    expect(placeSubtitle({ ...BASE, feature_code: 'XYZQQ' })).toBe('Wisconsin, United States');
  });

  it('falls back to the kind alone when admin1 and country are both absent', () => {
    expect(placeSubtitle({ ...BASE, feature_code: 'PRK', admin1: null, country: null })).toBe('Park');
  });

  it('is empty when there is neither a kind nor a place', () => {
    expect(placeSubtitle({ ...BASE, feature_code: null, admin1: null, country: null })).toBe('');
  });
});

describe('placeSubtitle — a climbing area', () => {
  it('names the kind, the climb count, the parent and the source', () => {
    expect(
      placeSubtitle({
        admin1: 'Minnesota',
        country: 'United States',
        feature_code: null,
        climbing_area: { climbs: 42, parent: 'He Mni Can - Barn Bluff (Red Wing)' },
      }),
    ).toBe('Climbing area · 42 climbs · He Mni Can - Barn Bluff (Red Wing) · Minnesota, United States · OpenBeta')
  })

  it('omits a missing parent and says "climb" for one', () => {
    expect(
      placeSubtitle({ admin1: 'Minnesota', country: 'United States', feature_code: 'PPL', climbing_area: { climbs: 1, parent: null } }),
    ).toBe('Climbing area · 1 climb · Minnesota, United States · OpenBeta')
  })
})
