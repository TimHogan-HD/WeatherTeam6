import { describe, it, expect } from "vitest";
import { conditionsScore } from "./conditionsScore.js";
import { dryingModel } from "./dryingModel.js";
import { ROCK_TYPES } from "@weatherteam6/types";
import type { ScoreInput } from "@weatherteam6/types";

const base: ScoreInput = {
  rockType: "granite",
  aspectDegrees: 180,
  cliffAngle: 0,
  hoursSinceRain: 720,
  lastRainMm: 0,
  forecastRain72hMm: 0,
  forecastRain72hP10: 0,
  forecastRain72hP90: 0,
  currentWindKmh: 10,
  maxWindKmh24h: 10,
  currentTempC: 18,
  forecastHighC: 18,
  currentHumidityPct: 45,
  forecastDateDaysOut: 0,
};

describe("conditionsScore — forecast windows", () => {
  it(">14 days returns null score and pre window", () => {
    const result = conditionsScore({ ...base, forecastDateDaysOut: 15 });
    expect(result.score).toBeNull();
    expect(result.window).toBe("pre");
    expect(result.breakdown).toBeNull();
  });

  it("14 days is early window (not pre, which requires > 14)", () => {
    const result = conditionsScore({ ...base, forecastDateDaysOut: 14 });
    expect(result.window).toBe("early");
  });

  it("7-14 days is early window with forced low confidence", () => {
    const result = conditionsScore({
      ...base,
      forecastDateDaysOut: 10,
      forecastRain72hP10: 0,
      forecastRain72hP90: 0, // spread = 0 would normally give 'high'
    });
    expect(result.window).toBe("early");
    expect(result.confidence).toBe("low");
    expect(result.score).not.toBeNull();
  });

  it("exactly 7 days out is early window with forced low confidence", () => {
    // Spec: "7-14 days out" → forced low. Boundary check: >= 7 not > 7.
    const result = conditionsScore({
      ...base,
      forecastDateDaysOut: 7,
      forecastRain72hP10: 0,
      forecastRain72hP90: 0, // tight spread would give 'high' if not forced
    });
    expect(result.window).toBe("early");
    expect(result.confidence).toBe("low");
  });

  it("<7 days is decision window", () => {
    const result = conditionsScore({ ...base, forecastDateDaysOut: 3 });
    expect(result.window).toBe("decision");
  });
});

describe("conditionsScore — confidence from spread", () => {
  it("spread <= 2mm → high confidence", () => {
    const result = conditionsScore({
      ...base,
      forecastDateDaysOut: 3,
      forecastRain72hP10: 0,
      forecastRain72hP90: 1,
    });
    expect(result.confidence).toBe("high");
  });

  it("spread 2-8mm → medium confidence", () => {
    const result = conditionsScore({
      ...base,
      forecastDateDaysOut: 3,
      forecastRain72hP10: 0,
      forecastRain72hP90: 5,
    });
    expect(result.confidence).toBe("medium");
  });

  it("spread > 8mm → low confidence", () => {
    const result = conditionsScore({
      ...base,
      forecastDateDaysOut: 3,
      forecastRain72hP10: 0,
      forecastRain72hP90: 20,
    });
    expect(result.confidence).toBe("low");
  });
});

describe("conditionsScore — drying component", () => {
  it("score is 0 when it just rained", () => {
    const result = conditionsScore({ ...base, hoursSinceRain: 0 });
    expect(result.components.drying_time).toBe(0);
  });

  it("score is 40 when well past maxDry", () => {
    // granite cliffAngle=0: maxDry = 12h * 1.0 * 1.0 * 1.0 = 12h
    const result = conditionsScore({
      ...base,
      hoursSinceRain: 720,
      cliffAngle: 0,
    });
    expect(result.components.drying_time).toBe(40);
  });

  it("wind >20 km/h reduces maxDry → higher drying score at same hours", () => {
    const withWind = conditionsScore({
      ...base,
      currentWindKmh: 25,
      hoursSinceRain: 10,
      cliffAngle: 0,
      rockType: "granite",
    });
    const withoutWind = conditionsScore({
      ...base,
      currentWindKmh: 10,
      hoursSinceRain: 10,
      cliffAngle: 0,
      rockType: "granite",
    });
    expect(withWind.components.drying_time).toBeGreaterThan(
      withoutWind.components.drying_time,
    );
  });

  it("humidity >80% increases maxDry → lower drying score at same hours", () => {
    const highHumidity = conditionsScore({
      ...base,
      currentHumidityPct: 85,
      hoursSinceRain: 10,
      cliffAngle: 0,
      rockType: "granite",
    });
    const normalHumidity = conditionsScore({
      ...base,
      currentHumidityPct: 50,
      hoursSinceRain: 10,
      cliffAngle: 0,
      rockType: "granite",
    });
    expect(highHumidity.components.drying_time).toBeLessThan(
      normalHumidity.components.drying_time,
    );
  });

  /**
   * **The four tests above do not constrain the shape of the ramp.** Each of them
   * compares two scores under the same curve, so they pass identically whether the
   * ramp is linear, `x²` or `√x` — including `√x`, which is the bug #137 fixed,
   * inverted. They pin the modifiers; nothing pinned the curve.
   *
   * That is defect-patterns §11 in its usual form: ask which line of the
   * implementation would have to change for the assertion to fail. For everything
   * below, the answer is `RAMP_EXPONENT`.
   *
   * `base` is granite at `cliffAngle: 0`, wind 10 and humidity 45 — none of the
   * three modifiers fire, so `maxDry` is the raw table value of **12h** and the
   * arithmetic in these tests can be checked by hand.
   */
  it("at half the drying window the ramp awards a quarter of the points, not half", () => {
    const result = conditionsScore({
      ...base,
      hoursSinceRain: 6,
      cliffAngle: 0,
    });
    // Linear gave 20 of 40 here. (6/12)² × 40 = 10.
    expect(result.components.drying_time).toBe(10);
  });

  it("the day after rain on sandstone — the case issue #137 was filed over", () => {
    // Sandstone at a 45° cliff: maxDry = 72 × 1.15 = 82.8h. At 36h the wall looks
    // dry and is not. The linear ramp paid 17 of 40 for that; the curve pays 8.
    const result = conditionsScore({
      ...base,
      rockType: "sandstone",
      cliffAngle: 45,
      hoursSinceRain: 36,
    });
    expect(result.components.drying_time).toBe(8);
  });

  it("never awards more than the linear ramp it replaced, and sometimes less", () => {
    // The property the change was made to guarantee, and the one that made it safe
    // to ship: no location can score HIGHER than it did before #137.
    //
    // `maxDry` is READ BACK from the scorer rather than written as 12 here: a change
    // to `MAX_HOURS.granite` would otherwise leave this comparing the curve against
    // a linear reference of the wrong width, still green and no longer the property.
    const maxDry = conditionsScore({
      ...base,
      hoursSinceRain: 0,
      cliffAngle: 0,
    }).breakdown?.drying.hours_remaining;
    if (maxDry === undefined) throw new Error("no breakdown");
    expect(maxDry).toBe(12);
    let everLower = false;
    for (let h = 0; h <= maxDry; h += 0.5) {
      const actual = conditionsScore({
        ...base,
        hoursSinceRain: h,
        cliffAngle: 0,
      }).components.drying_time;
      const linear = Math.round((h / maxDry) * 40);
      expect(actual).toBeLessThanOrEqual(linear);
      if (actual < linear) everLower = true;
    }
    // Without this the test would pass against a ramp that never moved at all.
    expect(everLower).toBe(true);
  });

  it("a negative hoursSinceRain scores 0, not a positive share of the curve", () => {
    // An even exponent squares the sign away. Without the `<= 0` guard, -6h on a
    // 12h window would award the same 10 points as +6h — a wall that rained in the
    // future, handed drying credit, as a number a reader would believe.
    const result = conditionsScore({
      ...base,
      hoursSinceRain: -6,
      cliffAngle: 0,
    });
    expect(result.components.drying_time).toBe(0);
  });

  it("slab (cliffAngle=90) dries slower than vertical wall (cliffAngle=0)", () => {
    const slab = conditionsScore({
      ...base,
      cliffAngle: 90,
      hoursSinceRain: 10,
      rockType: "granite",
    });
    const vertical = conditionsScore({
      ...base,
      cliffAngle: 0,
      hoursSinceRain: 10,
      rockType: "granite",
    });
    expect(slab.components.drying_time).toBeLessThan(
      vertical.components.drying_time,
    );
  });
});

describe("conditionsScore — rain component", () => {
  it("0mm forecast → rain score = 25", () => {
    const result = conditionsScore({ ...base, forecastRain72hMm: 0 });
    expect(result.components.upcoming_rain).toBe(25);
  });

  it(">=10mm forecast → rain score = 0", () => {
    const result = conditionsScore({ ...base, forecastRain72hMm: 10 });
    expect(result.components.upcoming_rain).toBe(0);
  });

  it("rain score decreases monotonically with more rain", () => {
    const r0 = conditionsScore({ ...base, forecastRain72hMm: 0 }).components
      .upcoming_rain;
    const r5 = conditionsScore({ ...base, forecastRain72hMm: 5 }).components
      .upcoming_rain;
    const r10 = conditionsScore({ ...base, forecastRain72hMm: 10 }).components
      .upcoming_rain;
    expect(r0).toBeGreaterThan(r5);
    expect(r5).toBeGreaterThan(r10);
  });
});

describe("conditionsScore — wind component", () => {
  it("<=15 km/h → wind score = 15", () => {
    const result = conditionsScore({ ...base, maxWindKmh24h: 10 });
    expect(result.components.wind).toBe(15);
  });

  it(">=50 km/h → wind score = 0", () => {
    const result = conditionsScore({ ...base, maxWindKmh24h: 55 });
    expect(result.components.wind).toBe(0);
  });

  it("scales between 15 and 50 km/h instead of stepping straight to zero", () => {
    // Only the two ends were pinned, so the whole interpolation was unasserted:
    // replacing the `>= 50` test with `true` collapses every breezy day to a
    // zero wind component and nothing failed. Found by mutation testing.
    expect(
      conditionsScore({ ...base, maxWindKmh24h: 25 }).components.wind,
    ).toBe(11);
    expect(
      conditionsScore({ ...base, maxWindKmh24h: 40 }).components.wind,
    ).toBe(4);
  });

  it("reaches 15 at 15 km/h and 0 at 50 km/h", () => {
    // Endpoint values, not operator discrimination. The piecewise function is
    // continuous at both knots — at 15 the interpolation also yields 15, and at
    // 50 it also yields 0 — so `<=`/`>=` and `<`/`>` are indistinguishable here
    // whatever the name says. The `<= 15` and `>= 50` mutants are killed by the
    // "scales between" test above; this one pins the band's endpoints against a
    // change to the constants.
    expect(
      conditionsScore({ ...base, maxWindKmh24h: 15 }).components.wind,
    ).toBe(15);
    expect(
      conditionsScore({ ...base, maxWindKmh24h: 50 }).components.wind,
    ).toBe(0);
  });
});

describe("conditionsScore — temperature component", () => {
  it("optimal range 10-22°C → temp score = 12", () => {
    expect(
      conditionsScore({ ...base, forecastHighC: 15 }).components.temp,
    ).toBe(12);
    expect(
      conditionsScore({ ...base, forecastHighC: 10 }).components.temp,
    ).toBe(12);
    expect(
      conditionsScore({ ...base, forecastHighC: 22 }).components.temp,
    ).toBe(12);
  });

  it("<0°C or >35°C → temp score = 0", () => {
    expect(
      conditionsScore({ ...base, forecastHighC: -1 }).components.temp,
    ).toBe(0);
    expect(
      conditionsScore({ ...base, forecastHighC: 36 }).components.temp,
    ).toBe(0);
  });

  it("0°C scores 0, 5°C scores mid-range", () => {
    expect(conditionsScore({ ...base, forecastHighC: 0 }).components.temp).toBe(
      0,
    );
    const mid = conditionsScore({ ...base, forecastHighC: 5 }).components.temp;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(12);
  });

  it("35°C scores ~6", () => {
    const result = conditionsScore({ ...base, forecastHighC: 35 });
    expect(result.components.temp).toBe(6);
  });
});

describe("conditionsScore — humidity component", () => {
  it("<=50% → humidity score = 8", () => {
    expect(
      conditionsScore({ ...base, currentHumidityPct: 40 }).components.humidity,
    ).toBe(8);
  });

  it(">=90% → humidity score = 0", () => {
    expect(
      conditionsScore({ ...base, currentHumidityPct: 95 }).components.humidity,
    ).toBe(0);
  });

  it("scales between 50% and 90% instead of stepping straight to zero", () => {
    expect(
      conditionsScore({ ...base, currentHumidityPct: 70 }).components.humidity,
    ).toBe(4);
    expect(
      conditionsScore({ ...base, currentHumidityPct: 60 }).components.humidity,
    ).toBe(6);
  });

  it("reaches 8 at 50% and 0 at 90%", () => {
    // Endpoint values, not operator discrimination — same continuity as the
    // wind band above.
    expect(
      conditionsScore({ ...base, currentHumidityPct: 50 }).components.humidity,
    ).toBe(8);
    expect(
      conditionsScore({ ...base, currentHumidityPct: 90 }).components.humidity,
    ).toBe(0);
  });
});

describe("conditionsScore — totals", () => {
  it("perfect conditions → score = 100", () => {
    // granite cliffAngle=0, 720h since rain, no forecast rain, light wind, ideal temp, low humidity
    const result = conditionsScore({
      ...base,
      rockType: "granite",
      cliffAngle: 0,
      hoursSinceRain: 720,
      forecastRain72hMm: 0,
      maxWindKmh24h: 10,
      forecastHighC: 18,
      currentHumidityPct: 30,
      currentWindKmh: 10,
    });
    expect(result.score).toBe(100);
  });

  it("score is clamped 0-100", () => {
    const result = conditionsScore(base);
    expect(result.score).not.toBeNull();
    expect(result.score!).toBeGreaterThanOrEqual(0);
    expect(result.score!).toBeLessThanOrEqual(100);
  });

  it("breakdown.total matches score", () => {
    const result = conditionsScore(base);
    expect(result.breakdown?.total).toBe(result.score);
  });

  it("breakdown component scores sum to total", () => {
    const result = conditionsScore(base);
    const bd = result.breakdown!;
    const componentSum =
      bd.drying.score +
      bd.rain.score +
      bd.wind.score +
      bd.temp.score +
      bd.humidity.score;
    expect(componentSum).toBe(bd.total);
  });

  it("all rock types produce valid scores", () => {
    const types: ScoreInput["rockType"][] = [
      "sandstone",
      "limestone",
      "granite",
      "basalt",
      "unknown",
    ];
    for (const rockType of types) {
      const result = conditionsScore({ ...base, rockType });
      expect(result.score).not.toBeNull();
      expect(result.score!).toBeGreaterThanOrEqual(0);
      expect(result.score!).toBeLessThanOrEqual(100);
    }
  });
});

describe("conditionsScore — the two MAX_HOURS tables must agree", () => {
  /**
   * **`dryingModel.ts` and `conditionsScore.ts` each keep their own copy of
   * `MAX_HOURS`.** One decides `estimated_dry`; the other scales the 0-40 drying
   * component. `Record<RockType, number>` stops either *omitting* a rock type,
   * and nothing at all stops them disagreeing about a *value* — a wall would
   * report as dry while scoring as wet, or the reverse, with both files looking
   * correct on their own.
   *
   * Neither table is exported, so this reads them through behaviour rather than
   * widening the module surface for a test. With every modifier neutral —
   * vertical wall, wind at or below 20, humidity at or below 80 — `maxDry` is the
   * raw table value, so `hours_remaining` at `hoursSinceRain: 0` *is*
   * `conditionsScore`'s number. `dryingModel` is then asked whether the wall is
   * dry at exactly that hour and one hour short of it.
   */
  const NEUTRAL = {
    ...base,
    cliffAngle: 0,
    currentWindKmh: 10,
    currentHumidityPct: 45,
  };

  const RAIN_DAY = "2025-05-31";
  /** The rain day ends at 23:59:59Z, which is what `dryingModel` measures from. */
  const RAIN_END_MS = Date.parse(`${RAIN_DAY}T23:59:59Z`);

  for (const rockType of ROCK_TYPES) {
    it(`${rockType}: the drying ceiling is the same number in both modules`, () => {
      const result = conditionsScore({
        ...NEUTRAL,
        rockType,
        hoursSinceRain: 0,
      });
      const maxDry = result.breakdown?.drying.hours_remaining;
      expect(maxDry).toBeGreaterThan(0);
      if (maxDry === undefined) throw new Error("no breakdown");

      const dryAt = (hours: number): boolean =>
        dryingModel({
          rockType,
          cliffAngle: 0,
          rainfallEvents: [{ date: RAIN_DAY, precip_mm: 10 }],
          asOf: new Date(RAIN_END_MS + hours * 60 * 60 * 1000),
        }).estimated_dry;

      // At conditionsScore's ceiling, dryingModel agrees the wall is dry;
      // an hour short of it, it does not. That pins one number, not a range.
      expect(dryAt(maxDry)).toBe(true);
      expect(dryAt(maxDry - 1)).toBe(false);
    });
  }
});
