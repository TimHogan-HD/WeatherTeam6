import {
  POSITION_ACCURACY_MAX_M,
  TICK_NOTE_MAX,
  TICK_STYLES,
  isTickStyle,
  type RecordPositionInput,
  type TickStyle,
} from '@weatherteam6/types'

/**
 * **`POST /logbook/ticks` and `PUT /guidebook/areas/:areaId/position`, minus
 * the database.** Pure, so every refusal is reachable from the test suite.
 *
 * An unknown key is refused, not ignored — the rule `parseFeedbackInput` and
 * `parseLocationUpdate` follow: a client that sends `date` instead of
 * `ticked_on` would otherwise get a 201 for a row missing the one thing it said.
 * Whether `route_id` names a real route is the route handler's call, because
 * that answer is a 404 rather than a 400.
 */
export type ParsedTick = {
  route_id: string
  ticked_on: string
  style: TickStyle
  laps: number | null
  note: string | null
}

type Refusal = { error: string }

const TICK_FIELDS = ['route_id', 'ticked_on', 'style', 'laps', 'note'] as const
const POSITION_FIELDS = ['lat', 'lon', 'accuracy_m'] as const
const LAPS_MAX = 999
const DAY_MS = 24 * 60 * 60 * 1000

function asObject(body: unknown, allowed: readonly string[]): { fields: Record<string, unknown> } | Refusal {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { error: 'Body must be a JSON object' }
  }
  const raw = body as Record<string, unknown>
  const unknown = Object.keys(raw).filter((k) => !allowed.includes(k))
  if (unknown.length > 0) return { error: `Unsupported field(s): ${unknown.join(', ')}` }
  return { fields: raw }
}

export function parseTickInput(body: unknown, nowMs: number): ParsedTick | Refusal {
  const parsed = asObject(body, TICK_FIELDS)
  if ('error' in parsed) return parsed
  const raw = parsed.fields

  const routeId = raw['route_id']
  if (typeof routeId !== 'string' || routeId.trim() === '') return { error: 'route_id is required' }

  const tickedOn = parseTickedOn(raw['ticked_on'], nowMs)
  if (typeof tickedOn !== 'string') return tickedOn

  const style = raw['style']
  if (!isTickStyle(style)) return { error: `style must be one of ${TICK_STYLES.join(', ')}` }

  const laps = raw['laps'] ?? null
  if (laps !== null && !(Number.isInteger(laps) && (laps as number) >= 1 && (laps as number) <= LAPS_MAX)) {
    return { error: `laps must be a whole number from 1 to ${LAPS_MAX}, or null` }
  }

  const note = parseNote(raw['note'])
  if (typeof note === 'object' && note !== null) return note

  return { route_id: routeId, ticked_on: tickedOn, style, laps: laps as number | null, note }
}

/**
 * A real calendar day, `YYYY-MM-DD`, no later than tomorrow in UTC. **Tomorrow,
 * not today**: the climber enters their own local day, and east of Greenwich
 * that is already tomorrow while UTC is still on today.
 */
function parseTickedOn(v: unknown, nowMs: number): string | Refusal {
  const m = typeof v === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(v) : null
  if (m === null) return { error: 'ticked_on must be a date, YYYY-MM-DD' }
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const day = new Date(Date.UTC(y, mo - 1, d))
  // `Date.UTC` rolls 2026-02-30 over into March rather than refusing it.
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== mo - 1 || day.getUTCDate() !== d) {
    return { error: 'ticked_on is not a real date' }
  }
  const tomorrow = new Date(nowMs + DAY_MS).toISOString().slice(0, 10)
  if ((v as string) > tomorrow) return { error: 'ticked_on is in the future' }
  return v as string
}

/** `null` for absent or blank; the trimmed text otherwise. */
function parseNote(v: unknown): string | null | Refusal {
  if (v === undefined || v === null) return null
  if (typeof v !== 'string') return { error: 'note must be text' }
  const trimmed = v.trim()
  if (trimmed === '') return null
  if (trimmed.length > TICK_NOTE_MAX) return { error: `note is longer than ${TICK_NOTE_MAX} characters` }
  return trimmed
}

export function parsePositionInput(body: unknown): RecordPositionInput | Refusal {
  const parsed = asObject(body, POSITION_FIELDS)
  if ('error' in parsed) return parsed
  const raw = parsed.fields

  const { lat, lon, accuracy_m: accuracy } = raw
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { error: 'lat must be a number from -90 to 90' }
  }
  if (typeof lon !== 'number' || !Number.isFinite(lon) || lon < -180 || lon > 180) {
    return { error: 'lon must be a number from -180 to 180' }
  }
  if (typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy <= 0) {
    return { error: 'accuracy_m must be a positive number of metres' }
  }
  if (accuracy > POSITION_ACCURACY_MAX_M) {
    return {
      error: `The fix was too rough to record: ±${Math.round(accuracy)} m, and the limit is ±${POSITION_ACCURACY_MAX_M} m`,
    }
  }
  return { lat, lon, accuracy_m: accuracy }
}
