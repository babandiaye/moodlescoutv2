import Redis from 'ioredis'
import { logger } from './logger'

const globalForRedis = globalThis as unknown as { redis: Redis | null | undefined }

/**
 * Client Redis singleton, lazy-init.
 * Retourne null si REDIS_URL n'est pas configuré (dégradation gracieuse).
 */
function createRedisClient(): Redis | null {
  if (!process.env.REDIS_URL) {
    logger.warn('REDIS_URL non configurée — fonctionnalités basées sur Redis désactivées')
    return null
  }

  const client = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: null, // requis par BullMQ
    lazyConnect: false,
    enableOfflineQueue: false,
  })

  client.on('error', (err) => {
    logger.error({ err: err.message }, 'Redis : erreur de connexion')
  })

  return client
}

export const redis: Redis | null =
  globalForRedis.redis ?? (globalForRedis.redis = createRedisClient())
