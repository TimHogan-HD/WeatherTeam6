import { and, asc, eq, gt, isNull, or } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { locations, weatherAlerts } from '../../db/schema.js'
import { formatHelp } from './commands.js'
import { buildConditionsInput, findLocationById } from './conditionsReply.js'
import {
  buildAlertsPanel,
  buildConditionsPanel,
  buildHelpPanel,
  buildListPanel,
  buildNoticePanel,
  type Panel,
} from './panels.js'
import type { PanelState } from './panelState.js'

/**
 * Turns a panel state into the message on screen. The database half of the
 * panel; `panels.ts` holds every copy and keyboard decision and stays pure.
 *
 * Called for the first send **and** for every button tap, so what a panel shows
 * is always rendered from the stored state rather than patched in place — a tap
 * writes one field and re-renders, and the two paths cannot diverge.
 */
export async function renderPanel(userId: string, state: PanelState): Promise<Panel> {
  switch (state.view) {
    case 'list':
      return buildListPanel(state.id, await listChoices(userId))

    case 'conditions': {
      if (state.locationId === null) {
        return buildNoticePanel(state.id, 'This panel has no location. Send /locations to pick one.')
      }
      const location = await findLocationById(userId, state.locationId)
      if (location === null) {
        // Deleted, or never theirs. Both read the same on purpose.
        return buildNoticePanel(state.id, 'That location is no longer saved.')
      }
      return buildConditionsPanel({
        stateId: state.id,
        mode: state.mode,
        conditions: await buildConditionsInput(location),
      })
    }

    case 'alerts':
      return buildAlertsPanel(state.id, await activeAlerts(userId))

    case 'help':
      return buildHelpPanel(state.id, formatHelp())
  }
}

async function listChoices(userId: string): Promise<{ id: string; name: string }[]> {
  return db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(eq(locations.user_id, userId))
    .orderBy(asc(locations.name))
}

/**
 * Every unexpired alert across the user's locations, newest event first per
 * location name.
 *
 * The join is what scopes this to the caller: `weather_alerts` carries no
 * `user_id`, so selecting from it alone would return every user's alerts.
 */
async function activeAlerts(userId: string): Promise<
  { locationName: string; event: string; severity: string; headline: string | null }[]
> {
  const now = new Date()
  return db
    .select({
      locationName: locations.name,
      event: weatherAlerts.event,
      severity: weatherAlerts.severity,
      headline: weatherAlerts.headline,
    })
    .from(weatherAlerts)
    .innerJoin(locations, eq(weatherAlerts.location_id, locations.id))
    .where(
      and(
        eq(locations.user_id, userId),
        or(isNull(weatherAlerts.expires), gt(weatherAlerts.expires, now)),
      ),
    )
    .orderBy(asc(locations.name), asc(weatherAlerts.event))
}
