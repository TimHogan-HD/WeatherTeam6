import type { RockType } from '@weatherteam6/types'

/**
 * Re-exported because this module's own copy of the union was the original
 * source of the drift `ROCK_TYPES` now prevents, and several callers import
 * `RockType` from here. It is an alias now, not a second definition.
 */
export type { RockType }

export { MIN_HOURS, MAX_HOURS } from '@weatherteam6/types'
