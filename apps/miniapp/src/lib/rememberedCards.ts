import type { ConditionsScore, ForecastSnapshot, WeatherAlert } from '@weatherteam6/types'

/**
 * The weather the list's cards last showed on this device, so a reopen draws
 * them at once — labelled with their age and dimmed — while the live copies
 * load (owner decision 2026-10-01: a last-seen score, with its age, may stand
 * for a moment rather than a splash).
 *
 * **A card is remembered whole or not at all.** Forecast, conditions and alerts
 * are swapped for the live ones together, so a card never prints a score
 * suppressed by one moment's alerts and computed from another moment's
 * conditions. The score it shows is the one the card printed at `savedAt`.
 *
 * **It is a placeholder, never cache data**, like `rememberedLocations`: the
 * crag screen never sees it. Stored on the phone, not in the database.
 * Forgotten whenever the token goes (`App.tsx`).
 */
export type RememberedCard = {
  forecast: ForecastSnapshot[]
  /** `null` for a place that is not a crag, and for the 200-with-null answer. */
  conditions: ConditionsScore | null
  alerts: WeatherAlert[]
}

export type RememberedCards = {
  /** The oldest fetch among the cards saved, so the age printed is never flattering. */
  savedAt: number
  cards: Record<string, RememberedCard>
}

/**
 * A judgement call. Past it, an alert or a front could have moved since, and
 * the splash and grey cards are the honest wait. Twelve hours keeps a morning's
 * look good for the evening's.
 */
export const REMEMBERED_CARDS_MAX_AGE_MS = 12 * 60 * 60 * 1000

const STORAGE_KEY = 'wt6.cards'

/**
 * Whether a snapshot saved at `savedAt` may still be drawn at `now`. Never one
 * from another day on this device: the server's `is_today` was yesterday's, and
 * the card would print yesterday's figures as today's. The device's day stands
 * in for each crag's — the crags and the phone share a timezone in practice,
 * and a mismatch costs only the instant draw.
 */
export function isUsable(savedAt: number, now: number): boolean {
  if (savedAt > now) return false
  if (now - savedAt > REMEMBERED_CARDS_MAX_AGE_MS) return false
  return new Date(savedAt).toDateString() === new Date(now).toDateString()
}

type Answer<T> = { data: T | undefined; dataUpdatedAt: number }

export type CardAnswers = {
  id: string
  isClimbingLocation: boolean
  forecast: Answer<ForecastSnapshot[]>
  conditions: Answer<ConditionsScore | null>
  alerts: Answer<WeatherAlert[]>
}

/**
 * The cards worth remembering from the list's live answers: each one with all
 * three in hand. A card with a failed call is left out rather than saved with a
 * gap — next time it waits for its weather like a new card. `null` when no card
 * qualifies.
 */
export function snapshotCards(answers: readonly CardAnswers[]): RememberedCards | null {
  const cards: Record<string, RememberedCard> = {}
  let savedAt = Infinity
  for (const a of answers) {
    const forecast = a.forecast.data
    const alerts = a.alerts.data
    const conditions = a.isClimbingLocation ? a.conditions.data : null
    if (forecast === undefined || alerts === undefined || conditions === undefined) continue
    cards[a.id] = { forecast, conditions, alerts }
    const fetched = [a.forecast, a.alerts, ...(a.isClimbingLocation ? [a.conditions] : [])]
    for (const f of fetched) savedAt = Math.min(savedAt, f.dataUpdatedAt)
  }
  return savedAt === Infinity ? null : { savedAt, cards }
}

export function rememberedCards(now: number): RememberedCards | undefined {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === null) return undefined
    const parsed = JSON.parse(raw) as Partial<RememberedCards> | null
    if (typeof parsed?.savedAt !== 'number' || typeof parsed.cards !== 'object' || parsed.cards === null) {
      return undefined
    }
    return isUsable(parsed.savedAt, now) ? { savedAt: parsed.savedAt, cards: parsed.cards } : undefined
  } catch {
    return undefined
  }
}

export function rememberCards(snapshot: RememberedCards): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    // Unavailable or full storage costs only the instant draw on the next open.
  }
}

export function forgetCards(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // As above.
  }
}
