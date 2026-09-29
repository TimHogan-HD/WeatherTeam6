import {
  FEEDBACK_MESSAGE_MAX,
  FEEDBACK_OBSERVED_MAX_AGE_DAYS,
  FEEDBACK_READING_FIELDS_MAX,
  FEEDBACK_READING_TEXT_MAX,
  isFeedbackKind,
  isForecastVerdict,
  isObservedConditions,
  type FeedbackAppReadings,
  type ForecastVerdict,
  type ObservedConditions,
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
] as const

/** A check may be entered a few minutes "ahead" by a phone whose clock runs fast. */
const CLOCK_SKEW_MS = 5 * 60 * 1000
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

  const message = parseMessage(raw['message'])
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

  return {
    kind,
    location_id: loc,
    observed_at: observedAt,
    observed_conditions: observed,
    verdict,
    message,
    app_readings: readings,
  }
}

/** `null` for absent or blank; the trimmed text otherwise. */
function parseMessage(v: unknown): string | null | Refusal {
  if (v === undefined || v === null) return null
  if (typeof v !== 'string') return { error: 'message must be text' }
  const trimmed = v.trim()
  if (trimmed === '') return null
  if (trimmed.length > FEEDBACK_MESSAGE_MAX) {
    return { error: `message is longer than ${FEEDBACK_MESSAGE_MAX} characters` }
  }
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
  if (ms > nowMs + CLOCK_SKEW_MS) return { error: 'observed_at is in the future' }
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
