import { describe, expect, it } from 'vitest';
import {
  FRICTION_MECHANISM,
  ROCK_TEMPERATURE_MECHANISM,
  UNRECORDED_ASPECT_MECHANISM,
  dewPointMarginValue,
  measurements,
  type MeasuredHour,
} from './readingsCopy.js';
import { cToFDelta, formatTempF } from './units.js';
import type { FrictionReading, HourlyReading, RockReading } from './hourly.js';

/**
 * The measurements disclosure's rules, tested here rather than through the
 * component: the Mini App's tests run in `node` with no DOM, so nothing behind
 * a click is reachable there. Everything the panel decides is decided by
 * `measurements()`.
 */

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

const measuredHour = (over: Partial<MeasuredHour> = {}): MeasuredHour => ({
  temp_c: 22.2,
  dewpoint_c: 8.3,
  humidity_pct: 41,
  wind_kmh: 14,
  wind_gust_kmh: null,
  precip_mm: 0,
  ...over,
});

type Result = ReturnType<typeof measurements>;

const groupNamed = (m: Result, label: string) => m.groups.find((g) => g.label === label) ?? null;

const fieldNamed = (m: Result, group: string, label: string) =>
  groupNamed(m, group)?.fields.find((f) => f.label === label)?.value ?? null;

describe('cToFDelta', () => {
  it('converts an interval, with no scale offset', () => {
    expect(cToFDelta(0)).toBe(0);
    expect(cToFDelta(10)).toBe(18);
    expect(cToFDelta(-5)).toBe(-9);
  });
});

describe('dewPointMarginValue', () => {
  /**
   * **The assertion this function exists for.** `formatTempF` on the same
   * input returns `36°F` — the scale's 32 added to an interval — which would
   * put a comfortable-looking margin on a wall two degrees from condensing.
   */
  it('converts an interval without the scale offset', () => {
    expect(formatTempF(2)).toBe('36°F');
    expect(dewPointMarginValue(2)).toBe('4°F above');
  });

  it('names the direction when the wall is under its dew point', () => {
    expect(dewPointMarginValue(-1.1)).toBe('2°F below');
  });

  it('reads a margin that rounds to zero as sitting on the line', () => {
    // `0°F below` looks like a rendering fault, and which side of the line a
    // tenth of a degree falls on is below the resolution of a modelled figure.
    expect(dewPointMarginValue(-0.2)).toBe('at the dew point');
    expect(dewPointMarginValue(0)).toBe('at the dew point');
  });

  it('is null for an unmeasured margin, never a zero', () => {
    expect(dewPointMarginValue(null)).toBeNull();
  });
});

describe('measurements', () => {
  const both = (): Result =>
    measurements({
      hour: measuredHour(),
      weatherModel: 'gfs_seamless',
      reading: reading(),
      rainModels: null,
      readingModel: 'gfs_seamless',
    });

  it('carries only the air the card above does not already print', () => {
    const m = both();
    expect(groupNamed(m, 'Air')?.fields).toEqual([{ label: 'Rain, past hour', value: '0 in' }]);
  });

  it('carries the rock figures the readings were derived from', () => {
    const m = both();
    expect(fieldNamed(m, 'Rock', 'Rock temperature')).toBe('71°F');
    expect(fieldNamed(m, 'Rock', 'Dew point margin')).toBe('10°F above');
  });

  it('puts the air first, because it is what the reader can check', () => {
    expect(both().groups.map((g) => g.label)).toEqual(['Air', 'Rock']);
  });

  /**
   * **The rock figures are the thermal model's and the air columns are not
   * necessarily the same model's** (issue #155 — irradiance is never pooled,
   * so the readings come from one named model while `HourlySeries.model` is
   * chosen by coverage). This is the one surface that prints both at once, and
   * naming one with the other is `defect-patterns.md` §3.
   */
  it('attributes each group to the model that produced it', () => {
    const m = measurements({
      hour: measuredHour(),
      weatherModel: 'ncep_hrrr_conus',
      reading: reading(),
      rainModels: null,
      readingModel: 'gfs_seamless',
    });
    expect(groupNamed(m, 'Air')?.source).toBe('Open-Meteo · HRRR');
    expect(groupNamed(m, 'Rock')?.source).toBe('Open-Meteo · GFS');
    expect(m.sharedSource).toBeNull();
  });

  it('names one source only when every group actually came from it', () => {
    expect(both().sharedSource).toBe('Open-Meteo · GFS');
  });

  it('shares a source across a single group', () => {
    const m = measurements({
      hour: measuredHour(),
      weatherModel: 'gfs_seamless',
      reading: null,
      rainModels: null,
      readingModel: null,
    });
    expect(m.sharedSource).toBe('Open-Meteo · GFS');
  });

  it('does not share a source when one group is unattributed', () => {
    // An unnamed half must not borrow the named half's attribution.
    const m = measurements({
      hour: measuredHour(),
      weatherModel: null,
      reading: reading(),
      rainModels: null,
      readingModel: 'gfs_seamless',
    });
    expect(m.sharedSource).toBeNull();
    expect(groupNamed(m, 'Air')?.source).toBeNull();
  });

  it('omits a group nothing in it was measured for', () => {
    const m = measurements({
      hour: measuredHour({ precip_mm: null }),
      weatherModel: 'gfs_seamless',
      reading: reading({ t_surface_c: null, condensation_margin_c: null }),
      rainModels: null,
      readingModel: 'gfs_seamless',
    });
    // A row of dashes measures nothing and reads as a broken panel.
    expect(m.groups).toEqual([]);
  });

  it('keeps the gaps inside a group that measured something', () => {
    const m = measurements({
      hour: measuredHour({ precip_mm: null, wind_kmh: 14, wind_gust_kmh: 31 }),
      weatherModel: 'gfs_seamless',
      reading: reading({ condensation_margin_c: null }),
      rainModels: null,
      readingModel: 'gfs_seamless',
    });
    // Between real figures a dash is information: the model answered for this
    // hour and had nothing for this field.
    expect(fieldNamed(m, 'Air', 'Rain, past hour')).toBe('—');
    expect(fieldNamed(m, 'Air', 'Gusts')).toBe('19 mph');
    expect(fieldNamed(m, 'Rock', 'Dew point margin')).toBe('—');
  });

  /**
   * **Zero is a measurement here, not a gap**, and it is exactly the input a
   * `!value` guard would drop: 0 mm is a dry hour the model reported.
   */
  it('treats a zero reading as measured', () => {
    const m = measurements({
      hour: measuredHour({ precip_mm: 0 }),
      weatherModel: 'gfs_seamless',
      reading: null,
      rainModels: null,
      readingModel: null,
    });
    expect(fieldNamed(m, 'Air', 'Rain, past hour')).toBe('0 in');
  });

  it('names a gust only when it is above the sustained wind', () => {
    const at = (wind: number | null, gust: number | null) =>
      fieldNamed(
        measurements({
          hour: measuredHour({ wind_kmh: wind, wind_gust_kmh: gust }),
          weatherModel: null,
          reading: null,
          rainModels: null,
          readingModel: null,
        }),
        'Air',
        'Gusts',
      );
    expect(at(14, 31)).toBe('19 mph');
    // `Gusts 9 mph` beside a 9 mph wind reads as a fault rather than as calm air.
    expect(at(14, 14)).toBeNull();
    // And none is invented against a missing sustained wind.
    expect(at(null, 31)).toBeNull();
  });

  it('explains the friction caveat wherever a friction reading is on screen', () => {
    expect(both().notes).toContain(FRICTION_MECHANISM);
  });

  it('says nothing about friction when there is no friction reading', () => {
    const m = measurements({
      hour: measuredHour(),
      weatherModel: null,
      reading: reading({ friction: null }),
      rainModels: null,
      readingModel: null,
    });
    expect(m.notes).not.toContain(FRICTION_MECHANISM);
  });

  it('explains the aspect caveat only for an hour that is carrying it', () => {
    expect(both().notes).not.toContain(UNRECORDED_ASPECT_MECHANISM);

    const unqualifiedFriction = measurements({
      hour: measuredHour(),
      weatherModel: null,
      reading: reading({ friction: friction({ qualified: false }) }),
      rainModels: null,
      readingModel: null,
    });
    expect(unqualifiedFriction.notes).toContain(UNRECORDED_ASPECT_MECHANISM);

    const unqualifiedRock = measurements({
      hour: measuredHour(),
      weatherModel: null,
      reading: reading({ rock: rock({ qualified: false }) }),
      rainModels: null,
      readingModel: null,
    });
    expect(unqualifiedRock.notes).toContain(UNRECORDED_ASPECT_MECHANISM);
  });

  /**
   * The rock temperature is the most instrument-looking figure on the panel and
   * nothing measures it. Printing it without this line invites a reader to take
   * it for an observation.
   */
  it('says the rock temperature is modelled whenever it prints one', () => {
    expect(both().notes).toContain(ROCK_TEMPERATURE_MECHANISM);

    const noSurface = measurements({
      hour: measuredHour(),
      weatherModel: null,
      reading: reading({ t_surface_c: null }),
      rainModels: null,
      readingModel: null,
    });
    expect(noSurface.notes).not.toContain(ROCK_TEMPERATURE_MECHANISM);
  });

  it('has nothing to show when neither an hour nor a reading arrived', () => {
    const m = measurements({
      hour: null,
      weatherModel: 'gfs_seamless',
      reading: null,
      rainModels: null,
      readingModel: 'gfs_seamless',
    });
    expect(m.groups).toEqual([]);
    expect(m.notes).toEqual([]);
    expect(m.sharedSource).toBeNull();
  });
});

describe('where the drying clock’s rain came from (issue #209)', () => {
  const reading = {
    valid_at: '2026-09-25T18:00:00.000Z',
    rock: { level: 'dry' as const, qualified: true },
    friction: null,
    score: null,
    t_surface_c: null,
    condensation_margin_c: null,
  }
  const base = { hour: null, weatherModel: null, reading, readingModel: 'gfs_seamless' }

  it('names every model behind a median, since none of them is the rock figures’ alone', () => {
    const m = measurements({
      ...base,
      rainModels: ['gfs_seamless', 'ecmwf_ifs025', 'icon_seamless', 'gem_seamless'],
    });
    expect(m.notes[0]).toBe('Rain: median forecast of GFS, ECMWF, ICON and GEM, not a gauge.');
  });

  it('names the one model when the rain was one model’s own', () => {
    const m = measurements({ ...base, rainModels: ['gfs_seamless'] });
    expect(m.notes[0]).toBe("Rain: GFS's forecast, not a gauge.");
  });

  it('explains nothing when no dryness reading is on screen, or the source is unnamed', () => {
    expect(measurements({ ...base, reading: { ...reading, rock: null }, rainModels: ['gfs_seamless'] }).notes).toEqual([]);
    expect(measurements({ ...base, rainModels: null }).notes).toEqual([]);
  });
});
