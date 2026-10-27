import {
  FEEDBACK_KIND_LABEL,
  FORECAST_VERDICT_LABEL,
  OBSERVED_CONDITIONS_LABEL,
  SUN_EXPOSURE_LABEL,
  fieldLine,
  summarizeReadings,
  type Conditions,
  type Feedback,
  type ReadingField,
} from '@weatherteam6/types'

/**
 * What the Conditions card shows for a crag right now, as the fields a forecast
 * check stores beside the climber's observation.
 *
 * **The same `summarizeReadings` call the card makes**, so the snapshot is the
 * words on screen and nothing else: `Dryness`, `Friction`, and `Score` only
 * when the card would print it — a Severe+ alert drops the number there and
 * drops it here. The day's `Good hours` window is not a reading of now and is
 * left out.
 *
 * `null` when there is nothing to attach: no row, readings absent from an older
 * API, a named unavailable reason, or a run that does not reach this hour.
 * `feedbackSnapshotFor` then decides whether the hour matches the observation.
 */
export function shownReading(
  conditions: Conditions | null | undefined,
  severeAlertEvent: string | null,
): { valid_at: string; model: string | null; fields: ReadingField[] } | null {
  const r = conditions?.readings
  if (r === undefined || r === null || r.now === null || r.unavailable_reason !== null) return null
  const summary = summarizeReadings({
    reading: r.now,
    window: null,
    utcOffsetSeconds: r.utc_offset_seconds,
    severeAlertEvent,
    alertsPending: false,
    unavailableReason: null,
  })
  const fields = summary.scoreField === null ? summary.readings : [...summary.readings, summary.scoreField]
  return { valid_at: r.now.valid_at, model: r.model, fields }
}

const pad = (n: number): string => String(n).padStart(2, '0')

/**
 * A `datetime-local` value for an instant, on **this device's** clock — the
 * input has no zone and the browser reads it back in the device's own. The
 * reader is normally standing at the crag, so the two clocks agree.
 */
export function toLocalInputValue(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** The instant a `datetime-local` value names, or `null` for an empty or invalid one. */
export function fromLocalInputValue(value: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (m === null) return null
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number]
  const ms = new Date(y, mo - 1, d, h, mi).getTime()
  return Number.isFinite(ms) ? ms : null
}

/**
 * The end of a climbing span from a `time` input's `HH:MM`, on the start's own
 * day — a session at a crag does not cross midnight. `null` for an empty or
 * invalid value, or one that does not come after the start.
 */
export function untilFromTimeValue(fromMs: number, value: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value)
  if (m === null) return null
  const d = new Date(fromMs)
  d.setHours(Number(m[1]), Number(m[2]), 0, 0)
  const ms = d.getTime()
  return Number.isFinite(ms) && ms > fromMs ? ms : null
}

const timeOf = (d: Date): string => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

/**
 * The lines an open feedback item prints, shared by the reader's own list on
 * `/feedback` and the owner's list of everyone's on Profile, so the two never
 * describe one row differently. `author` leads the head when given — the
 * owner's list names who sent each item; the reader's own does not.
 *
 * `appSaid` is null for app feedback, which carries no reading, and says so in
 * words for a check that was saved without one — absent is not "the app said
 * nothing".
 */
export function feedbackLines(
  item: Feedback,
  author?: string,
): { head: string; verdict: string | null; where: string | null; appSaid: string | null } {
  const when = new Date(item.observed_at ?? item.created_at)
  // Absent on a row from an API older than the field: read as "not said".
  const untilIso = item.observed_until ?? null
  const until = untilIso === null ? null : new Date(untilIso)
  const head = [
    author,
    FEEDBACK_KIND_LABEL[item.kind],
    item.location_name,
    Number.isFinite(when.getTime())
      ? when.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) +
        (until !== null && Number.isFinite(until.getTime()) ? ` – ${timeOf(until)}` : '')
      : null,
  ]
    .filter((p): p is string => p !== null && p !== undefined)
    .join(' · ')

  const verdict =
    item.kind === 'forecast' && item.observed_conditions !== null && item.verdict !== null
      ? `Rock: ${OBSERVED_CONDITIONS_LABEL[item.observed_conditions]} · Forecast: ${FORECAST_VERDICT_LABEL[item.verdict]}`
      : null

  const appSaid =
    item.kind !== 'forecast'
      ? null
      : item.app_readings === null
        ? 'No app reading attached'
        : `App said: ${item.app_readings.fields.map(fieldLine).join(' · ')}`

  const sun = item.sun_exposure ?? null
  const whereParts = [item.area_name ?? null, item.wall ?? null, sun === null ? null : SUN_EXPOSURE_LABEL[sun]].filter((p): p is string => p !== null)
  const where = item.kind === 'forecast' && whereParts.length > 0 ? whereParts.join(' · ') : null

  return { head, verdict, where, appSaid }
}
