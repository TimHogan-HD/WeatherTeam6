/**
 * Degrees to a 16-point compass name.
 *
 * Shared rather than per-surface. Two copies of this would read the same to a
 * reviewer and drift on the first rounding change — `NNE` and `NE` differ by
 * 22.5°, so the same stored bearing could be named two things on two screens.
 */

/** 16-point compass. `null` is a gap; 0° is due north and a real reading. */
export const COMPASS_POINTS = [
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
  return COMPASS_POINTS[index] ?? null;
}

export type CompassPoint = (typeof COMPASS_POINTS)[number];

export function isCompassPoint(v: unknown): v is CompassPoint {
  return typeof v === 'string' && (COMPASS_POINTS as readonly string[]).includes(v);
}

/**
 * A compass name to degrees, **or null for anything that is not one of the 16**.
 *
 * Deliberately not `aspectToDegrees`, which answers 180 for text it does not
 * recognise. That default is harmless where nothing reads the result (the
 * five-component scorer's dead `aspectDegrees`) and is a fabricated south face
 * wherever something does — the solar geometry in `rockThermal` would treat a
 * typo as a recorded sun-facing wall. Exact multiples of 22.5°, where
 * `ASPECT_MAP` truncates `NNE` to 22.
 */
export function compassDegrees(point: string | null): number | null {
  if (point === null) return null;
  const index = (COMPASS_POINTS as readonly string[]).indexOf(point.trim().toUpperCase());
  return index === -1 ? null : index * 22.5;
}
