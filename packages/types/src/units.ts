/**
 * Unit conversion and display formatting, shared by `apps/api` and
 * `apps/miniapp`. Specified by miniapp-design-v1.md §4.
 *
 * **Every input is nullable, and that is the whole point.** `ForecastSnapshot`'s
 * `temp_c_max`, `wind_kmh_max`, `humidity_pct` and `precip_mm_p50` are all
 * `number | null`, and JavaScript coerces `null` to `0` — so a naive
 * `cToF(null)` renders **32°F** and `kmhToMph(null)` renders **0 mph**.
 * Plausible-looking values for missing data are worse than a visible gap, so
 * the formatters take `number | null` and return an em dash.
 *
 * These formatters are authoritative for any string a user reads.
 * `packages/design`'s `units` export defines the same four labels and is
 * **superseded for rendered text** — if the two drift, these win. Rounding here
 * is display-only; the API's metric values stay canonical end to end and
 * nothing is ever rounded before scoring.
 */

/** Rendered in place of any value that is missing. */
export const EM_DASH = '—';

export const cToF = (c: number): number => (c * 9) / 5 + 32;
export const kmhToMph = (kmh: number): number => kmh * 0.621371;
export const mmToIn = (mm: number): number => mm / 25.4;

export const formatTempF = (c: number | null): string =>
  c === null ? EM_DASH : `${Math.round(cToF(c))}°F`;

export const formatWindMph = (kmh: number | null): string =>
  kmh === null ? EM_DASH : `${Math.round(kmhToMph(kmh))} mph`;

export const formatHumidity = (pct: number | null): string =>
  pct === null ? EM_DASH : `${Math.round(pct)}%`;

/**
 * Trace amounts must not render as `0.00 in`. 0.2 mm of forecast rain already
 * docks the rain component, and a screen showing `0.00 in` next to a reduced
 * score contradicts the rule that weather explains the score.
 */
export const formatPrecipIn = (mm: number | null): string => {
  if (mm === null) return EM_DASH;
  if (mm === 0) return '0 in';
  const inches = mmToIn(mm);
  return inches < 0.01 ? 'trace' : `${inches.toFixed(2)} in`;
};

export const mToFt = (m: number): number => m * 3.280839895;

/**
 * Elevation, in feet — `packages/design`'s unit table says feet, like the other
 * four.
 *
 * Here rather than in the Mini App component that needed it first, for the same
 * reason the other formatters are here: the bot's `/weather` panel shows the
 * same column, and a second copy is how two surfaces start disagreeing about
 * the same crag. Thousands are separated, because a bare `10500` at label size
 * is read wrong.
 */
export const formatElevationFt = (m: number | null): string =>
  m === null ? EM_DASH : `${Math.round(mToFt(m)).toLocaleString('en-US')} ft`;
