import { describe, expect, it } from 'vitest';
import {
  EM_DASH,
  cToF,
  formatHumidity,
  formatPrecipIn,
  formatTempF,
  formatWindMph,
  kmhToMph,
  mmToIn,
} from './units.js';

describe('unit conversion', () => {
  it('converts the fixed points', () => {
    expect(cToF(0)).toBe(32);
    expect(cToF(100)).toBe(212);
    expect(cToF(39.5)).toBeCloseTo(103.1, 1);
    expect(kmhToMph(0)).toBe(0);
    expect(kmhToMph(100)).toBeCloseTo(62.14, 2);
    expect(mmToIn(25.4)).toBe(1);
  });
});

describe('formatters — the null cases are the point', () => {
  // A naive formatter renders 32°F and 0 mph for missing data, which reads as a
  // real measurement. Every one of these fields is nullable in ForecastSnapshot.
  it('renders an em dash for null rather than a plausible value', () => {
    expect(formatTempF(null)).toBe(EM_DASH);
    expect(formatWindMph(null)).toBe(EM_DASH);
    expect(formatHumidity(null)).toBe(EM_DASH);
    expect(formatPrecipIn(null)).toBe(EM_DASH);
  });

  it('does not confuse a real zero with a missing value', () => {
    expect(formatTempF(0)).toBe('32°F');
    expect(formatWindMph(0)).toBe('0 mph');
    expect(formatHumidity(0)).toBe('0%');
    expect(formatPrecipIn(0)).toBe('0 in');
  });

  it('formats real readings with their units attached', () => {
    expect(formatTempF(39.5)).toBe('103°F');
    expect(formatWindMph(34)).toBe('21 mph');
    expect(formatHumidity(17.4)).toBe('17%');
  });

  it('renders sub-hundredth precipitation as trace, not 0.00 in', () => {
    // 0.2 mm already docks the rain component; "0.00 in" next to a reduced
    // score contradicts the rule that weather explains the score.
    expect(formatPrecipIn(0.2)).toBe('trace');
    expect(formatPrecipIn(0.25)).toBe('trace');
    expect(formatPrecipIn(0.254)).toBe('0.01 in');
    expect(formatPrecipIn(12.7)).toBe('0.50 in');
  });

  it('rounds negative temperatures away from zero the same way', () => {
    expect(formatTempF(-17.8)).toBe('0°F');
    expect(formatTempF(-20)).toBe('-4°F');
  });
});
