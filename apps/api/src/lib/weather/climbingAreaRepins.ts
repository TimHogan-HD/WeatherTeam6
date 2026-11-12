/**
 * **Areas whose OpenBeta point is nowhere near their rock, re-pinned on every
 * `climbing:pull` and `guidebook:pull`.** The snapshots are regenerated, so a
 * hand edit to them would be lost; `pullClimbingAreas.ts` and `pullGuidebook.ts`
 * apply this table instead. An entry moves the point `/add` saves — and fetches
 * weather for — onto the climbing, and the guidebook's box with it, so the saved
 * crag still reaches its routes (`guidebookFor`, `GUIDEBOOK_REACH_KM`).
 */
export const REPINNED_AREAS: ReadonlyMap<string, { lat: number; lon: number }> = new Map([
  // Sandstone, MN (#417): OpenBeta pins it 11 km west of the walls, with no
  // cliffs near it (USGS 1 m lidar, 2026-10-27). Its climbs are at Robinson
  // Park, so it takes Robinson Park's point.
  ['8bbb8f66-ec75-5d5f-90c7-2811b8d4f27b', { lat: 46.13502, lon: -92.85925 }],
  // Silver Creek Tunnel (#582): OpenBeta pins the area, its rock and its ice at
  // Lafayette Bluff Tunnel (47.0956, -91.5521, OSM way/119220212), 4.4 km
  // north-east. The climbing is at Silver Creek Cliff, "the more south, of the
  // two tunnels on this road" (Mountain Project), whose routes all carry
  // 47.06756, -91.59324, inside OSM's Silver Creek Cliff Tunnel (way/44076264).
  ['9a056e4e-f8b8-5a42-a9e4-68b287040eea', { lat: 47.06756, lon: -91.59324 }], // Silver Creek Tunnel Area (North Shore)
  ['9786120a-d524-5315-bdd9-9642b8141109', { lat: 47.06756, lon: -91.59324 }], // Silver Creek Tunnel Rock
  ['e0adb0f4-f9bc-5680-9a9c-166afd058e06', { lat: 47.06756, lon: -91.59324 }], // Silver Creek Tunnel ICE
])
