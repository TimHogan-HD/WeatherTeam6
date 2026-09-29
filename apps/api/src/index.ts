import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { logger } from './lib/logger.js';
import { describeError } from './lib/http.js';
import { requireApiAuth } from './middleware/apiAuth.js';
import { healthRouter } from './routes/health.js';
import { locationsRouter } from './routes/locations.js';
import { conditionsRouter } from './routes/conditions.js';
import { forecastRouter } from './routes/forecast.js';
import { hourlyRouter } from './routes/hourly.js';
import { alertsRouter } from './routes/alerts.js';
import { recentPrecipRouter } from './routes/recentPrecip.js'
import { wallsRouter } from './routes/walls.js'
import { guidebookRouter } from './routes/guidebook.js'
import { tripsRouter } from './routes/trips.js';
import { radarRouter } from './routes/radar.js';
import { geocodeRouter } from './routes/geocode.js';
import { previewRouter } from './routes/preview.js';
import { cronRouter } from './routes/cron.js';
import { authRouter } from './routes/auth.js';
import { feedbackRouter } from './routes/feedback.js';
import { logbookRouter } from './routes/logbook.js';
import { allowedOriginPatterns, originAllowed } from './lib/cors.js';

/**
 * The largest JSON body any route accepts. The biggest legitimate write is a
 * feedback message: `FEEDBACK_MESSAGE_MAX` is 4000 characters, which is up
 * to ~12 kB of UTF-8 in a non-Latin script before the readings are added. This
 * leaves room for that; its job is to stop a caller making the function parse
 * megabytes before a handler can say no. Express's own default is 100 kB.
 */
const JSON_BODY_LIMIT = '32kb'

/**
 * A client error raised by `express.json()` itself — malformed JSON (400), a
 * body over the limit (413), an unsupported charset (415). body-parser marks
 * these with a numeric `status` and a string `type`.
 */
function bodyParserStatus(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) return null
  const { status, type } = err as { status?: unknown; type?: unknown }
  if (typeof status !== 'number' || typeof type !== 'string') return null
  return status >= 400 && status < 500 ? status : null
}

export function createApp(): Express {
  const app = express();

  // Do not advertise the framework and version to every caller.
  app.disable('x-powered-by');

  // Response hardening for a JSON-only API. Nothing here is ever meant to be
  // framed, sniffed as HTML, or cached: every /api/v1 response is one user's
  // data behind a credential, and a shared or browser cache holding it would
  // outlive the session that fetched it.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    if (_req.method === 'OPTIONS') { res.sendStatus(204); return }
    next()
  })

  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  app.use(healthRouter);

  // The cron endpoint authenticates via CRON_SECRET, not req.userId — it acts
  // across all locations, not a single user's data — so it stays outside the
  // /api/v1 gate.
  app.use('/api/cron', cronRouter);

  // Above the gate, deliberately: you cannot present a token in order to obtain
  // one. authRouter responds on every path it handles, so an unmatched route
  // under /api/v1/auth falls through to requireApiAuth and 401s.
  app.use('/api/v1/auth', authRouter);

  // requireApiAuth sits inside the /api/v1 mount, so /api/cron keeps its own
  // auth (CRON_SECRET) and is unaffected. OPTIONS is already short-circuited by
  // the CORS layer above, so preflight never reaches here.
  //
  // **It is the only setter of req.userId anywhere in the app** — resolveUser is
  // gone with the webhook it existed for — so a router mounted outside it reads
  // undefined through a type that says it cannot be (defect class 8).
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
    guidebookRouter,
    tripsRouter,
    radarRouter,
    geocodeRouter,
    previewRouter,
    feedbackRouter,
    logbookRouter,
  );

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ data: null, error: 'Not found', status: 404 });
  });

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    // A malformed or oversized body is the caller's mistake, not an outage.
    // It used to fall through to the 500 below.
    const clientStatus = bodyParserStatus(err)
    if (clientStatus !== null) {
      logger.warn({ path: req.path, status: clientStatus }, 'rejected request body')
      res.status(clientStatus).json({ data: null, error: 'Invalid request body', status: clientStatus })
      return
    }
    // Through describeError, never the object itself: a driver error can carry
    // the connection string, and pino would serialise every field of it.
    logger.error({ err: describeError(err) }, 'unhandled error');
    res.status(500).json({ data: null, error: 'Internal server error', status: 500 });
  });

  return app;
}
