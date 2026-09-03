import { describe, expect, it } from 'vitest'
import type { GeocodeResult } from '@weatherteam6/types'
import { placeSubtitle } from './AddLocation.js'

const BASE: GeocodeResult = {
  id: 1,
  name: 'Willow River',
  lat: 0,
  lon: 0,
  elevation_m: null,
  admin1: 'Wisconsin',
  country: 'United States',
  timezone: null,
  feature_code: null,
}

describe('placeSubtitle', () => {
  it('leads with the kind when the feature code maps to one — issue #82', () => {
    // The Willow River town and Willow River State Park picker rows must not
    // render identically; the kind is what tells them apart.
    expect(placeSubtitle({ ...BASE, feature_code: 'PRK' })).toBe('Park · Wisconsin, United States')
    expect(placeSubtitle({ ...BASE, feature_code: 'PPL', admin1: 'Minnesota' })).toBe(
      'Town · Minnesota, United States',
    )
  })

  it('falls back to admin1/country alone when the code is unmapped or absent', () => {
    expect(placeSubtitle({ ...BASE, feature_code: null })).toBe('Wisconsin, United States')
    expect(placeSubtitle({ ...BASE, feature_code: 'XYZQQ' })).toBe('Wisconsin, United States')
  })

  it('falls back to the kind alone when admin1 and country are both absent', () => {
    expect(
      placeSubtitle({ ...BASE, feature_code: 'PRK', admin1: null, country: null }),
    ).toBe('Park')
  })

  it('is empty when there is neither a kind nor a place', () => {
    expect(placeSubtitle({ ...BASE, feature_code: null, admin1: null, country: null })).toBe('')
  })
})
