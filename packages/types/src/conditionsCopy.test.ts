import { describe, expect, it } from 'vitest';
import {
  DRY_SENTINEL_HOURS,
  formatHoursSinceRain,
  isSevereAlert,
  limitingComponent,
  stateLabel,
  summarizeConditions,
  type ScoreComponents,
} from './conditionsCopy.js';
import { EM_DASH } from './units.js';

const FULL: ScoreComponents = { drying: 40, rain: 25, wind: 15, temp: 12, humidity: 8 };

describe('stateLabel', () => {
  it('maps each rung, including its boundaries', () => {
    expect(stateLabel(100)).toBe('Dry, settled');
    expect(stateLabel(80)).toBe('Dry, settled');
    expect(stateLabel(79)).toBe('Mostly dry');
    expect(stateLabel(60)).toBe('Mostly dry');
    expect(stateLabel(59)).toBe('Mixed');
    expect(stateLabel(40)).toBe('Mixed');
    expect(stateLabel(39)).toBe('Wet or unsettled');
    expect(stateLabel(0)).toBe('Wet or unsettled');
    expect(stateLabel(null)).toBe('Too far out to score');
  });

  it('states no opinion about climbing on any rung', () => {
    const forbidden = /climb|go\b|don't|great|good day|recommend|check the details/i;
    for (const score of [100, 85, 70, 50, 20, 0]) {
      expect(stateLabel(score)).not.toMatch(forbidden);
    }
  });
});

describe('limitingComponent', () => {
  it('returns null when nothing is zeroed', () => {
    expect(limitingComponent(FULL)).toBeNull();
  });

  it('names the heaviest zeroed component and never two', () => {
    expect(limitingComponent({ ...FULL, temp: 0 })).toBe('temp');
    expect(limitingComponent({ ...FULL, temp: 0, humidity: 0 })).toBe('temp');
    expect(limitingComponent({ ...FULL, drying: 0, rain: 0, wind: 0 })).toBe('drying');
    expect(limitingComponent({ ...FULL, rain: 0, wind: 0 })).toBe('rain');
  });

  it('treats a null component as unknown, not as zero', () => {
    // Naming a component that was never measured would assert a cause we do
    // not have. `null` and `0` are different facts.
    expect(limitingComponent({ ...FULL, temp: null })).toBeNull();
  });
});

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

describe('summarizeConditions', () => {
  it('shows the state label when nothing is limiting', () => {
    const s = summarizeConditions({
      score: 85,
      confidence: 'high',
      components: FULL,
      severeAlertEvent: null,
    });
    expect(s.label).toBe('Dry, settled');
    expect(s.scoreLine).toBe('Score 85 (high confidence)');
    expect(s.chip).toBe('Score 85 · high');
    expect(s.qualifier).toBeNull();
  });

  it('suppresses the label and names the limiting component — the issue #21 case', () => {
    // Red Rock, 2026-08-24: 39.5 °C (103 °F), component_temp 0, total 80.
    const s = summarizeConditions({
      score: 80,
      confidence: 'high',
      components: { ...FULL, temp: 0 },
      severeAlertEvent: null,
    });
    expect(s.label).toBeNull();
    expect(s.scoreLine).toBe('Score 80 (high confidence) — limited by temperature');
    expect(s.qualifier).toBe('limited by temperature');
  });

  it('never returns "Dry, settled" for a day with a zeroed component', () => {
    // The exact regression a "degradation guard" carve-out would reintroduce.
    for (const zeroed of ['drying', 'rain', 'wind', 'temp', 'humidity'] as const) {
      const s = summarizeConditions({
        score: 88,
        confidence: 'high',
        components: { ...FULL, [zeroed]: 0 },
        severeAlertEvent: null,
      });
      expect(s.label).toBeNull();
      expect(s.qualifier).not.toBeNull();
    }
  });

  it('lets a Severe+ alert outrank a zeroed component and names the alert', () => {
    const s = summarizeConditions({
      score: 80,
      confidence: 'high',
      components: { ...FULL, temp: 0 },
      severeAlertEvent: 'Extreme Heat Warning',
    });
    expect(s.label).toBeNull();
    expect(s.scoreLine).toBe('Score 80 (high confidence) — see the Extreme Heat Warning above');
    expect(s.qualifier).toBe('see the Extreme Heat Warning above');
  });

  it('suppresses on a Severe+ alert even when every component is full', () => {
    const s = summarizeConditions({
      score: 92,
      confidence: 'high',
      components: FULL,
      severeAlertEvent: 'Flash Flood Warning',
    });
    expect(s.label).toBeNull();
    expect(s.scoreLine).toBe('Score 92 (high confidence) — see the Flash Flood Warning above');
  });

  it('treats an unscored day as unscored, not as limited', () => {
    // Outside the scoring window every component is 0 and the score is null.
    // That is not a limited day, and suppression must not run on it.
    const s = summarizeConditions({
      score: null,
      confidence: 'low',
      components: { drying: 0, rain: 0, wind: 0, temp: 0, humidity: 0 },
      severeAlertEvent: null,
    });
    expect(s.label).toBe('Too far out to score');
    expect(s.scoreLine).toBeNull();
    expect(s.chip).toBeNull();
    expect(s.qualifier).toBeNull();
  });

  it('never puts the score in the label field', () => {
    const s = summarizeConditions({
      score: 85,
      confidence: 'high',
      components: FULL,
      severeAlertEvent: null,
    });
    expect(s.label).not.toMatch(/\d/);
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
    expect(formatHoursSinceRain(0)).toBe('no rain in 0h');
    expect(formatHoursSinceRain(719.6)).toBe('no rain in 720h');
  });

  it('renders an em dash for null', () => {
    expect(formatHoursSinceRain(null)).toBe(EM_DASH);
  });
});
