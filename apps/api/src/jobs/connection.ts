import type { ConnectionOptions } from 'bullmq'

const redisUrl = process.env.REDIS_URL

if (!redisUrl) {
  throw new Error('REDIS_URL environment variable is required')
}

const parsedRedisUrl = new URL(redisUrl)

export const bullConnection: ConnectionOptions = {
  host: parsedRedisUrl.hostname,
  port: Number(parsedRedisUrl.port),
  username: parsedRedisUrl.username || undefined,
  password: parsedRedisUrl.password || undefined,
  db: parsedRedisUrl.pathname ? Number(parsedRedisUrl.pathname.slice(1) || '0') : 0,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
}
