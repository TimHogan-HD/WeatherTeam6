import { Router, type Request, type Response } from 'express';
import { fetchLatestRadar, fetchRadarLayers } from '../lib/weather/iemRadar.js';
import { rainNowFor } from '../lib/weather/mrmsRate.js';
import { sendServerError } from '../lib/http.js';
import { db } from '../db/index.js';
import { locations } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const radarRouter = Router();

radarRouter.get('/radar/latest', async (_req: Request, res: Response) => {
  try {
    const latest = await fetchLatestRadar();
    if (latest === null) {
      res.status(502).json({ data: null, error: 'Radar is unavailable', status: 502 });
      return;
    }
    res.json({ data: latest, error: null, status: 200 });
  } catch (err) {
    sendServerError(res, err, 'Failed to fetch radar');
  }
});

/**
 * Frame times for every Map layer: the last hour of radar, the 24 and 72 hour
 * rain totals, and the HRRR forecast frames. Each part is null on its own when
 * IEM did not answer for it, so the route answers 200 with whatever it has.
 */
radarRouter.get('/radar/layers', async (_req: Request, res: Response) => {
  try {
    res.json({ data: await fetchRadarLayers(), error: null, status: 200 });
  } catch (err) {
    sendServerError(res, err, 'Failed to fetch radar layers');
  }
});

/** Radar rain rate at every one of the caller's places, read from one MRMS frame (#313). */
radarRouter.get('/rain-now', async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({ id: locations.id, lat: locations.lat, lon: locations.lon })
      .from(locations)
      .where(eq(locations.user_id, req.userId));
    res.json({ data: await rainNowFor(rows), error: null, status: 200 });
  } catch (err) {
    sendServerError(res, err, 'Failed to read radar rain');
  }
});
