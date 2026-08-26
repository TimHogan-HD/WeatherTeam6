/**
 * The five conditions-score components and their maximum point values.
 *
 * Its own module rather than a member of `index.ts` so that `conditionsCopy.ts`
 * can import it without a cycle through the barrel that re-exports them both.
 * Re-exported from `index.ts`, so every existing import path still resolves.
 */
export const SCORE_COMPONENT_MAX = {
  drying: 40,
  rain: 25,
  wind: 15,
  temp: 12,
  humidity: 8,
} as const;

export type ScoreComponentName = keyof typeof SCORE_COMPONENT_MAX;
