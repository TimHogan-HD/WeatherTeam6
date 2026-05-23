import { Worker, type Job } from 'bullmq'
import { bullConnection } from '../connection.js'
import { logger } from '../../lib/logger.js'

export const forecastSnapshotWorker = new Worker(
  'forecast-snapshot',
  async (_job: Job) => {
    logger.info('[forecast-snapshot] job started')
  },
  { connection: bullConnection, concurrency: 1 },
)

forecastSnapshotWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'forecast-snapshot job failed')
})
