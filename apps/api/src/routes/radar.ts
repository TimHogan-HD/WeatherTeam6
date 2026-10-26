import { Router, type Request, type Response } from 'express';
import { fetchLatestRadar } from '../lib/weather/iemRadar.js';
import { fetchRainRates } from '../lib/weather/mrmsRate.js';
import { sendServerError } from '../lib/http.js';
import { db } from '../db/index.js';
import { locations } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { parseNumericRequired, type RainNow } from '@weatherteam6/types';

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

/** Radar rain rate at every one of the caller's places, read from one MRMS frame (#313). */
radarRouter.get('/rain-now', async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({ id: locations.id, lat: locations.lat, lon: locations.lon })
      .from(locations)
      .where(eq(locations.user_id, req.userId));
    // `lat`/`lon` are numeric columns and arrive from the driver as strings.
    const rates = await fetchRainRates(
      rows.map((r) => ({ lat: parseNumericRequired(r.lat), lon: parseNumericRequired(r.lon) })),
    );
    // No frame in the last 15 minutes is an answer, not a fault: MRMS runs late
    // often enough that a 502 would read as the app being broken.
    if (rates === null) {
      res.json({ data: null, error: null, status: 200 });
      return;
    }
    const data: RainNow = {
      valid_at: rates.validAt.toISOString(),
      places: rows.map((r, i) => ({ location_id: r.id, rate_mm_h: rates.ratesMmH[i] ?? null })),
    };
    res.json({ data, error: null, status: 200 });
  } catch (err) {
    sendServerError(res, err, 'Failed to read radar rain');
  }
});
