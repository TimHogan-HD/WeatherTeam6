import { Queue } from 'bullmq'
import { bullConnection } from './connection.js'

const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5000 },
  removeOnComplete: 100,
  removeOnFail: 25,
}

export const forecastSnapshotQueue = new Queue('forecast-snapshot', {
  connection: bullConnection,
  defaultJobOptions,
})

export const rainfallHistoryQueue = new Queue('rainfall-history', {
  connection: bullConnection,
  defaultJobOptions,
})

export const alertsPollerQueue = new Queue('alerts-poller', {
  connection: bullConnection,
  defaultJobOptions: { ...defaultJobOptions, removeOnFail: 10 },
})

export const snapshotCleanupQueue = new Queue('snapshot-cleanup', {
  connection: bullConnection,
  defaultJobOptions,
})
