import {
  DRYNESS_LABEL,
  FRICTION_LABEL,
  SCORE_BANDS,
  summarizeReadings,
  type ConditionsScore,
  type FrictionLevel,
  type HourlyReading,
  type Location,
  type ReadingField,
  type ReadingsSummary,
  type RockLevel,
  type WeatherAlert,
} from '@weatherteam6/types'
import type { ToneName } from '../theme/styles.js'
import { severeAlertEvent } from './forecast.js'

/**
 * The list screen's logic, apart from its markup: what a card says, what colour
 * each reading wears, and what order the cards come in.
 *
 * **One summary for the card and the sort.** Sorting by score reads the same
 * `summarizeReadings` output the card prints, so the order can never be decided
 * by a number the card is withholding — a crag under a Severe+ warning has no
 * score on its card, and it must not rise to the top of the list on the
 * strength of the one it is not showing.
 */

/**
 * The readings a list card prints, or `null` when it prints none.
 *
 * `conditions` is `undefined` both while the query is in flight and for a
 * non-climbing location, whose conditions are never asked for. `readings`
 * absent from a settled response is an API older than this client, not a model
 * with nothing to say — the card shows nothing rather than an invented reason.
 *
 * The readings do not wait for alerts and the **number** does: `severeAlertEvent`
 * answers null for a query in flight exactly as it does for "no alert", so
 * `alertsPending` travels with it. An alerts *error* has settled with no data,
 * and nothing is suppressed.
 */
export function cardSummary(
  conditions: ConditionsScore | null | undefined,
  alerts: readonly WeatherAlert[] | undefined,
  alertsPending: boolean,
): ReadingsSummary | null {
  const readings = conditions?.readings
  if (readings === undefined) return null
  return summarizeReadings({
    reading: readings.now,
    window: readings.today?.window ?? null,
    utcOffsetSeconds: readings.utc_offset_seconds,
    severeAlertEvent: severeAlertEvent(alerts),
    alertsPending,
    unavailableReason: readings.unavailable_reason,
  })
}

/** Which rung of the status ladder a reading sits on. Colour only — the word is printed too. */
export type Tone = ToneName

const ROCK_TONE: Record<RockLevel, Tone> = { dry: 'good', drying: 'fair', wet: 'poor' }
const FRICTION_TONE: Record<FrictionLevel, Tone> = {
  great: 'good',
  good: 'good',
  fair: 'fair',
  poor: 'poor',
}

/**
 * The tone for one of `summary.readings`, from the level it was worded from.
 *
 * Keyed on the shared label constants, so a field this does not recognise gets
 * `null` — drawn neutral — rather than borrowing another reading's colour.
 */
export function readingTone(field: ReadingField, reading: HourlyReading | null): Tone | null {
  if (reading === null) return null
  if (field.label === DRYNESS_LABEL && reading.rock !== null) return ROCK_TONE[reading.rock.level]
  if (field.label === FRICTION_LABEL && reading.friction !== null) {
    return FRICTION_TONE[reading.friction.level]
  }
  return null
}

/**
 * The tone for a score, on the same `SCORE_BANDS` rungs `scoreColor` uses for
 * the daily bars — so a crag's badge here and its bar on the detail screen
 * cannot disagree about which colour 58 is.
 */
export function scoreTone(score: number): Tone {
  if (score >= SCORE_BANDS.mostlyDry) return 'good'
  if (score >= SCORE_BANDS.mixed) return 'fair'
  return 'poor'
}

export type SortMode ='score' | 'name' | 'added'

export const SORT_OPTIONS: readonly { value: SortMode; label: string }[] = [
  { value: 'score', label: 'Score' },
  { value: 'name', label: 'Name' },
  { value: 'added', label: 'Added' },
]

export function isSortMode(value: unknown): value is SortMode {
  return SORT_OPTIONS.some((o) => o.value === value)
}

/**
 * The cards in the chosen order. Never mutates `locations`.
 *
 * - `added` is the API's own order.
 * - `name` is alphabetical in the reader's locale, ignoring case.
 * - `score` is highest first. **A location with no score goes last, in its
 *   added order** — a city, a withheld number and one still loading are all
 *   "nothing to rank by", and ranking them as 0 would put a crag nobody could
 *   read below one that reads as hopeless.
 *
 * `scores === null` means the scores have not all settled, and the list keeps
 * its added order until they have. Re-sorting as each card's answer lands
 * reshuffles the list under the reader's thumb.
 */
export function sortLocations(
  locations: readonly Location[],
  mode: SortMode,
  scores: ReadonlyMap<string, number | null> | null,
): Location[] {
  const out = [...locations]
  if (mode === 'name') {
    return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }
  if (mode === 'score' && scores !== null) {
    // `Array.prototype.sort` is stable, so ties and the unscored tail keep the
    // added order without a second key.
    return out.sort((a, b) => {
      const sa = scores.get(a.id) ?? null
      const sb = scores.get(b.id) ?? null
      if (sa === null && sb === null) return 0
      if (sa === null) return 1
      if (sb === null) return -1
      return sb - sa
    })
  }
  return out
}
