import { Router, type Request, type Response } from 'express';
import { fetchLatestRadar } from '../lib/weather/iemRadar.js';
import { sendServerError } from '../lib/http.js';

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
