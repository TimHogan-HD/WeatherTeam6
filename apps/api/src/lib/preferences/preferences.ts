import { eq } from 'drizzle-orm'
import { effectiveTempRangeC, type Preferences } from '@weatherteam6/types'
import { db } from '../../db/index.js'
import { userPreferences } from '../../db/schema.js'
import type { TempRangeC } from '../scoring/cragModel.js'
import { preferencesFromRow } from './updatePreferences.js'

/** The reader's settings; an account that never saved any reads as every default. */
export async function preferencesFor(userId: string): Promise<Preferences> {
  const rows = await db
    .select({
      temp_low_c: userPreferences.temp_low_c,
      temp_high_c: userPreferences.temp_high_c,
      default_tab: userPreferences.default_tab,
    })
    .from(userPreferences)
    .where(eq(userPreferences.user_id, userId))
    .limit(1)
  return preferencesFromRow(rows[0])
}

/**
 * Write the whole settings row in one statement — an insert on first save, an
 * update after. Idempotent: the same body twice leaves the same row. The Phase
 * 0 columns keep their defaults on insert and are never touched here.
 */
export async function savePreferences(userId: string, next: Preferences): Promise<Preferences> {
  const values = { temp_low_c: next.temp_low_c, temp_high_c: next.temp_high_c, default_tab: next.default_tab }
  const rows = await db
    .insert(userPreferences)
    .values({ user_id: userId, ...values })
    .onConflictDoUpdate({ target: userPreferences.user_id, set: { ...values, updated_at: new Date() } })
    .returning({
      temp_low_c: userPreferences.temp_low_c,
      temp_high_c: userPreferences.temp_high_c,
      default_tab: userPreferences.default_tab,
    })
  return preferencesFromRow(rows[0])
}

/**
 * The range Crag A's friction uses for this reader. **A failed read throws**
 * rather than falling back to the default: a reader who moved their range
 * would otherwise be shown readings under one they did not choose, and nothing
 * on screen could say so.
 */
export async function tempRangeFor(userId: string): Promise<TempRangeC> {
  return effectiveTempRangeC(await preferencesFor(userId))
}
