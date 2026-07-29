import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { logger } from './lib/logger.js';
import { resolveUser } from './middleware/auth.js';
import { healthRouter } from './routes/health.js';
import { locationsRouter } from './routes/locations.js';
import { conditionsRouter } from './routes/conditions.js';
import { forecastRouter } from './routes/forecast.js';
import { alertsRouter } from './routes/alerts.js';
import { wallsRouter } from './routes/walls.js'
import { tripsRouter } from './routes/trips.js';
import { radarRouter } from './routes/radar.js';
import { cronRouter } from './routes/cron.js';
import { telegramWebhookRouter } from './routes/telegramWebhook.js';

export function createApp(): Express {
  const app = express();

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    if (_req.method === 'OPTIONS') { res.sendStatus(204); return }
    next()
  })

  app.use(express.json());

  app.use(healthRouter);

  // The cron endpoint authenticates via CRON_SECRET, not req.userId — it acts
  // across all locations, not a single user's data — so it stays outside resolveUser.
  app.use('/api/cron', cronRouter);

  app.use(resolveUser);

  // The Telegram webhook authenticates via chat.id but still needs req.userId
  // (DEFAULT_USER_ID) to look up the caller's saved locations, same as every other route.
  app.use('/api/telegram', telegramWebhookRouter);

  app.use(
    '/api/v1',
    locationsRouter,
    conditionsRouter,
    forecastRouter,
    alertsRouter,
    wallsRouter,
    tripsRouter,
    radarRouter,
  );

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ data: null, error: 'Not found', status: 404 });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'unhandled error');
    res.status(500).json({ data: null, error: 'Internal server error', status: 500 });
  });

  return app;
}
