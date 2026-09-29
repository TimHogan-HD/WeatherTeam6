import { summarizeReadings, type ConditionsScore, type ReadingField } from '@weatherteam6/types'

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
  conditions: ConditionsScore | null | undefined,
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
