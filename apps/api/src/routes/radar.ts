import { Router, type Request, type Response } from 'express';
import { fetchRadarFrames } from '../lib/weather/rainViewer.js';
import { sendServerError } from '../lib/http.js';

export const radarRouter = Router();

radarRouter.get('/radar/frames', async (_req: Request, res: Response) => {
  try {
    const frames = await fetchRadarFrames();
    res.json({ data: frames, error: null, status: 200 });
  } catch (err) {
    sendServerError(res, err, 'Failed to fetch radar frames');
  }
});
