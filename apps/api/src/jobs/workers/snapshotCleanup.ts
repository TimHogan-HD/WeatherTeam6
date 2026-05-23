import { Worker, type Job } from 'bullmq'
import { bullConnection } from '../connection.js'
import { logger } from '../../lib/logger.js'

export const snapshotCleanupWorker = new Worker(
  'snapshot-cleanup',
  async (_job: Job) => {
    logger.info('[snapshot-cleanup] job started')
  },
  { connection: bullConnection, concurrency: 1 },
)

snapshotCleanupWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'snapshot-cleanup job failed')
})
