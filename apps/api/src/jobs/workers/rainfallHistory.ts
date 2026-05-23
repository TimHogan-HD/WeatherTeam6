import { Worker, type Job } from 'bullmq'
import { bullConnection } from '../connection.js'
import { logger } from '../../lib/logger.js'

export const rainfallHistoryWorker = new Worker(
  'rainfall-history',
  async (_job: Job) => {
    logger.info('[rainfall-history] job started')
  },
  { connection: bullConnection, concurrency: 1 },
)

rainfallHistoryWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'rainfall-history job failed')
})
