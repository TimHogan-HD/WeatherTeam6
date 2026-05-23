import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { logger } from './lib/logger.js';
import { resolveUser } from './middleware/auth.js';
import { healthRouter } from './routes/health.js';

export function createApp(): Express {
  const app = express();

  app.use(express.json());
  app.use(resolveUser);
  app.use(healthRouter);

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ data: null, error: 'Not found', status: 404 });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, 'unhandled error');
    res.status(500).json({ data: null, error: 'Internal server error', status: 500 });
  });

  return app;
}

const port = Number(process.env.PORT ?? 3001);

const app = createApp();

app.listen(port, () => {
  logger.info({ port }, 'api listening');
});
