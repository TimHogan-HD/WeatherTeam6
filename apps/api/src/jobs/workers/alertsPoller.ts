import { Worker, type Job } from 'bullmq'
import { bullConnection } from '../connection.js'
import { logger } from '../../lib/logger.js'

export const alertsPollerWorker = new Worker(
  'alerts-poller',
  async (_job: Job) => {
    logger.info('[alerts-poller] job started')
  },
  { connection: bullConnection, concurrency: 1 },
)

alertsPollerWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'alerts-poller job failed')
})
