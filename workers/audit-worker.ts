import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import path from 'node:path'
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: false })

import { Worker, Job } from 'bullmq'
import IORedis from 'ioredis'
import { prisma } from '../src/lib/prisma'
import { decrypt } from '../src/lib/crypto'
import { logger } from '../src/lib/logger'
import { auditCourse, listCoursesForAudit } from '../src/lib/audit'
import { QUEUE_AUDIT, SSE_CHANNEL, type AuditJobData, type SseEvent } from '../src/lib/queue'

const REDIS_URL = process.env.REDIS_URL
const CONCURRENCY = Math.max(1, Number(process.env.BULLMQ_CONCURRENCY ?? 3))

if (!REDIS_URL) {
  logger.error('REDIS_URL absent — worker ne peut démarrer')
  process.exit(1)
}

const publisher = new IORedis(REDIS_URL, { maxRetriesPerRequest: null })

async function publish(sessionId: string, event: SseEvent) {
  try {
    await publisher.publish(SSE_CHANNEL(sessionId), JSON.stringify(event))
  } catch (err) {
    logger.warn({ err: (err as Error).message, sessionId }, 'Publish SSE failed')
  }
}

async function processAudit(job: Job<AuditJobData>): Promise<void> {
  const { sessionId } = job.data
  const start = Date.now()
  logger.info({ sessionId, jobId: job.id }, 'Worker: démarrage audit')

  const session = await prisma.auditSession.findUnique({
    where: { id: sessionId },
    include: { platform: true, llmConfig: true },
  })
  if (!session) throw new Error(`Session ${sessionId} introuvable`)

  await prisma.auditSession.update({
    where: { id: sessionId },
    data: { status: 'running', startedAt: new Date() },
  })
  await publish(sessionId, { type: 'status', status: 'running' })

  const baseUrl = session.platform.url
  const token = decrypt(session.platform.tokenEnc)
  const apiKey = session.llmConfig.apiKeyEnc ? decrypt(session.llmConfig.apiKeyEnc) : null

  const categories = Array.isArray(session.categoriesJson)
    ? (session.categoriesJson as string[])
    : []

  const { courses, tree } = await listCoursesForAudit({
    baseUrl,
    token,
    categoryFilter: categories,
  })

  await prisma.auditSession.update({
    where: { id: sessionId },
    data: { totalCourses: courses.length },
  })
  await publish(sessionId, {
    type: 'progress',
    done: 0,
    failed: 0,
    total: courses.length,
  })

  let done = 0
  let failed = 0
  let cancelled = false

  for (const course of courses) {
    // Vérifie l'annulation avant chaque cours (poll status en DB).
    const current = await prisma.auditSession.findUnique({
      where: { id: sessionId },
      select: { status: true },
    })
    if (current?.status === 'cancelled') {
      cancelled = true
      logger.info({ sessionId, done, failed, total: courses.length }, 'Worker: audit annulé')
      break
    }

    const courseStart = Date.now()
    await publish(sessionId, {
      type: 'progress',
      done,
      failed,
      total: courses.length,
      current: course.shortname ?? String(course.id),
    })

    try {
      const result = await auditCourse(
        {
          course,
          baseUrl,
          token,
          platformName: session.platform.name,
          platformVersion: session.platform.version,
        },
        {
          provider: session.llmConfig.provider as 'ollama' | 'anthropic',
          apiUrl: session.llmConfig.apiUrl,
          apiKey,
          model: session.llmConfig.model,
        },
        { extractImages: session.extractImages, quizDetail: session.quizDetail as any },
        tree,
      )

      const score = Number(result.score_global ?? 0)
      const duration = Date.now() - courseStart

      await prisma.courseAudit.upsert({
        where: { sessionId_courseId: { sessionId, courseId: course.id } },
        create: {
          sessionId,
          courseId: course.id,
          shortname: course.shortname ?? '',
          fullname: course.fullname ?? '',
          resultJson: result,
          scoreGlobal: score,
          durationMs: duration,
        },
        update: {
          shortname: course.shortname ?? '',
          fullname: course.fullname ?? '',
          resultJson: result,
          scoreGlobal: score,
          durationMs: duration,
          errorMessage: null,
        },
      })

      done += 1
      await prisma.auditSession.update({
        where: { id: sessionId },
        data: { doneCourses: done },
      })
      await publish(sessionId, {
        type: 'course',
        courseId: course.id,
        shortname: course.shortname ?? '',
        score,
      })
    } catch (err) {
      failed += 1
      const message = (err as Error).message
      logger.warn(
        { sessionId, courseId: course.id, err: message },
        'Audit cours en échec',
      )
      await prisma.courseAudit.upsert({
        where: { sessionId_courseId: { sessionId, courseId: course.id } },
        create: {
          sessionId,
          courseId: course.id,
          shortname: course.shortname ?? '',
          fullname: course.fullname ?? '',
          resultJson: { error: message.slice(0, 500) },
          errorMessage: message.slice(0, 500),
          durationMs: Date.now() - courseStart,
        },
        update: {
          errorMessage: message.slice(0, 500),
          durationMs: Date.now() - courseStart,
        },
      })
      await prisma.auditSession.update({
        where: { id: sessionId },
        data: { failedCourses: failed },
      })
    }
    await publish(sessionId, {
      type: 'progress',
      done,
      failed,
      total: courses.length,
    })
  }

  const finalStatus = cancelled
    ? 'cancelled'
    : failed === courses.length && courses.length > 0
      ? 'failed'
      : 'completed'
  await prisma.auditSession.update({
    where: { id: sessionId },
    data: { status: finalStatus, finishedAt: new Date() },
  })
  await publish(sessionId, { type: 'status', status: finalStatus })

  logger.info(
    {
      sessionId,
      done,
      failed,
      total: courses.length,
      durationMs: Date.now() - start,
    },
    'Worker: audit terminé',
  )
}

const worker = new Worker<AuditJobData>(QUEUE_AUDIT, processAudit, {
  connection: { url: REDIS_URL, maxRetriesPerRequest: null } as any,
  concurrency: CONCURRENCY,
})

worker.on('completed', job => {
  logger.info({ jobId: job.id }, 'Job terminé')
})
worker.on('failed', async (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, 'Job en échec')
  if (job?.data?.sessionId) {
    try {
      await prisma.auditSession.update({
        where: { id: job.data.sessionId },
        data: { status: 'failed', finishedAt: new Date() },
      })
      await publish(job.data.sessionId, {
        type: 'error',
        message: err.message.slice(0, 200),
      })
      await publish(job.data.sessionId, { type: 'status', status: 'failed' })
    } catch {
      // ignore
    }
  }
})

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Worker: arrêt en cours')
  await worker.close()
  await publisher.quit()
  await prisma.$disconnect()
  process.exit(0)
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

logger.info({ concurrency: CONCURRENCY, queue: QUEUE_AUDIT }, 'Worker: prêt')
