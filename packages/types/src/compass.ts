/**
 * Degrees to a 16-point compass name.
 *
 * Moved here from `apps/api/src/lib/telegram/forecastTable.ts` when the Mini
 * App's wall strip needed the same conversion. Two copies of this would read
 * the same to a reviewer and drift on the first rounding change — `NNE` and
 * `NE` differ by 22.5°, so a wall could be named one thing by the bot and
 * another by the app for the same stored bearing.
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
