import { describe, expect, it } from 'vitest';
import { isSevereAlert, seamlessModelName } from './conditionsCopy.js';

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

describe('seamlessModelName', () => {
  // HRRR's last hour; the boundary hour itself is HRRR's (or the blend), the next is GFS's.
  const through = '2026-11-12T23:00:00Z';

  it('names HRRR for a span ending at or before the last HRRR hour', () => {
    expect(seamlessModelName('gfs_seamless', through, '2026-11-12T07:00:00Z', through)).toBe('HRRR');
    expect(seamlessModelName('gfs_seamless', through, through, through)).toBe('HRRR');
  });

  it('names GFS for a span starting after it, and both for a span across it', () => {
    expect(seamlessModelName('gfs_seamless', through, '2026-11-13T00:00:00Z', '2026-11-13T06:00:00Z')).toBe('GFS');
    expect(seamlessModelName('gfs_seamless', through, '2026-11-12T22:00:00Z', '2026-11-13T00:00:00Z')).toBe('HRRR, then GFS');
  });

  it('falls back to the id\'s own name when HRRR\'s reach is unknown or the model is not seamless', () => {
    const at = '2026-11-12T07:00:00Z';
    expect(seamlessModelName('gfs_seamless', null, at, at)).toBe('GFS');
    expect(seamlessModelName('gfs_seamless', undefined, at, at)).toBe('GFS');
    expect(seamlessModelName('gfs_seamless', 'not a date', at, at)).toBe('GFS');
    expect(seamlessModelName('gfs_seamless', through, '', '')).toBe('GFS');
    expect(seamlessModelName('ecmwf_ifs025', through, at, at)).toBe('ECMWF');
  });
});
