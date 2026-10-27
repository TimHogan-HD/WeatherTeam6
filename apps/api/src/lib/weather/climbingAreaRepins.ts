/**
 * **Areas whose OpenBeta point is nowhere near their rock, re-pinned on every
 * `climbing:pull`.** The snapshot is regenerated, so a hand edit to it would be
 * lost; `pullClimbingAreas.ts` applies this table instead. An entry moves the
 * point `/add` saves — and fetches weather for — onto the climbing.
 */
export const REPINNED_AREAS: ReadonlyMap<string, { lat: number; lon: number }> = new Map([
  // Sandstone, MN (#417): OpenBeta pins it 11 km west of the walls, with no
  // cliffs near it (USGS 1 m lidar, 2026-10-27). Its climbs are at Robinson
  // Park, so it takes Robinson Park's point.
  ['8bbb8f66-ec75-5d5f-90c7-2811b8d4f27b', { lat: 46.13502, lon: -92.85925 }],
])
