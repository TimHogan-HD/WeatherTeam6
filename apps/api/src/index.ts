import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { logger } from './lib/logger.js';
import { resolveUser } from './middleware/auth.js';
import { requireApiAuth } from './middleware/apiAuth.js';
import { healthRouter } from './routes/health.js';
import { locationsRouter } from './routes/locations.js';
import { conditionsRouter } from './routes/conditions.js';
import { forecastRouter } from './routes/forecast.js';
import { hourlyRouter } from './routes/hourly.js';
import { alertsRouter } from './routes/alerts.js';
import { recentPrecipRouter } from './routes/recentPrecip.js'
import { wallsRouter } from './routes/walls.js'
import { tripsRouter } from './routes/trips.js';
import { radarRouter } from './routes/radar.js';
import { geocodeRouter } from './routes/geocode.js';
import { previewRouter } from './routes/preview.js';
import { cronRouter } from './routes/cron.js';
import { telegramWebhookRouter } from './routes/telegramWebhook.js';
import { authRouter } from './routes/auth.js';
import { allowedOriginPatterns, originAllowed } from './lib/cors.js';

export function createApp(): Express {
  const app = express();

  app.use((_req: Request, res: Response, next: NextFunction) => {
    const origin = _req.headers.origin
    // No Origin at all is curl, a script or another server — CORS does not
    // apply to them and omitting the header is not a refusal. Only a browser
    // enforces this, and only when it sent an Origin.
    if (typeof origin === 'string' && originAllowed(origin, allowedOriginPatterns())) {
      res.setHeader('Access-Control-Allow-Origin', origin)
    }
    // The response body now varies by request Origin, so a shared cache must
    // not serve one origin's headers to another.
    res.setHeader('Vary', 'Origin')
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

  // resolveUser is mounted HERE, not app-wide, and only because the webhook
  // reads req.userId: it authenticates by chat.id but still looks up the
  // caller's saved locations. Everything under /api/v1 gets its identity from
  // requireApiAuth instead. Phase 3 deletes this mount and resolveUser together.
  app.use('/api/telegram', resolveUser, telegramWebhookRouter);

  // Above the gate, deliberately: you cannot present a token in order to obtain
  // one. authRouter responds on every path it handles, so an unmatched route
  // under /api/v1/auth falls through to requireApiAuth and 401s.
  app.use('/api/v1/auth', authRouter);

  // requireApiAuth sits inside the /api/v1 mount, so /api/cron and /api/telegram
  // keep their own auth (CRON_SECRET / chat.id) and are unaffected. OPTIONS is
  // already short-circuited by the CORS layer above, so preflight never reaches here.
  //
  // It is also the only setter of req.userId for these routers — do not mount a
  // req.userId reader outside it.
  app.use(
    '/api/v1',
    requireApiAuth,
    locationsRouter,
    conditionsRouter,
    forecastRouter,
    hourlyRouter,
    recentPrecipRouter,
    alertsRouter,
    wallsRouter,
    tripsRouter,
    radarRouter,
    geocodeRouter,
    previewRouter,
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
