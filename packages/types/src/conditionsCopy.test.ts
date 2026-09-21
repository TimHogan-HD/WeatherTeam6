import { describe, expect, it } from 'vitest';
import {
  DRY_SENTINEL_HOURS,
  formatHoursSinceRain,
  formatLastRain,
  isSevereAlert,
  scoreUnavailableLine,
} from './conditionsCopy.js';
import { EM_DASH } from './units.js';

describe('isSevereAlert', () => {
  it('accepts Severe and Extreme in any casing, and nothing below them', () => {
    expect(isSevereAlert('Severe')).toBe(true);
    expect(isSevereAlert('extreme')).toBe(true);
    expect(isSevereAlert(' Extreme ')).toBe(true);
    expect(isSevereAlert('Moderate')).toBe(false);
    expect(isSevereAlert('Minor')).toBe(false);
    expect(isSevereAlert('Unknown')).toBe(false);
  });
});

describe('formatHoursSinceRain', () => {
  it('caps at the sentinel rather than reporting a precise figure', () => {
    // 720 is returned both for a genuine dry month and for a swallowed rainfall
    // fetch. Neither may render as a measurement.
    expect(formatHoursSinceRain(DRY_SENTINEL_HOURS)).toBe('no rain in 30+ days');
    expect(formatHoursSinceRain(5000)).toBe('no rain in 30+ days');
  });

  it('renders real figures below the sentinel', () => {
    expect(formatHoursSinceRain(72)).toBe('no rain in 72h');
    expect(formatHoursSinceRain(1)).toBe('no rain in 1h');
  });

  it('never prints the sentinel figure itself, however the rounding falls', () => {
    // §3 is binding: "never no rain in 720h". Testing the raw value before
    // rounding let 719.5–719.99 through the cap and then printed exactly that.
    expect(formatHoursSinceRain(719.6)).toBe('no rain in 30+ days');
    expect(formatHoursSinceRain(719.5)).toBe('no rain in 30+ days');
    expect(formatHoursSinceRain(719.4)).toBe('no rain in 719h');
  });

  it('says it rained rather than reporting negative hours', () => {
    // dryingModel measures from the end of the rain day (23:59:59Z), so rain
    // dated today is in the future relative to now: at midday that is -14h.
    // "no rain in -14h" states the opposite of what happened.
    expect(formatHoursSinceRain(-14)).toBe('rain today');
    expect(formatHoursSinceRain(0)).toBe('rain today');
    expect(formatHoursSinceRain(0.4)).toBe('rain today');
  });

  it('renders an em dash for null', () => {
    expect(formatHoursSinceRain(null)).toBe(EM_DASH);
  });
});

describe('scoreUnavailableLine — score_error', () => {
  it('does not blame rainfall when the failure was the scorer itself', () => {
    // The rainfall lookup may have been perfectly fine. Naming it when we do not
    // know what threw is defect class 3 — attribution the data does not support.
    const line = scoreUnavailableLine('score_error');
    expect(line).not.toMatch(/rainfall/i);
    expect(line.length).toBeGreaterThan(0);
  });

  it('says something different from the rainfall case', () => {
    expect(scoreUnavailableLine('score_error')).not.toBe(
      scoreUnavailableLine('rainfall_unavailable'),
    );
  });
});

describe('formatLastRain', () => {
  it('caps at the sentinel rather than counting days from an outage', () => {
    // 720 is returned both for a genuinely dry month and for a rainfall fetch
    // that failed. "about 30 days ago" would state a date nobody measured.
    expect(formatLastRain(DRY_SENTINEL_HOURS)).toBe('over 30 days ago');
    expect(formatLastRain(5000)).toBe('over 30 days ago');
  });

  it('counts hours inside two days and days beyond them', () => {
    expect(formatLastRain(21)).toBe('about 21 hours ago');
    expect(formatLastRain(47)).toBe('about 47 hours ago');
    expect(formatLastRain(48)).toBe('about 2 days ago');
    expect(formatLastRain(100)).toBe('about 4 days ago');
  });

  it('says today rather than a figure pointing the wrong way', () => {
    // `dryingModel` measures from the end of the rain day, so rain dated today
    // is in the future relative to now — about -14h at midday.
    expect(formatLastRain(0)).toBe('earlier today');
    expect(formatLastRain(-14)).toBe('earlier today');
  });

  it('has nothing to say when nothing was measured', () => {
    // `null`, not an em dash: the caller omits the whole line rather than
    // printing a label with a dash beside it.
    expect(formatLastRain(null)).toBeNull();
  });
});
