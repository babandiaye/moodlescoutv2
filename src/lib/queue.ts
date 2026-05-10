import { Queue, QueueEvents } from 'bullmq'
import IORedis from 'ioredis'

const REDIS_URL = process.env.REDIS_URL ?? ''
const QUEUE_NAME = process.env.BULLMQ_QUEUE_NAME ?? 'audit-jobs'

export const QUEUE_AUDIT = QUEUE_NAME

export function buildRedisConnection(): IORedis | null {
  if (!REDIS_URL) return null
  return new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  })
}

let _queue: Queue | null = null
let _events: QueueEvents | null = null

export function getAuditQueue(): Queue {
  if (_queue) return _queue
  if (!REDIS_URL) throw new Error('REDIS_URL non configurée — file BullMQ indisponible')
  _queue = new Queue(QUEUE_NAME, {
    connection: { url: REDIS_URL, maxRetriesPerRequest: null } as any,
  })
  return _queue
}

export function getAuditQueueEvents(): QueueEvents {
  if (_events) return _events
  if (!REDIS_URL) throw new Error('REDIS_URL non configurée')
  _events = new QueueEvents(QUEUE_NAME, {
    connection: { url: REDIS_URL, maxRetriesPerRequest: null } as any,
  })
  return _events
}

export type AuditJobData = {
  sessionId: string
}

export const SSE_CHANNEL = (sessionId: string) => `audit:sse:${sessionId}`

export type SseEvent =
  | { type: 'progress'; done: number; failed: number; total: number; current?: string }
  | { type: 'course'; courseId: number; shortname: string; score: number }
  | { type: 'status'; status: 'running' | 'completed' | 'failed' | 'cancelled' }
  | { type: 'error'; message: string }
