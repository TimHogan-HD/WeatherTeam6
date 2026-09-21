import { describe, expect, it } from 'vitest';
import {
  CONDENSING_NOTE,
  CURRENT_HOUR_TOLERANCE_MS,
  FRICTION_ESTIMATE_NOTE,
  UNRECORDED_ASPECT_NOTE,
  formatLocalHour,
  readingNow,
  readingsHeadline,
  readingsUnavailableLine,
  summarizeReadings,
  windowLine,
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

describe('readingsHeadline', () => {
  it('names both readings', () => {
    expect(readingsHeadline(rock(), friction())).toBe('Dry rock · Great friction');
  });

  it('omits a half that could not be read rather than inventing a level', () => {
    expect(readingsHeadline(null, friction({ level: 'fair' }))).toBe('Fair friction');
    expect(readingsHeadline(rock({ level: 'wet' }), null)).toBe('Wet rock');
  });

  it('has nothing to say when neither reading could be read', () => {
    expect(readingsHeadline(null, null)).toBeNull();
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

describe('windowLine', () => {
  it('names the span on the location clock', () => {
    expect(windowLine(window(), -6 * 3600)).toBe('Good from 6am to 10am');
  });

  it('says "all day" only at a full 24 hours', () => {
    expect(windowLine(window({ hours: 24 }), 0)).toBe('Good all day');
    // Today starts at the current hour, so a window covering every remaining
    // hour is not all day and must name its span instead.
    expect(windowLine(window({ hours: 23 }), 0)).toBe('Good from 12pm to 4pm');
  });

  it('does not write a one-hour window as a span from an hour to itself', () => {
    expect(
      windowLine(
        window({ from: '2026-09-21T12:00:00.000Z', to: '2026-09-21T12:00:00.000Z', hours: 1 }),
        0,
      ),
    ).toBe('Good at 12pm');
  });

  it('falls back to a duration when an end of the span cannot be read', () => {
    expect(windowLine(window({ from: 'nonsense', hours: 5 }), 0)).toBe('Good for 5h');
  });

  it('says so plainly when no run of hours cleared the minimum', () => {
    expect(windowLine(null, 0)).toBe('No good hours');
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
  it('leads with the two readings and puts the number last', () => {
    const s = summary();
    expect(s.headline).toBe('Dry rock · Great friction');
    expect(s.window).toBe('Good from 12pm to 4pm');
    expect(s.scoreLine).toBe('Score 86');
    expect(s.score).toBe(86);
  });

  // The phase's acceptance criterion. The fixture is a high score deliberately:
  // under the old ladder this is exactly the day that read "Dry, settled".
  it('never renders a bare good-looking summary for a day with poor friction', () => {
    const s = summary({
      reading: reading({ friction: friction({ level: 'poor' }), score: 58 }),
    });
    expect(s.headline).toContain('Poor friction');
    expect(s.scoreLine).toBe('Score 58');
  });

  it('keeps the readings but drops the number under a Severe+ alert', () => {
    const s = summary({ severeAlertEvent: 'Extreme Heat Warning' });
    expect(s.headline).toBe('Dry rock · Great friction');
    expect(s.qualifier).toBe('see the Extreme Heat Warning above');
    // The number is the thing that reads as actionable, and it is the thing
    // suppression removes. `score` must go with `scoreLine` — a surface that
    // draws the number rather than writing it reads that field.
    expect(s.scoreLine).toBeNull();
    expect(s.score).toBeNull();
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
    expect(s.headline).toBeNull();
    expect(s.window).toBeNull();
    expect(s.scoreLine).toBeNull();
  });

  it('distinguishes an unreadable hour from a day with no window', () => {
    // A run that does not reach this moment still has a day's window to report.
    const s = summary({ reading: null });
    expect(s.headline).toBeNull();
    expect(s.window).toBe('Good from 12pm to 4pm');
    expect(s.unavailableLine).toBeNull();
  });

  it('publishes no magnitude anywhere in its output', () => {
    // The quarantine, asserted at the boundary: every string a surface can
    // print. A 0-1 factor would show up here as a decimal.
    const s = summary({ reading: reading({ friction: friction({ condensing: true }) }) });
    const text = [s.headline, s.window, s.scoreLine, s.qualifier, ...s.notes]
      .filter((v): v is string => v !== null)
      .join(' ');
    expect(text).not.toMatch(/\d*\.\d/);
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
