import { describe, it, expect } from 'vitest'
import {
  FEEDBACK_SNAPSHOT_TOLERANCE_MS,
  feedbackSnapshotFor,
  isForecastVerdict,
  isObservedConditions,
} from './index.js'

const READING = {
  valid_at: '2026-09-29T17:00:00.000Z',
  model: 'gfs_seamless',
  fields: [
    { label: 'Dryness', value: 'Dry' },
    { label: 'Friction', value: 'Good' },
    { label: 'Score', value: '82' },
  ],
}
const HOUR_MS = Date.parse(READING.valid_at)

describe('feedbackSnapshotFor', () => {
  it('attaches the reading when the observation is inside its hour', () => {
    const snap = feedbackSnapshotFor(READING, HOUR_MS + 20 * 60_000)
    expect(snap).toEqual(READING)
  })

  it('attaches at exactly the tolerance and not a minute past it, either side', () => {
    expect(feedbackSnapshotFor(READING, HOUR_MS + FEEDBACK_SNAPSHOT_TOLERANCE_MS)).not.toBeNull()
    expect(feedbackSnapshotFor(READING, HOUR_MS - FEEDBACK_SNAPSHOT_TOLERANCE_MS)).not.toBeNull()
    expect(feedbackSnapshotFor(READING, HOUR_MS + FEEDBACK_SNAPSHOT_TOLERANCE_MS + 60_000)).toBeNull()
    expect(feedbackSnapshotFor(READING, HOUR_MS - FEEDBACK_SNAPSHOT_TOLERANCE_MS - 60_000)).toBeNull()
  })

  it('never pairs a check dated yesterday with this hour’s reading', () => {
    expect(feedbackSnapshotFor(READING, HOUR_MS - 24 * 3600_000)).toBeNull()
  })

  it('treats an empty reading as no reading, not as “the app said nothing”', () => {
    expect(feedbackSnapshotFor({ ...READING, fields: [] }, HOUR_MS)).toBeNull()
    expect(feedbackSnapshotFor(null, HOUR_MS)).toBeNull()
  })

  it('refuses an unparseable hour or observation rather than attaching', () => {
    expect(feedbackSnapshotFor({ ...READING, valid_at: 'not a date' }, HOUR_MS)).toBeNull()
    expect(feedbackSnapshotFor(READING, Number.NaN)).toBeNull()
  })

  it('copies the fields rather than holding the caller’s objects', () => {
    const snap = feedbackSnapshotFor(READING, HOUR_MS)
    expect(snap?.fields[0]).not.toBe(READING.fields[0])
  })
})

describe('feedback guards', () => {
  it('accepts the four observed conditions and nothing else', () => {
    for (const v of ['dry', 'damp', 'wet', 'mixed']) expect(isObservedConditions(v)).toBe(true)
    for (const v of ['Dry', 'moist', '', null, 1]) expect(isObservedConditions(v)).toBe(false)
  })

  it('accepts the three verdicts and nothing else', () => {
    for (const v of ['matched', 'partly', 'missed']) expect(isForecastVerdict(v)).toBe(true)
    for (const v of ['yes', true, undefined]) expect(isForecastVerdict(v)).toBe(false)
  })
})
