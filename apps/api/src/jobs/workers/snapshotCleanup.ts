import { Worker, type Job } from 'bullmq'
import { sql } from 'drizzle-orm'
import { db } from '../../db/index.js'
import { conditionsScores, forecastSnapshots } from '../../db/schema.js'
import { logger } from '../../lib/logger.js'
import { bullConnection } from '../connection.js'

export const snapshotCleanupWorker = new Worker(
  'snapshot-cleanup',
  async (_job: Job) => {
    logger.info('[snapshot-cleanup] job started')

    // Drizzle has no typed helper for date arithmetic against NOW() / CURRENT_DATE,
    // so the sql template tag is required here.
    const deletedSnapshots = await db
      .delete(forecastSnapshots)
      .where(sql`${forecastSnapshots.captured_at} < NOW() - INTERVAL '30 days'`)
      .returning({ id: forecastSnapshots.id })

    const deletedScores = await db
      .delete(conditionsScores)
      .where(sql`${conditionsScores.forecast_date} < CURRENT_DATE - INTERVAL '30 days'`)
      .returning({ id: conditionsScores.id })

    logger.info(
      { deletedSnapshots: deletedSnapshots.length, deletedScores: deletedScores.length },
      '[snapshot-cleanup] job completed',
    )
  },
  { connection: bullConnection, concurrency: 1 },
)

snapshotCleanupWorker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'snapshot-cleanup job failed')
})
