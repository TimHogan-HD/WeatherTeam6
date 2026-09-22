import type { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger.js';

declare module 'express-serve-static-core' {
  interface Request {
    userId: string;
  }
}

/**
 * The owner identity for the Telegram webhook, and **nothing else**.
 *
 * This used to be mounted app-wide. It is not any more: `requireApiAuth` sets
 * `req.userId` for every route under `/api/v1`, from the presented credential,
 * and this is mounted on `/api/telegram` alone (`index.ts`).
 *
 * It survives that narrowing because `telegramWebhook.ts` is a confirmed
 * `req.userId` reader — it authenticates by `chat.id` but still looks up the
 * caller's saved locations — and the bot is alive until migration Phase 3
 * (`docs/handoffs/leave-telegram-v1.md`). **Phase 3 deletes the webhook mount
 * and this file together.**
 *
 * The `AUTH_ENABLED=true` → 501 branch is gone: real authentication exists now,
 * and a flag that turned it off would only describe a state the API no longer
 * has.
 */
export function resolveUser(req: Request, res: Response, next: NextFunction): void {
  const defaultUserId = process.env.DEFAULT_USER_ID;
  if (!defaultUserId) {
    logger.error('DEFAULT_USER_ID is not set');
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
