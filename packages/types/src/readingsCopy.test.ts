import { describe, expect, it } from 'vitest';
import {
  CONDENSING_NOTE,
  CURRENT_HOUR_TOLERANCE_MS,
  FRICTION_ESTIMATE_NOTE,
  UNRECORDED_ASPECT_NOTE,
  fieldLine,
  formatLocalHour,
  readingFields,
  readingNow,
  readingsShort,
  readingsUnavailableLine,
  summarizeReadings,
  windowValue,
} from './readingsCopy.js';
import type {
  ConditionsWindow,
  FrictionReading,
  HourlyReading,
  ReadingsUnavailableReason,
  RockReading,
} from './hourly.js';

const rock = (over: Partial<RockReading> = {}): RockReading => ({
  level: 'dry',
  qualified: true,
  ...over,
});

const friction = (over: Partial<FrictionReading> = {}): FrictionReading => ({
  level: 'great',
  condensing: false,
  qualified: true,
  ...over,
});

const reading = (over: Partial<HourlyReading> = {}): HourlyReading => ({
  valid_at: '2026-09-21T15:00:00.000Z',
  rock: rock(),
  friction: friction(),
  score: 86,
  t_surface_c: 21.4,
  condensation_margin_c: 5.7,
  ...over,
});

const window = (over: Partial<ConditionsWindow> = {}): ConditionsWindow => ({
  from: '2026-09-21T12:00:00.000Z',
  to: '2026-09-21T16:00:00.000Z',
  hours: 5,
  min_score: 74,
  qualified: false,
  ...over,
});

const summary = (over: Partial<Parameters<typeof summarizeReadings>[0]> = {}) =>
  summarizeReadings({
    reading: reading(),
    window: window(),
    utcOffsetSeconds: 0,
    severeAlertEvent: null,
    unavailableReason: null,
    ...over,
  });

/** Every string a summary can put on a surface, in the order it appears. */
const printed = (s: ReturnType<typeof summarizeReadings>): string =>
  [
    ...s.readings.map(fieldLine),
    s.scoreField === null ? null : fieldLine(s.scoreField),
    s.window === null ? null : fieldLine(s.window),
    s.qualifier,
    ...s.notes,
    s.unavailableLine,
  ]
    .filter((v): v is string => v !== null)
    .join(' ');

describe('readingFields', () => {
  it('labels each reading rather than writing it as a phrase', () => {
    expect(readingFields(rock(), friction())).toEqual([
      { label: 'Dryness', value: 'Dry' },
      { label: 'Friction', value: 'Great' },
    ]);
  });

  it('omits a half that could not be read rather than inventing a level', () => {
    expect(readingFields(null, friction({ level: 'fair' }))).toEqual([
      { label: 'Friction', value: 'Fair' },
    ]);
    expect(readingFields(rock({ level: 'wet' }), null)).toEqual([
      { label: 'Dryness', value: 'Wet' },
    ]);
  });

  it('has nothing to show when neither reading could be read', () => {
    expect(readingFields(null, null)).toEqual([]);
  });
});

describe('readingsShort', () => {
  it('drops the labels only where the surface has already named the subject', () => {
    expect(readingsShort(rock(), friction())).toBe('Dry · Great');
    expect(readingsShort(null, null)).toBeNull();
  });
});

describe('fieldLine', () => {
  it('punctuates a field for a surface with no layout to do it', () => {
    expect(fieldLine({ label: 'Dryness', value: 'Dry' })).toBe('Dryness: Dry');
  });
});

describe('formatLocalHour', () => {
  it('shifts the instant by the location offset, not the viewer one', () => {
    // 15:00Z at UTC-6 is 9am locally. Reading the instant as UTC would say 3pm.
    expect(formatLocalHour('2026-09-21T15:00:00.000Z', -6 * 3600)).toBe('9am');
  });

  it('writes noon and midnight as 12, not 0', () => {
    expect(formatLocalHour('2026-09-21T12:00:00.000Z', 0)).toBe('12pm');
    expect(formatLocalHour('2026-09-21T00:00:00.000Z', 0)).toBe('12am');
  });

  it('degrades a non-finite offset to UTC rather than producing an invalid date', () => {
    expect(formatLocalHour('2026-09-21T15:00:00.000Z', Number.NaN)).toBe('3pm');
  });

  it('is null for an instant it cannot parse', () => {
    expect(formatLocalHour('not-a-date', 0)).toBeNull();
  });
});

describe('windowValue', () => {
  it('names the span on the location clock', () => {
    expect(windowValue(window(), -6 * 3600)).toBe('6am–10am');
  });

  it('says "all day" only at a full 24 hours', () => {
    expect(windowValue(window({ hours: 24 }), 0)).toBe('All day');
    // Today starts at the current hour, so a window covering every remaining
    // hour is not all day and must name its span instead.
    expect(windowValue(window({ hours: 23 }), 0)).toBe('12pm–4pm');
  });

  it('does not write a one-hour window as a span from an hour to itself', () => {
    expect(
      windowValue(
        window({ from: '2026-09-21T12:00:00.000Z', to: '2026-09-21T12:00:00.000Z', hours: 1 }),
        0,
      ),
    ).toBe('12pm');
  });

  it('falls back to a duration when an end of the span cannot be read', () => {
    expect(windowValue(window({ from: 'nonsense', hours: 5 }), 0)).toBe('5h');
  });

  it('says so plainly when no run of hours cleared the minimum', () => {
    expect(windowValue(null, 0)).toBe('None');
  });
});

describe('readingsUnavailableLine', () => {
  const reasons: ReadingsUnavailableReason[] = [
    'model_unavailable',
    'insufficient_history',
    'not_a_climbing_location',
  ];

  it('has copy for every reason', () => {
    for (const r of reasons) expect(readingsUnavailableLine(r).length).toBeGreaterThan(0);
  });

  it('never reads as a statement about the conditions', () => {
    // The whole class of defect this guards is an outage rendering as a fact
    // about the rock. None of these may contain a reading word.
    for (const r of reasons) {
      expect(readingsUnavailableLine(r).toLowerCase()).not.toMatch(/\b(dry|wet|drying|good|poor)\b/);
    }
  });
});

describe('summarizeReadings', () => {
  it('reads out the two gauges and puts the number third', () => {
    const s = summary();
    expect(s.readings).toEqual([
      { label: 'Dryness', value: 'Dry' },
      { label: 'Friction', value: 'Great' },
    ]);
    expect(s.window).toEqual({ label: 'Good hours', value: '12pm–4pm' });
    expect(s.scoreField).toEqual({ label: 'Score', value: '86' });
    expect(s.score).toBe(86);
  });

  // The owner's 2026-09-21 verdict, asserted on the output: a surface that
  // composes these fields cannot produce a sentence, because no field's value
  // is one. The failure this guards is a phrase creeping back into a value —
  // "Dry, settled" is exactly what that looked like last time.
  it('states each reading as a value, never as a sentence about it', () => {
    const s = summary();
    for (const field of [...s.readings, s.scoreField, s.window]) {
      expect(field).not.toBeNull();
      expect(field?.value).not.toMatch(/[.!]/);
      expect(field?.value.split(/\s+/).length).toBeLessThanOrEqual(2);
    }
  });

  // The phase's acceptance criterion. The fixture is a high score deliberately:
  // under the old ladder this is exactly the day that read "Dry, settled".
  it('never renders a bare good-looking summary for a day with poor friction', () => {
    const s = summary({
      reading: reading({ friction: friction({ level: 'poor' }), score: 58 }),
    });
    expect(s.readings).toContainEqual({ label: 'Friction', value: 'Poor' });
    expect(printed(s)).toContain('Friction: Poor');
    expect(s.scoreField).toEqual({ label: 'Score', value: '58' });
  });

  it('keeps the readings but drops the number under a Severe+ alert', () => {
    const s = summary({ severeAlertEvent: 'Extreme Heat Warning' });
    expect(s.readings).toHaveLength(2);
    expect(s.qualifier).toBe('see the Extreme Heat Warning above');
    // The number is the thing that reads as actionable, and it is the thing
    // suppression removes. `score` must go with `scoreField` — a surface that
    // draws the number rather than writing it reads that field.
    expect(s.scoreField).toBeNull();
    expect(s.score).toBeNull();
  });

  // Defect class 7, and the reason this decision moved in here: a null
  // `severeAlertEvent` cannot tell "no alert" from "the alerts query has not
  // answered yet", so a surface drawing the score off it alone would show an
  // unsuppressed number for as long as that query takes.
  it('withholds the number while the alerts query is still in flight', () => {
    const s = summary({ alertsPending: true });
    expect(s.score).toBeNull();
    expect(s.scoreField).toBeNull();
    // The readings are not suppressed by an alert, so they have nothing to
    // wait for — they arrive first and the number joins them.
    expect(s.readings).toHaveLength(2);
    expect(s.qualifier).toBeNull();
  });

  it('names condensation when nothing outranks it', () => {
    expect(summary({ reading: reading({ friction: friction({ condensing: true }) }) }).qualifier).toBe(
      CONDENSING_NOTE,
    );
  });

  it('lets the alert outrank condensation rather than listing both', () => {
    const s = summary({
      reading: reading({ friction: friction({ condensing: true }) }),
      severeAlertEvent: 'Winter Storm Warning',
    });
    expect(s.qualifier).toBe('see the Winter Storm Warning above');
  });

  it('always carries the friction estimate note when a friction level is shown', () => {
    expect(summary().notes).toContain(FRICTION_ESTIMATE_NOTE);
  });

  it('carries no estimate note when there is no friction reading to caveat', () => {
    expect(summary({ reading: reading({ friction: null }) }).notes).not.toContain(
      FRICTION_ESTIMATE_NOTE,
    );
  });

  it('adds the aspect note only when a reading on screen is unqualified', () => {
    expect(summary().notes).not.toContain(UNRECORDED_ASPECT_NOTE);
    expect(
      summary({ reading: reading({ friction: friction({ qualified: false }) }) }).notes,
    ).toContain(UNRECORDED_ASPECT_NOTE);
    expect(summary({ reading: reading({ rock: rock({ qualified: false }) }) }).notes).toContain(
      UNRECORDED_ASPECT_NOTE,
    );
  });

  it('says why there is nothing rather than showing an empty summary', () => {
    const s = summary({ reading: null, window: null, unavailableReason: 'insufficient_history' });
    expect(s.unavailableLine).toBe(readingsUnavailableLine('insufficient_history'));
    expect(s.readings).toEqual([]);
    expect(s.window).toBeNull();
    expect(s.scoreField).toBeNull();
  });

  it('distinguishes an unreadable hour from a day with no window', () => {
    // A run that does not reach this moment still has a day's window to report.
    const s = summary({ reading: null });
    expect(s.readings).toEqual([]);
    expect(s.window).toEqual({ label: 'Good hours', value: '12pm–4pm' });
    expect(s.unavailableLine).toBeNull();
  });

  it('publishes no magnitude anywhere in its output', () => {
    // The quarantine, asserted at the boundary: every string a surface can
    // print. A 0-1 factor would show up here as a decimal.
    const s = summary({ reading: reading({ friction: friction({ condensing: true }) }) });
    expect(printed(s)).not.toMatch(/\d*\.\d/);
  });
});

describe('readingNow', () => {
  const at = (iso: string): HourlyReading => reading({ valid_at: iso });
  const hours = [
    at('2026-09-21T14:00:00.000Z'),
    at('2026-09-21T15:00:00.000Z'),
    at('2026-09-21T16:00:00.000Z'),
  ];

  it('picks the nearest hour', () => {
    const now = Date.parse('2026-09-21T15:20:00.000Z');
    expect(readingNow(hours, now)?.valid_at).toBe('2026-09-21T15:00:00.000Z');
  });

  it('is null when the run does not reach this moment', () => {
    const now = Date.parse('2026-09-21T16:00:00.000Z') + CURRENT_HOUR_TOLERANCE_MS + 60_000;
    expect(readingNow(hours, now)).toBeNull();
  });

  it('accepts an hour exactly at the tolerance', () => {
    const now = Date.parse('2026-09-21T16:00:00.000Z') + CURRENT_HOUR_TOLERANCE_MS;
    expect(readingNow(hours, now)?.valid_at).toBe('2026-09-21T16:00:00.000Z');
  });

  it('skips an instant it cannot parse instead of ranking it nearest', () => {
    const now = Date.parse('2026-09-21T15:00:00.000Z');
    expect(readingNow([at('nonsense'), ...hours], now)?.valid_at).toBe(
      '2026-09-21T15:00:00.000Z',
    );
  });

  it('is null for an empty series', () => {
    expect(readingNow([], Date.now())).toBeNull();
  });
});
