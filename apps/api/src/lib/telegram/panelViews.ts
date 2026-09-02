import { and, asc, eq, gt, isNull, or } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { locations, weatherAlerts } from '../../db/schema.js'
import { logger } from '../logger.js'
import { getDeterministicRuns, getEnsembleRuns } from '../runs/latestRuns.js'
import type { DeterministicRuns, ModelRun } from '../runs/latestRuns.js'
import { pointKeyForLocation } from '../runs/pointKey.js'
import { fetchPrecipHistory } from '../weather/acis.js'
import { fetchArchivePrecip, localDateString, type ForecastLocation } from '../weather/openMeteo.js'
import { formatHelp } from './commands.js'
import { buildConditionsInput, findLocationById, type ConditionsLocation } from './conditionsReply.js'
import {
  buildRows,
  isIntervalHours,
  isTableUnits,
  localDays,
  type IntervalHours,
  type TableUnits,
} from './forecastTable.js'
import {
  buildAlertsPanel,
  buildConditionsPanel,
  buildForecastPanel,
  buildHelpPanel,
  buildListPanel,
  buildNoticePanel,
  buildRainPanel,
  type Panel,
} from './panels.js'
import { buildRainDay, EMPTY_RAIN_DAY, type LastRain } from './rainMessage.js'
import type { PanelState } from './panelState.js'

/**
 * Turns a panel state into the message on screen. The database half of the
 * panel; `panels.ts` holds every copy and keyboard decision and stays pure.
 *
 * Called for the first send **and** for every button tap, so what a panel shows
 * is always rendered from the stored state rather than patched in place — a tap
 * writes one field and re-renders, and the two paths cannot diverge.
 */
export async function renderPanel(
  userId: string,
  state: PanelState,
  now: Date = new Date(),
): Promise<Panel> {
  switch (state.view) {
    case 'list':
      return buildListPanel(state.id, await listChoices(userId))

    case 'conditions': {
      const location = await panelLocation(userId, state)
      if (typeof location === 'string') return buildNoticePanel(state.id, location)
      return buildConditionsPanel({
        stateId: state.id,
        locationId: location.id,
        conditions: await buildConditionsInput(location),
      })
    }

    case 'forecast': {
      const location = await panelLocation(userId, state)
      if (typeof location === 'string') return buildNoticePanel(state.id, location)
      return renderForecast(state, location, now)
    }

    case 'rain': {
      const location = await panelLocation(userId, state)
      if (typeof location === 'string') return buildNoticePanel(state.id, location)
      return renderRain(state, location, now)
    }

    case 'alerts':
      return buildAlertsPanel(state.id, await activeAlerts(userId))

    case 'help':
      return buildHelpPanel(state.id, formatHelp())
  }
}

/**
 * The location a location-scoped panel is about, or the notice to show instead.
 *
 * A state with no location and a location that is gone read differently on
 * purpose — the second one is a location the user did have, and saying "pick
 * one" would suggest they never chose.
 */
async function panelLocation(
  userId: string,
  state: PanelState,
): Promise<ConditionsLocation | string> {
  if (state.locationId === null) {
    return 'This panel has no location. Send /locations to pick one.'
  }
  const location = await findLocationById(userId, state.locationId)
  // Deleted, or never theirs. Both read the same on purpose.
  return location ?? 'That location is no longer saved.'
}

function coordsOf(location: ConditionsLocation): ForecastLocation {
  return {
    lat: Number(location.lat),
    lon: Number(location.lon),
    elevation_m: location.elevation_m === null ? null : Number(location.elevation_m),
  }
}

/**
 * The panel's settings, each falling back to a default when the stored value is
 * one this build does not know.
 *
 * A row written by an older deploy, or by a hand edit, degrades to the default
 * rather than being typed as something it is not — the same rule `mapRow`
 * applies to `view` and `mode`.
 */
function settingsOf(state: PanelState): {
  interval: IntervalHours
  units: TableUnits
} {
  return {
    interval:
      state.intervalHours !== null && isIntervalHours(state.intervalHours)
        ? state.intervalHours
        : 3,
    units: isTableUnits(state.units) ? state.units : 'imperial',
  }
}

/**
 * Which model a forecast panel shows when the state does not name one this point
 * has, in preference order.
 *
 * GFS leads because it is global and runs 16 days: a default of HRRR would put
 * an empty table on every day past its 54 h horizon, which is a worse first
 * impression than a coarser model that answers. HRRR is one tap away.
 */
const MODEL_PREFERENCE = [
  'gfs_seamless',
  'ecmwf_ifs025',
  'icon_seamless',
  'gem_seamless',
  'ncep_hrrr_conus',
  'ncep_nbm_conus',
] as const

/**
 * Resolve the model on screen.
 *
 * A stored model that this point does not reach falls back rather than showing
 * an empty table under its name — and it is still named on the panel, by
 * `unavailable_models`, so the fallback is visible rather than silent.
 */
function selectModel(runs: DeterministicRuns, stored: string | null): ModelRun | null {
  const byName = new Map(runs.models.map((m) => [m.model, m]))
  if (stored !== null) {
    const exact = byName.get(stored)
    if (exact) return exact
  }
  for (const model of MODEL_PREFERENCE) {
    const found = byName.get(model)
    if (found) return found
  }
  return runs.models[0] ?? null
}

/** The index a stored `day_offset` selects, clamped to the days that exist. */
function dayIndexOf(dayOffset: number, days: readonly string[]): number {
  if (days.length === 0) return 0
  return Math.min(Math.max(dayOffset, 0), days.length - 1)
}

async function renderForecast(
  state: PanelState,
  location: ConditionsLocation,
  now: Date,
): Promise<Panel> {
  const point = coordsOf(location)
  const pointKey = pointKeyForLocation(location.id)
  const { interval, units } = settingsOf(state)

  // The ensemble is the sparkline only. A forecast table that fails because the
  // agreement bar could not be drawn would be a working panel lost to an
  // optional one, so its failure is caught and the bar is omitted.
  const [deterministic, ensemble] = await Promise.all([
    getDeterministicRuns(point, pointKey, location.id, now),
    getEnsembleRuns(point, pointKey, location.id, now).catch((err: unknown) => {
      logger.warn(
        { locationId: location.id, err: err instanceof Error ? err.message : String(err) },
        '[panelViews] ensemble unavailable — forecast panel drops the agreement bar',
      )
      return null
    }),
  ])

  const offset = deterministic.utc_offset_seconds
  // The union across models, so paging does not change shape when the model
  // does. A day one model does not reach is named in the table's place.
  const days = localDays(
    deterministic.models.flatMap((m) => [...m.hours]),
    offset,
  )
  const dayIndex = dayIndexOf(state.dayOffset, days)
  const date = days[dayIndex]
  const model = selectModel(deterministic, state.model)

  return buildForecastPanel({
    stateId: state.id,
    locationId: location.id,
    mode: state.mode,
    locationName: location.name,
    units,
    interval,
    model: model?.model ?? '',
    days,
    dayIndex,
    rows:
      model === null || date === undefined ? [] : buildRows(model.hours, offset, date, interval),
    rainDay:
      ensemble === null || date === undefined
        ? null
        : buildRainDay(ensemble.hours, ensemble.utc_offset_seconds, date, interval),
    fetchedAt: deterministic.fetched_at,
    now,
  })
}

/** The window the rainfall record is read over — the same 30 days the drying model uses. */
const RAIN_WINDOW_DAYS = 30

async function renderRain(
  state: PanelState,
  location: ConditionsLocation,
  now: Date,
): Promise<Panel> {
  const point = coordsOf(location)
  const pointKey = pointKeyForLocation(location.id)
  const { interval, units } = settingsOf(state)

  // The rainfall record and the ensemble are independent upstreams, so they go
  // together rather than one after the other — a tap already carries two round
  // trips and the client gives up at about 15 seconds.
  const [ensemble, rainfall] = await Promise.all([
    getEnsembleRuns(point, pointKey, location.id, now),
    loadLastRain(location, now),
  ])
  const offset = ensemble.utc_offset_seconds
  const today = localDateString(now, offset)
  const days = localDays(ensemble.hours, offset)
  const dayIndex = dayIndexOf(state.dayOffset, days)
  const date = days[dayIndex]

  return buildRainPanel({
    stateId: state.id,
    locationId: location.id,
    mode: state.mode,
    locationName: location.name,
    units,
    interval,
    days,
    dayIndex,
    // No day to show is not a day of zeroes: `buildRainDay` emits a row per step
    // whether or not the data reaches it, which is right for a partial day and
    // wrong for a point the ensemble did not answer for at all.
    day:
      date === undefined ? EMPTY_RAIN_DAY : buildRainDay(ensemble.hours, offset, date, interval),
    lastRain: rainfall.lastRain,
    lastRainFailed: rainfall.failed,
    rainWindowDays: RAIN_WINDOW_DAYS,
    today,
    fetchedAt: ensemble.fetched_at,
    now,
  })
}

/**
 * The most recent day with measurable rain in the record, and whether the lookup
 * worked.
 *
 * The threshold is *measurable*, not the drying model's 2 mm "significant": this
 * view is meteorology, and a day with 1 mm on it is a day it rained.
 *
 * **A failed lookup is tracked, not swallowed** — issue #34. An empty list and a
 * failed request are the same value and mean opposite things, and the one that
 * reads as a dry spell is the wrong one to guess.
 */
async function loadLastRain(
  location: ConditionsLocation,
  now: Date,
): Promise<{ lastRain: LastRain | null; failed: boolean }> {
  // The window is bounded in UTC. Both sources return whole days with their own
  // dates on them, and a boundary a few hours out only decides whether today's
  // partial record is asked for — the "days ago" figure is computed against the
  // location's own today, from the dates that come back.
  const from = localDateString(new Date(now.getTime() - RAIN_WINDOW_DAYS * 24 * 60 * 60 * 1000), 0)
  const to = localDateString(now, 0)

  let events: { date: string; precip_mm: number }[]
  try {
    events = location.asos_station
      ? await fetchPrecipHistory(location.asos_station, from, to)
      : await fetchArchivePrecip(Number(location.lat), Number(location.lon), from, to)
  } catch (err) {
    logger.warn(
      { locationId: location.id, err: err instanceof Error ? err.message : String(err) },
      '[panelViews] rainfall record unavailable — saying so rather than reporting a dry spell',
    )
    return { lastRain: null, failed: true }
  }

  let latest: LastRain | null = null
  for (const event of events) {
    if (event.precip_mm <= 0) continue
    if (latest === null || event.date > latest.date) {
      latest = { date: event.date, precip_mm: event.precip_mm }
    }
  }
  return { lastRain: latest, failed: false }
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
