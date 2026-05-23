import { forecastSnapshotQueue, rainfallHistoryQueue, alertsPollerQueue, snapshotCleanupQueue } from './queues.js'
import { logger } from '../lib/logger.js'

export async function initScheduler(): Promise<void> {
  const allQueues = [forecastSnapshotQueue, rainfallHistoryQueue, alertsPollerQueue, snapshotCleanupQueue]

  for (const queue of allQueues) {
    const repeatableJobs = await queue.getRepeatableJobs()
    for (const job of repeatableJobs) {
      await queue.removeRepeatableByKey(job.key)
    }
  }

  await forecastSnapshotQueue.add('run', {}, { repeat: { every: 6 * 60 * 60 * 1000 } })
  await rainfallHistoryQueue.add('run', {}, { repeat: { pattern: '0 6 * * *', tz: 'UTC' } })
  await alertsPollerQueue.add('run', {}, { repeat: { every: 5 * 60 * 1000 } })
  await snapshotCleanupQueue.add('run', {}, { repeat: { pattern: '0 2 * * *', tz: 'UTC' } })

  logger.info('job scheduler initialized')
}
