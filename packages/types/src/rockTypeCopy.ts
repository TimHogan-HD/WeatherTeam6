import type { RockType } from './index.js'

/**
 * How a rock type is written for a person.
 *
 * **This exists because `basalt` stopped being one word.** Two surfaces rendered
 * the raw column — `DryingCard` as "{rock_type} still drying" and
 * `LocationIdentity` as `capitalise(rock_type)` — which was passable while every
 * value was a single lowercase word and produces "basalt_vesicular still drying"
 * and "Basalt_dense" the moment one is not. Same rule as `placeSubtitle` in
 * `geocodeCopy.ts`: one implementation, so the two cannot drift.
 *
 * The parenthetical is the *observable* distinction, not the petrology. A climber
 * is looking at a wall, and "columnar" and "flow top" are what they can see;
 * "0.1-1.0% porosity" is why it matters and belongs in the research document, not
 * on a chip.
 */
const LABELS: Record<RockType, string> = {
  granite: 'Granite',
  basalt_dense: 'Basalt (columnar)',
  limestone: 'Limestone',
  basalt: 'Basalt',
  basalt_vesicular: 'Basalt (flow top)',
  sandstone: 'Sandstone',
  unknown: 'Unknown',
}

/**
 * The display name for a rock type.
 *
 * Falls back to the raw value rather than to a dash or an empty string: an
 * unrecognised value here means a column holds something this build does not
 * know, and showing it is how that gets noticed. A row written by a newer deploy
 * degrades to "basalt_something" rather than vanishing.
 */
export function rockTypeLabel(rockType: string): string {
  return LABELS[rockType as RockType] ?? rockType
}

/**
 * The same label, lowercased for mid-sentence use — "basalt (flow top) still
 * drying".
 *
 * Not `toLowerCase()` at each call site, because that is the kind of thing one
 * caller does and the other forgets.
 */
export function rockTypeLabelInline(rockType: string): string {
  return rockTypeLabel(rockType).toLowerCase()
}
