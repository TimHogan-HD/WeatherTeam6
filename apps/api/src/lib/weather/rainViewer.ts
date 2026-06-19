import { logger } from '../logger.js';

const MAPS_API = 'https://api.rainviewer.com/public/weather-maps.json';
const TILE_HOST = 'https://tilecache.rainviewer.com';

export type RadarFrame = {
  time: number;
  path: string;
};

export type RadarFramesResponse = {
  generated: number;
  host: string;
  tileUrlTemplate: string;
  past: RadarFrame[];
  nowcast: RadarFrame[];
};

export async function fetchRadarFrames(): Promise<RadarFramesResponse> {
  const res = await fetch(MAPS_API, {
    headers: { 'User-Agent': process.env.NWS_USER_AGENT ?? 'weatherteam6/1.0' },
  });
  if (!res.ok) {
    throw new Error(`RainViewer maps API returned ${res.status}`);
  }
  const json = await res.json() as {
    generated: number;
    host: string;
    radar?: { past?: Array<{ time: number; path: string }>; nowcast?: Array<{ time: number; path: string }> };
  };

  const past: RadarFrame[] = (json.radar?.past ?? []).map((f) => ({
    time: f.time,
    path: f.path,
  }));
  const nowcast: RadarFrame[] = (json.radar?.nowcast ?? []).map((f) => ({
    time: f.time,
    path: f.path,
  }));

  logger.debug({ pastCount: past.length, nowcastCount: nowcast.length }, 'rainViewer frames fetched');

  // Tile URL template: replace {path} with frame.path, then fill {z}/{x}/{y}
  // Colour scheme 4 = Original (blue→amber→red), smooth=1, snow=1
  const tileUrlTemplate = `${TILE_HOST}{path}/{z}/{x}/{y}/4/1_1.png`;

  return {
    generated: json.generated,
    host: TILE_HOST,
    tileUrlTemplate,
    past,
    nowcast,
  };
}
