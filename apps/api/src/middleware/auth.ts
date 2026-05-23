import type { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger.js';

declare module 'express-serve-static-core' {
  interface Request {
    userId: string;
  }
}

export function resolveUser(req: Request, res: Response, next: NextFunction): void {
  const authEnabled = process.env.AUTH_ENABLED === 'true';

  if (authEnabled) {
    res.status(501).json({
      data: null,
      error: 'Authenticated mode not yet implemented',
      status: 501,
    });
    return;
  }

  const defaultUserId = process.env.DEFAULT_USER_ID;
  if (!defaultUserId) {
    logger.error('DEFAULT_USER_ID is not set while AUTH_ENABLED=false');
    res.status(500).json({
      data: null,
      error: 'Server misconfigured: DEFAULT_USER_ID missing',
      status: 500,
    });
    return;
  }

  req.userId = defaultUserId;
  next();
}
