/**
 * The temperature chart's colour band, in °C — the one thing left here from the
 * five-component scorer, which was retired in scoring Phase 5b (2026-10-01)
 * along with `SCORE_COMPONENT_MAX`.
 *
 * **It is no longer the score's band.** It was that scorer's temperature
 * component, and the web app's diverging temperature ramp is still centred on
 * it (`IDEAL_TEMP_C` in `chartStyle.ts`). Crag A judges friction against a
 * different range — 30–60 °F, or the reader's own (`TEMP_RANGE_DEFAULT_F`,
 * `preferences.ts`) — so a 65 °F hour paints neutral on the chart while the
 * score is docking it. Re-centring the ramp on Crag A's range is a visual
 * change left for the owner to decide; until then this is the chart's band only.
 *
 * **These are air temperatures, not rock temperatures.**
 */
export const TEMP_BAND_C = {
  /** The cold end of the ramp. */
  min: 0,
  /** The bottom of the neutral zone. */
  idealMin: 10,
  /** The top of the neutral zone. */
  idealMax: 22,
  /** The hot end of the ramp. */
  max: 35,
} as const;
