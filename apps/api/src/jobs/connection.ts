import { Redis } from 'ioredis'
import { logger } from '../lib/logger.js'

export const bullConnection = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
})

bullConnection.on('error', (err: Error) => {
  logger.error({ err: err.message }, 'bullmq redis connection error')
})
