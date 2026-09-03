/**
 * Plain-language labels for Open-Meteo geocoding's `feature_code`, shared by
 * the Mini App's `/add` search and (eventually) the bot's own picker, so the
 * two surfaces cannot describe the same code differently.
 *
 * It exists because `GeocodeResult` used to drop `feature_code` entirely
 * (issue #82) — "Willow River" returned five near-identical rows across two
 * states, and nothing distinguished the Minnesota town from the Wisconsin
 * state park 90 miles away. A wrong pick there is a wrong forecast forever,
 * silently, until someone notices.
 *
 * Deliberately partial: an unmapped GeoNames code returns `null` rather than
 * the raw code (`PPLA2` means nothing to a climber), and a `null` is meant to
 * be omitted by the caller, not rendered as an empty or placeholder string.
 */
const GEOCODE_KIND_LABELS: Record<string, string> = {
  PPL: 'Town',
  PPLA: 'City',
  PPLA2: 'Town',
  PPLA3: 'Town',
  PPLA4: 'Town',
  PPLA5: 'Town',
  PPLC: 'Capital',
  PPLG: 'Town',
  PPLL: 'Locality',
  PPLQ: 'Former town',
  PPLX: 'Neighborhood',
  PRK: 'Park',
  RESV: 'Reservoir',
  RESN: 'Nature reserve',
  DAM: 'Dam',
  MT: 'Mountain',
  MTS: 'Mountains',
  PK: 'Peak',
  PKS: 'Peaks',
  CLF: 'Cliff',
  RK: 'Rock',
  RKS: 'Rocks',
  CNYN: 'Canyon',
  VAL: 'Valley',
  VALX: 'Valley',
  PASS: 'Mountain pass',
  FRST: 'Forest',
  ISL: 'Island',
  LK: 'Lake',
  STM: 'Stream',
  AREA: 'Area',
  ADM1: 'State or province',
  ADM2: 'County',
  PCLI: 'Country',
};

/** `null` for an unmapped or absent code — see the module comment on why that must not become a raw code or an empty string. */
export function geocodeKindLabel(featureCode: string | null): string | null {
  if (featureCode === null) return null;
  return GEOCODE_KIND_LABELS[featureCode] ?? null;
}
