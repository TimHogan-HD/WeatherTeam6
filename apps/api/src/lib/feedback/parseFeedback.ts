import {
  FEEDBACK_CLOCK_SKEW_MS,
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_OBSERVED_MAX_AGE_DAYS,
  FEEDBACK_PLACE_TEXT_MAX,
  FEEDBACK_READING_FIELDS_MAX,
  FEEDBACK_READING_TEXT_MAX,
  FEEDBACK_ROUTE_PICKS_MAX,
  FEEDBACK_ROUTES_TEXT_MAX,
  FEEDBACK_SPAN_MAX_HOURS,
  FEEDBACK_STOPS_MAX,
  COMPASS_POINTS,
  OBSERVED_CONDITIONS,
  SHADE_CAUSES,
  SUN_EXPOSURES,
  WALL_ANGLES,
  cragRockOf,
  isCompassPoint,
  isFeedbackKind,
  isForecastVerdict,
  isObservedConditions,
  isShadeCause,
  isSunExposure,
  isWallAngle,
  type FeedbackAppReadings,
  type ForecastRoutePick,
  type ForecastStop,
  type ForecastVerdict,
  type GuidebookWall,
  type ObservedConditions,
  type ShadeCause,
} from '@weatherteam6/types'
import { isUuid } from '../http.js'

/**
 * **`POST /feedback`, minus the database.** Pure, so every refusal is
 * reachable from the test suite; the route checks the location belongs to the
 * caller and writes what this returns.
 *
 * An unknown key is refused, not ignored — the same rule as
 * `parseLocationUpdate`: a client that sends `notes` instead of `message` would
 * otherwise get a 201 for a row missing the one thing it said.
 */
export type ParsedFeedback =
  | { kind: 'app'; message: string; location_id: string | null }
  | {
      kind: 'forecast'
      location_id: string
      observed_at: Date
      observed_conditions: ObservedConditions
      verdict: ForecastVerdict
      message: string | null
      app_readings: FeedbackAppReadings | null
      stops: ForecastStop[]
    }

const APP_FIELDS = ['kind', 'message', 'location_id'] as const
const FORECAST_FIELDS = [
  'kind',
  'location_id',
  'observed_at',
  'observed_conditions',
  'verdict',
  'message',
  'app_readings',
  'stops',
] as const
const STOP_FIELDS = [
  'area_id',
  'area_name',
  'wall_id',
  'wall',
  'route_picks',
  'routes',
  'started_at',
  'ended_at',
  'rock',
  'sun_exposure',
  'shade_causes',
  'facing',
  'angle',
] as const

const DAY_MS = 24 * 60 * 60 * 1000

type Refusal = { error: string }

export function parseFeedbackInput(body: unknown, nowMs: number): ParsedFeedback | Refusal {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { error: 'Body must be a JSON object' }
  }
  const raw = body as Record<string, unknown>

  const kind = raw['kind']
  if (!isFeedbackKind(kind)) return { error: "kind must be 'app' or 'forecast'" }

  const allowed: readonly string[] = kind === 'app' ? APP_FIELDS : FORECAST_FIELDS
  const unknown = Object.keys(raw).filter((k) => !allowed.includes(k))
  if (unknown.length > 0) {
    return { error: `Unsupported field(s) for ${kind} feedback: ${unknown.join(', ')}` }
  }

  const message = parseText(raw['message'], 'message', FEEDBACK_MESSAGE_MAX)
  if (typeof message === 'object' && message !== null) return message

  if (kind === 'app') {
    if (message === null) return { error: 'message is required' }
    const loc = raw['location_id']
    if (loc !== undefined && loc !== null && !(typeof loc === 'string' && isUuid(loc))) {
      return { error: 'location_id must be a location id or null' }
    }
    return { kind, message, location_id: typeof loc === 'string' ? loc : null }
  }

  const loc = raw['location_id']
  if (typeof loc !== 'string' || !isUuid(loc)) return { error: 'location_id is required for a forecast check' }

  const observedAt = parseObservedAt(raw['observed_at'], nowMs)
  if (!(observedAt instanceof Date)) return observedAt

  const observed = raw['observed_conditions']
  if (!isObservedConditions(observed)) {
    return { error: "observed_conditions must be one of 'dry', 'damp', 'wet', 'mixed'" }
  }
  const verdict = raw['verdict']
  if (!isForecastVerdict(verdict)) return { error: "verdict must be one of 'matched', 'partly', 'missed'" }

  // Required-but-nullable: a client that forgot the field entirely is not the
  // same as one that had nothing to attach, and only the second is honest.
  if (!('app_readings' in raw)) {
    return { error: 'app_readings is required — send null when the app had no reading for that hour' }
  }
  const readings = parseAppReadings(raw['app_readings'])
  if (readings !== null && 'error' in readings) return readings

  const stops = raw['stops'] === undefined ? [] : parseStops(raw['stops'], observedAt.getTime(), nowMs + FEEDBACK_CLOCK_SKEW_MS)
  if ('error' in stops) return stops
  // The crag's rock is its walls' when they said one, so the two cannot disagree in the table.
  const cragRock = cragRockOf(stops.map((s) => s.rock ?? null))
  if (cragRock !== null && cragRock !== observed) {
    return { error: `observed_conditions must be '${cragRock}', from the stops' rock` }
  }

  return {
    kind,
    location_id: loc,
    observed_at: observedAt,
    observed_conditions: observed,
    verdict,
    message,
    app_readings: readings,
    stops,
  }
}

/**
 * Validate a check's stops. Also used on the way **out** of the database, as
 * `parseAppReadings` is, with `latestMs` at infinity: a stored list that no
 * longer parses reads as no stops rather than being cast.
 *
 * Every stop starts inside the check's day — at or after `observed_at` and
 * within `FEEDBACK_SPAN_MAX_HOURS` of it — and ends after it starts. Whether
 * an `area_id` is one of *this* crag's areas needs the location, so the route
 * checks that.
 */
export function parseStops(v: unknown, observedAtMs: number, latestMs: number): ForecastStop[] | Refusal {
  if (v === null) return []
  if (!Array.isArray(v) || v.length > FEEDBACK_STOPS_MAX) {
    return { error: `stops must be a list of at most ${FEEDBACK_STOPS_MAX}` }
  }
  const dayEndMs = observedAtMs + FEEDBACK_SPAN_MAX_HOURS * 3600_000
  const out: ForecastStop[] = []
  for (const [i, s] of (v as unknown[]).entries()) {
    const at = `stops[${i}]`
    if (typeof s !== 'object' || s === null || Array.isArray(s)) return { error: `${at} must be an object` }
    const r = s as Record<string, unknown>
    const unknown = Object.keys(r).filter((k) => !(STOP_FIELDS as readonly string[]).includes(k))
    if (unknown.length > 0) return { error: `Unsupported field(s) in ${at}: ${unknown.join(', ')}` }

    const areaName = parseText(r['area_name'], `${at}.area_name`, FEEDBACK_PLACE_TEXT_MAX)
    if (typeof areaName === 'object' && areaName !== null) return areaName
    const wall = parseText(r['wall'], `${at}.wall`, FEEDBACK_PLACE_TEXT_MAX)
    if (typeof wall === 'object' && wall !== null) return wall
    const routes = parseText(r['routes'], `${at}.routes`, FEEDBACK_ROUTES_TEXT_MAX)
    if (typeof routes === 'object' && routes !== null) return routes

    const areaId = r['area_id'] ?? null
    if (areaId !== null) {
      if (typeof areaId !== 'string' || !isUuid(areaId)) return { error: `${at}.area_id must be a guidebook area id or null` }
      // An id with no name would print as a blank on every list that shows it.
      if (areaName === null) return { error: `${at}.area_name is required with area_id` }
    }

    // A wall or a route is only a guidebook pick inside a picked area — the
    // route checks each id against that area's own walls and routes.
    const wallId = r['wall_id'] ?? null
    if (wallId !== null) {
      if (typeof wallId !== 'string' || !isUuid(wallId)) return { error: `${at}.wall_id must be a guidebook wall id or null` }
      if (areaId === null) return { error: `${at}.wall_id needs an area_id` }
      if (wall === null) return { error: `${at}.wall is required with wall_id` }
    }
    const picks = parseRoutePicks(r['route_picks'], at)
    if ('error' in picks) return picks
    if (picks.length > 0 && areaId === null) return { error: `${at}.route_picks needs an area_id` }

    const startMs = parseInstant(r['started_at'])
    if (startMs === null) return { error: `${at}.started_at must be an ISO 8601 instant with a UTC offset` }
    if (startMs < observedAtMs) return { error: `${at}.started_at is before observed_at` }
    if (startMs > dayEndMs) return { error: `${at}.started_at is more than ${FEEDBACK_SPAN_MAX_HOURS} hours after observed_at` }
    if (startMs > latestMs) return { error: `${at}.started_at is in the future` }

    const endedAt = r['ended_at'] ?? null
    let endMs: number | null = null
    if (endedAt !== null) {
      endMs = parseInstant(endedAt)
      if (endMs === null) return { error: `${at}.ended_at must be an ISO 8601 instant with a UTC offset, or null` }
      if (endMs <= startMs) return { error: `${at}.ended_at must be after its started_at` }
      if (endMs > dayEndMs) return { error: `${at}.ended_at is more than ${FEEDBACK_SPAN_MAX_HOURS} hours after observed_at` }
      if (endMs > latestMs) return { error: `${at}.ended_at is in the future` }
    }

    const rock = r['rock'] ?? null
    if (rock !== null && !isObservedConditions(rock)) {
      return { error: `${at}.rock must be one of ${OBSERVED_CONDITIONS.map((x) => `'${x}'`).join(', ')}, or null` }
    }
    const sun = r['sun_exposure'] ?? null
    if (sun !== null && !isSunExposure(sun)) {
      return { error: `${at}.sun_exposure must be one of ${SUN_EXPOSURES.map((x) => `'${x}'`).join(', ')}` }
    }
    const causes = parseShadeCauses(r['shade_causes'], at)
    if ('error' in causes) return causes
    // A cause of shade on a wall in full sun, or with no sun said, is a contradiction.
    if (causes.length > 0 && (sun === null || sun === 'full_sun')) {
      return { error: `${at}.shade_causes needs a sun_exposure other than 'full_sun'` }
    }

    const facing = r['facing'] ?? null
    if (facing !== null && !isCompassPoint(facing)) {
      return { error: `${at}.facing must be one of ${COMPASS_POINTS.join(', ')}, or null` }
    }
    const angle = r['angle'] ?? null
    if (angle !== null && !isWallAngle(angle)) {
      return { error: `${at}.angle must be one of ${WALL_ANGLES.map((x) => `'${x}'`).join(', ')}, or null` }
    }

    out.push({
      area_id: areaId,
      area_name: areaName,
      wall_id: wallId,
      wall,
      route_picks: picks,
      routes,
      started_at: new Date(startMs).toISOString(),
      ended_at: endMs === null ? null : new Date(endMs).toISOString(),
      rock,
      sun_exposure: sun,
      shade_causes: causes,
      facing,
      angle,
    })
  }
  return out
}

/** A stop's causes of shade, each once. Absent is `[]`, as `route_picks`. */
function parseShadeCauses(v: unknown, at: string): ShadeCause[] | Refusal {
  if (v === undefined || v === null) return []
  const refusal = { error: `${at}.shade_causes must be a list of ${SHADE_CAUSES.map((x) => `'${x}'`).join(', ')}, each once` }
  if (!Array.isArray(v) || !v.every(isShadeCause) || new Set(v).size !== v.length) return refusal
  return v
}

/**
 * Why a check's guidebook picks do not belong to its crag, or `null`. Each
 * stop's area must be one of the crag's walls, its wall one of that area's
 * sub-walls, and each route on the picked wall — or anywhere in the area when
 * no wall was picked. The client offers only those, so anything else is a
 * stale or forged id.
 */
export function stopsGuidebookProblem(stops: readonly ForecastStop[], walls: readonly GuidebookWall[]): string | null {
  for (const [i, s] of stops.entries()) {
    if (s.area_id === null) continue
    const area = walls.find((w) => w.id === s.area_id)
    if (area === undefined) return `stops[${i}].area_id is not one of this crag's guidebook areas`
    let routeIds = new Set(area.routes.map((r) => r.id))
    if (s.wall_id !== null) {
      const sub = (area.sub_walls ?? []).find((w) => w.id === s.wall_id)
      if (sub === undefined) return `stops[${i}].wall_id is not a wall in ${area.name}`
      routeIds = new Set(sub.route_ids)
    }
    const stray = s.route_picks.find((p) => !routeIds.has(p.id))
    if (stray !== undefined) return `stops[${i}].route_picks: ${stray.name} is not on that wall`
  }
  return null
}

/**
 * A stop's picked routes. Absent is `[]`: a stop stored before routes could be
 * picked, or sent by a client that predates them, picked none.
 */
function parseRoutePicks(v: unknown, at: string): ForecastRoutePick[] | Refusal {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v) || v.length > FEEDBACK_ROUTE_PICKS_MAX) {
    return { error: `${at}.route_picks must be a list of at most ${FEEDBACK_ROUTE_PICKS_MAX}` }
  }
  const out: ForecastRoutePick[] = []
  for (const [j, p] of (v as unknown[]).entries()) {
    const pat = `${at}.route_picks[${j}]`
    if (typeof p !== 'object' || p === null || Array.isArray(p)) return { error: `${pat} must be an object` }
    const r = p as Record<string, unknown>
    const unknown = Object.keys(r).filter((k) => k !== 'id' && k !== 'name')
    if (unknown.length > 0) return { error: `Unsupported field(s) in ${pat}: ${unknown.join(', ')}` }
    const id = r['id']
    if (typeof id !== 'string' || !isUuid(id)) return { error: `${pat}.id must be a guidebook route id` }
    if (out.some((x) => x.id === id)) return { error: `${pat} repeats a route` }
    const name = parseText(r['name'], `${pat}.name`, FEEDBACK_PLACE_TEXT_MAX)
    if (typeof name === 'object' && name !== null) return name
    if (name === null) return { error: `${pat}.name is required` }
    out.push({ id, name })
  }
  return out
}

/** Milliseconds for an ISO instant that carries its offset; `null` otherwise. */
function parseInstant(v: unknown): number | null {
  if (typeof v !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(v)) return null
  const ms = Date.parse(v)
  return Number.isFinite(ms) ? ms : null
}

/** `null` for absent or blank; the trimmed text otherwise. */
function parseText(v: unknown, name: string, max: number): string | null | Refusal {
  if (v === undefined || v === null) return null
  if (typeof v !== 'string') return { error: `${name} must be text` }
  const trimmed = v.trim()
  if (trimmed === '') return null
  if (trimmed.length > max) return { error: `${name} is longer than ${max} characters` }
  return trimmed
}

function parseObservedAt(v: unknown, nowMs: number): Date | Refusal {
  // An offset is required: a bare local time would be read in the server's
  // zone, which is UTC on Vercel and would shift every check by hours.
  if (typeof v !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(v)) {
    return { error: 'observed_at must be an ISO 8601 instant with a UTC offset' }
  }
  const ms = Date.parse(v)
  if (!Number.isFinite(ms)) return { error: 'observed_at is not a valid date' }
  if (ms > nowMs + FEEDBACK_CLOCK_SKEW_MS) return { error: 'observed_at is in the future' }
  if (ms < nowMs - FEEDBACK_OBSERVED_MAX_AGE_DAYS * DAY_MS) {
    return { error: `observed_at is more than ${FEEDBACK_OBSERVED_MAX_AGE_DAYS} days ago` }
  }
  return new Date(ms)
}

/**
 * Validate a snapshot. Also used on the way **out** of the database, where the
 * column is `jsonb` and typed `unknown`: a row that does not parse is returned
 * with `app_readings: null` rather than cast into a shape it does not have.
 */
export function parseAppReadings(v: unknown): FeedbackAppReadings | null | Refusal {
  if (v === null) return null
  if (typeof v !== 'object' || Array.isArray(v)) return { error: 'app_readings must be an object or null' }
  const r = v as Record<string, unknown>

  const validAt = r['valid_at']
  if (typeof validAt !== 'string' || !Number.isFinite(Date.parse(validAt))) {
    return { error: 'app_readings.valid_at must be an ISO 8601 instant' }
  }
  const model = r['model']
  if (model !== null && (typeof model !== 'string' || model.length > FEEDBACK_READING_TEXT_MAX)) {
    return { error: 'app_readings.model must be a model name or null' }
  }
  const fields = r['fields']
  if (!Array.isArray(fields) || fields.length === 0 || fields.length > FEEDBACK_READING_FIELDS_MAX) {
    return { error: `app_readings.fields must hold 1 to ${FEEDBACK_READING_FIELDS_MAX} readings` }
  }
  const out: FeedbackAppReadings['fields'] = []
  for (const f of fields as unknown[]) {
    if (typeof f !== 'object' || f === null) return { error: 'each app_readings field must be { label, value }' }
    const { label, value } = f as Record<string, unknown>
    if (!isShortText(label) || !isShortText(value)) {
      return { error: `each app_readings label and value must be 1 to ${FEEDBACK_READING_TEXT_MAX} characters` }
    }
    out.push({ label, value })
  }
  return { valid_at: validAt, model: model ?? null, fields: out }
}

function isShortText(v: unknown): v is string {
  return typeof v === 'string' && v.trim() !== '' && v.length <= FEEDBACK_READING_TEXT_MAX
}
