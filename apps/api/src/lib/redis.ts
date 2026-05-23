import { Redis } from 'ioredis'
import { logger } from './logger.js'

export const redis = new Redis(process.env.REDIS_URL!, {
  enableReadyCheck: false,
  lazyConnect: true,
})

redis.on('error', (err: Error) => {
  logger.error({ err: err.message }, 'redis connection error')
})
