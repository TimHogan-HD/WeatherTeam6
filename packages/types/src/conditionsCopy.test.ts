import { describe, expect, it } from 'vitest';
import { isSevereAlert } from './conditionsCopy.js';

describe('isSevereAlert', () => {
  it('accepts Severe and Extreme in any casing, and nothing below them', () => {
    expect(isSevereAlert('Severe')).toBe(true);
    expect(isSevereAlert('extreme')).toBe(true);
    expect(isSevereAlert(' Extreme ')).toBe(true);
    expect(isSevereAlert('Moderate')).toBe(false);
    expect(isSevereAlert('Minor')).toBe(false);
    expect(isSevereAlert('Unknown')).toBe(false);
  });
});
