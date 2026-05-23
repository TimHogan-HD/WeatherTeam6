import { createApp } from './index.js';
import { logger } from './lib/logger.js';
import { initScheduler } from './jobs/scheduler.js';

function parsePort(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsed)) {
    logger.warn({ raw }, 'invalid PORT value; falling back to default');
    return fallback;
  }
  return parsed;
}

const port = parsePort(process.env.PORT, 3001);
const app = createApp();

app.listen(port, () => {
  logger.info({ port }, 'api listening');
  initScheduler().catch((err: Error) => {
    logger.error({ err: err.message }, 'failed to initialize job scheduler')
  })
});
