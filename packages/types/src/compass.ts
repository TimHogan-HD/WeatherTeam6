/**
 * Degrees to a 16-point compass name.
 *
 * Shared rather than per-surface. Two copies of this would read the same to a
 * reviewer and drift on the first rounding change — `NNE` and `NE` differ by
 * 22.5°, so the same stored bearing could be named two things on two screens.
 */

/** 16-point compass. `null` is a gap; 0° is due north and a real reading. */
const COMPASS = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
] as const;

export function compassPoint(deg: number | null): string | null {
  if (deg === null || !Number.isFinite(deg)) return null;
  const index = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS[index] ?? null;
}
