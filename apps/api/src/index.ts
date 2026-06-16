import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { logger } from './lib/logger.js';
import { resolveUser } from './middleware/auth.js';
import { healthRouter } from './routes/health.js';
import { locationsRouter } from './routes/locations.js';
import { conditionsRouter } from './routes/conditions.js';
import { forecastRouter } from './routes/forecast.js';
import { alertsRouter } from './routes/alerts.js';
import { forecastSnapshotQueue, rainfallHistoryQueue, alertsPollerQueue, snapshotCleanupQueue } from './jobs/queues.js';
import './jobs/workers/forecastSnapshot.js';
import './jobs/workers/rainfallHistory.js';
import './jobs/workers/alertsPoller.js';
import './jobs/workers/snapshotCleanup.js';

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

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  createBullBoard({
    queues: [
      new BullMQAdapter(forecastSnapshotQueue),
      new BullMQAdapter(rainfallHistoryQueue),
      new BullMQAdapter(alertsPollerQueue),
      new BullMQAdapter(snapshotCleanupQueue),
    ],
    serverAdapter,
  });

  app.use(
    '/admin/queues',
    (req: Request, res: Response, next: NextFunction) => {
      const adminPassword = process.env.ADMIN_PASSWORD;
      // Fail closed: an unset ADMIN_PASSWORD must never expose the queue dashboard.
      if (!adminPassword) {
        res.status(503).json({ data: null, error: 'Admin console unavailable: ADMIN_PASSWORD is not configured', status: 503 });
        return;
      }
      const auth = req.headers.authorization;
      if (!auth || !auth.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
        res.status(401).json({ data: null, error: 'Unauthorized', status: 401 });
        return;
      }
      const credentials = Buffer.from(auth.slice(6), 'base64').toString('utf-8');
      // RFC 7617: the password is everything after the FIRST colon (it may itself contain colons).
      const sep = credentials.indexOf(':');
      const password = sep === -1 ? '' : credentials.slice(sep + 1);
      if (password !== adminPassword) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
        res.status(401).json({ data: null, error: 'Unauthorized', status: 401 });
        return;
      }
      next();
    },
    serverAdapter.getRouter(),
  );

  app.use(healthRouter);

  app.use(resolveUser);

  app.use(locationsRouter);
  app.use(conditionsRouter);
  app.use(forecastRouter);
  app.use(alertsRouter);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ data: null, error: 'Not found', status: 404 });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'unhandled error');
    res.status(500).json({ data: null, error: 'Internal server error', status: 500 });
  });

  return app;
}
