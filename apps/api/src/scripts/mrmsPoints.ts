/**
 * The airport gauges `compare:dryness` scores against, each paired with a crag
 * near it, for `compare:mrms`. Crag points are the centre of `KNOWN_CRAGS`'
 * box where one exists.
 */
export type MrmsPair = { station: string; crag: string; lat: number; lon: number }

export const MRMS_PAIRS: MrmsPair[] = [
  { station: 'DLL', crag: "Devil's Lake", lat: 43.4153, lon: -89.7045 },
  { station: 'RGK', crag: 'Red Wing', lat: 44.5694, lon: -92.5260 },
  { station: 'RNH', crag: 'Willow River', lat: 45.0193, lon: -92.6795 },
  { station: 'RNH', crag: 'Taylors Falls', lat: 45.3954, lon: -92.6616 },
  { station: 'TWM', crag: 'Palisade Head', lat: 47.3207, lon: -91.2107 },
  { station: 'POU', crag: 'Gunks', lat: 41.7400, lon: -74.1900 },
  { station: 'LEX', crag: 'Red River Gorge', lat: 37.7800, lon: -83.6800 },
  { station: 'BJC', crag: 'Eldorado Canyon', lat: 39.9192, lon: -105.3110 },
  { station: 'RDM', crag: 'Smith Rock', lat: 44.3669, lon: -121.1399 },
  { station: 'BIH', crag: 'The Buttermilks', lat: 37.3030, lon: -118.6081 },
  { station: 'VGT', crag: 'Red Rock NV', lat: 36.1350, lon: -115.4280 },
  { station: 'AVL', crag: 'Looking Glass Rock', lat: 35.3035, lon: -82.7928 },
  { station: 'LEB', crag: 'Rumney', lat: 43.8073, lon: -71.8404 },
  { station: 'CHA', crag: 'Stone Fort (Chattanooga)', lat: 35.2280, lon: -85.2160 },
]
