import { eq } from 'drizzle-orm'
import { effectiveClimbHours, effectiveTempRangeC, type Preferences } from '@weatherteam6/types'
import { db } from '../../db/index.js'
import { userPreferences } from '../../db/schema.js'
import type { ReaderScoring } from '../runs/scoringLocation.js'
import { preferencesFromRow } from './updatePreferences.js'

const COLUMNS = {
  temp_low_c: userPreferences.temp_low_c,
  temp_high_c: userPreferences.temp_high_c,
  default_tab: userPreferences.default_tab,
  climb_first_hour: userPreferences.climb_first_hour,
  climb_last_hour: userPreferences.climb_last_hour,
}

/** The reader's settings; an account that never saved any reads as every default. */
export async function preferencesFor(userId: string): Promise<Preferences> {
  const rows = await db.select(COLUMNS).from(userPreferences).where(eq(userPreferences.user_id, userId)).limit(1)
  return preferencesFromRow(rows[0])
}

/**
 * Write the whole settings row in one statement — an insert on first save, an
 * update after. Idempotent: the same body twice leaves the same row. The Phase
 * 0 columns keep their defaults on insert and are never touched here.
 */
export async function savePreferences(userId: string, next: Preferences): Promise<Preferences> {
  const values = {
    temp_low_c: next.temp_low_c,
    temp_high_c: next.temp_high_c,
    default_tab: next.default_tab,
    climb_first_hour: next.climb_first_hour,
    climb_last_hour: next.climb_last_hour,
  }
  const rows = await db
    .insert(userPreferences)
    .values({ user_id: userId, ...values })
    .onConflictDoUpdate({ target: userPreferences.user_id, set: { ...values, updated_at: new Date() } })
    .returning(COLUMNS)
  return preferencesFromRow(rows[0])
}

/**
 * What this reader's settings change about Crag A: the range friction uses and
 * the hours a day's score is read from. **A failed read throws** rather than
 * falling back to the default: a reader who moved either would otherwise be
 * shown readings under settings they did not choose, and nothing on screen
 * could say so.
 */
export async function readerScoringFor(userId: string): Promise<ReaderScoring> {
  const prefs = await preferencesFor(userId)
  return { range: effectiveTempRangeC(prefs), climbHours: effectiveClimbHours(prefs) }
}
