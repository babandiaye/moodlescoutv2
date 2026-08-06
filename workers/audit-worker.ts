import 'dotenv/config'
import { config as dotenvConfig } from 'dotenv'
import path from 'node:path'
dotenvConfig({ path: path.resolve(process.cwd(), '.env.local'), override: false })

import { Queue, Worker, Job } from 'bullmq'
import IORedis from 'ioredis'
import { prisma } from '../src/lib/prisma'
import { decrypt } from '../src/lib/crypto'
import { logger } from '../src/lib/logger'
import { auditCourse, listCoursesForAudit } from '../src/lib/audit'
import { QUEUE_AUDIT, SSE_CHANNEL, type AuditJobData, type SseEvent } from '../src/lib/queue'
import { pLimit } from '../src/lib/concurrency'

const REDIS_URL = process.env.REDIS_URL
const CONCURRENCY = Math.max(1, Number(process.env.BULLMQ_CONCURRENCY ?? 3))
// Concurrence INTRA-job : nb de cours traités en parallèle dans un même audit.
// Le LLM est gated séparément par le sémaphore Redis (LLM_MAX_CONCURRENT) ;
// ce paramètre régule surtout la pression sur la plateforme Moodle cible.
const INTRA_JOB_CONCURRENCY = Math.max(1, Number(process.env.AUDIT_INTRA_JOB_CONCURRENCY ?? 5))

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

  // Sous-ensemble d'IDs Moodle à auditer (feature "Auditer mes cours"). Si
  // vide/null → toute la plateforme (comportement historique).
  const courseIdsFilter = Array.isArray(session.courseIdsJson)
    ? (session.courseIdsJson as number[]).filter(n => typeof n === 'number' && n > 0)
    : []

  // Deux chemins :
  //  - Audit ciblé (courseIdsFilter présent) : on demande directement les cours
  //    par IDs — évite de scanner toute la plateforme (gain énorme sur une
  //    plateforme à 50 000 cours pour un audit de 2-3 cours).
  //  - Audit plateforme complète : listing habituel + filtre catégoriel.
  const { courses: allCourses, tree } = await listCoursesForAudit({
    baseUrl,
    token,
    categoryFilter: categories,
    courseIds: courseIdsFilter.length > 0 ? courseIdsFilter : undefined,
  })
  const courses = allCourses

  logger.info(
    {
      sessionId,
      total: courses.length,
      courseFilter: courseIdsFilter.length > 0,
      targetedFetch: courseIdsFilter.length > 0,
    },
    'Worker: cours retenus',
  )

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

  // Drapeau partagé entre tous les cours en parallèle. Quand l'annulation est
  // détectée par UN cours, les autres courent leur check au début de leur tour
  // et sortent rapidement.
  let cancelled = false
  const limit = pLimit(INTRA_JOB_CONCURRENCY)

  logger.info(
    { sessionId, total: courses.length, intraConcurrency: INTRA_JOB_CONCURRENCY },
    'Worker: démarrage parallèle des cours',
  )

  const tasks = courses.map(course =>
    limit(async () => {
      if (cancelled) return // Court-circuit : un autre cours a déjà détecté l'annulation

      // Check status + compteurs courants en 1 seule query (annulation propagée
      // par /api/audits/[id]/cancel + valeurs réelles à publier dans `progress`).
      const current = await prisma.auditSession.findUnique({
        where: { id: sessionId },
        select: {
          status: true,
          doneCourses: true,
          failedCourses: true,
          totalCourses: true,
        },
      })
      // Session supprimée (via DELETE API ou cleanup) alors qu'on traitait ses
      // cours : NE PAS tenter d'upsert derrière (FK violation en cascade sur
      // course_audits.session_id). On sort proprement du job — les autres
      // cours en parallèle sortiront aussi à leur prochain check.
      if (!current) {
        cancelled = true
        logger.warn({ sessionId, courseId: course.id }, 'Session supprimée en cours d\'audit — skip')
        return
      }
      if (current.status === 'cancelled') {
        cancelled = true
        return
      }

      const courseStart = Date.now()
      await publish(sessionId, {
        type: 'progress',
        done: current?.doneCourses ?? 0,
        failed: current?.failedCourses ?? 0,
        total: current?.totalCourses ?? courses.length,
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
          { extractImages: session.extractImages, quizDetail: session.quizDetail },
          tree,
        )

        const score = Number(result.score_global ?? 0)
        const duration = Date.now() - courseStart

        // Le LLM peut tomber en FALLBACK silencieusement (parseAiResponse() ne
        // throw pas si réponse vide/malformée, callAi() ne throw pas non plus si
        // exception ⇒ description_courte = "Erreur IA: ...").
        // Dans ce cas le score=0 sans flag d'erreur perd l'enseignant (il croit
        // à un cours vide). On force errorMessage pour qu'il apparaisse dans la
        // section "Échecs" et le badge "partiel".
        const aiDesc = (result as { ai?: { description_courte?: string } }).ai?.description_courte
        const isLlmFallback =
          aiDesc === 'Analyse indisponible' ||
          (typeof aiDesc === 'string' && aiDesc.startsWith('Erreur IA:'))
        const llmErrorMessage = isLlmFallback
          ? aiDesc === 'Analyse indisponible'
            ? 'LLM indisponible (réponse vide ou malformée)'
            : `LLM indisponible : ${aiDesc.replace(/^Erreur IA:\s*/, '')}`
          : null

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
            errorMessage: llmErrorMessage,
          },
          update: {
            shortname: course.shortname ?? '',
            fullname: course.fullname ?? '',
            resultJson: result,
            scoreGlobal: score,
            durationMs: duration,
            errorMessage: llmErrorMessage,
          },
        })

        // Increment ATOMIQUE côté Postgres : pas de race entre tâches parallèles.
        // On lit la valeur après increment pour publier l'event SSE avec la valeur réelle.
        // Un fallback LLM compte comme un échec (le score n'est pas fiable), pas
        // un succès — sinon la barre de progression "X/Y cours OK" ment.
        const updated = await prisma.auditSession.update({
          where: { id: sessionId },
          data: isLlmFallback
            ? { failedCourses: { increment: 1 } }
            : { doneCourses: { increment: 1 } },
          select: { doneCourses: true, failedCourses: true, totalCourses: true },
        })
        await publish(sessionId, {
          type: 'course',
          courseId: course.id,
          shortname: course.shortname ?? '',
          score,
        })
        await publish(sessionId, {
          type: 'progress',
          done: updated.doneCourses,
          failed: updated.failedCourses,
          total: updated.totalCourses,
        })
      } catch (err) {
        const message = (err as Error).message
        logger.warn(
          { sessionId, courseId: course.id, err: message },
          'Audit cours en échec',
        )
        // Re-check session existence : si la session a été supprimée pendant
        // qu'on traitait le cours (rare mais possible), inutile de tenter un
        // upsert — la FK échouerait et polluerait les logs à l'infini.
        const stillExists = await prisma.auditSession.findUnique({
          where: { id: sessionId },
          select: { id: true },
        })
        if (!stillExists) {
          cancelled = true
          logger.warn({ sessionId, courseId: course.id }, 'Session supprimée pendant l\'audit — skip upsert')
          return
        }
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
        const updated = await prisma.auditSession.update({
          where: { id: sessionId },
          data: { failedCourses: { increment: 1 } },
          select: { doneCourses: true, failedCourses: true, totalCourses: true },
        })
        await publish(sessionId, {
          type: 'progress',
          done: updated.doneCourses,
          failed: updated.failedCourses,
          total: updated.totalCourses,
        })
      }
    }),
  )

  await Promise.all(tasks)

  // Lecture finale des compteurs en BD (source de vérité)
  const finalCounters = await prisma.auditSession.findUnique({
    where: { id: sessionId },
    select: { doneCourses: true, failedCourses: true },
  })
  const done = finalCounters?.doneCourses ?? 0
  const failed = finalCounters?.failedCourses ?? 0

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

/**
 * Nettoie les sessions orphelines au boot du worker.
 *
 * Cas d'usage : si le worker a été tué brutalement (OOM, deploy, panic) en plein
 * audit, la session reste en `running` ou `pending` en BD pour l'éternité car
 * BullMQ marque le job échoué mais l'event `failed` n'a pas eu le temps de
 * mettre à jour la BD.
 *
 * Stratégie : prendre toutes les sessions en `running`/`pending` et exclure
 * celles qui ont un job vivant en BullMQ (active, waiting, delayed). Le reste
 * est marqué `failed` avec `finishedAt = now()`.
 */
async function cleanupZombieSessions(): Promise<void> {
  const orphaned = await prisma.auditSession.findMany({
    where: { status: { in: ['running', 'pending'] } },
    select: { id: true, sessionKey: true, status: true, startedAt: true },
  })
  if (orphaned.length === 0) return

  let activeSessionIds = new Set<string>()
  const inspectQueue = new Queue(QUEUE_AUDIT, {
    connection: { url: REDIS_URL!, maxRetriesPerRequest: null } as any,
  })
  try {
    const jobs = await inspectQueue.getJobs(['active', 'waiting', 'delayed', 'paused'])
    activeSessionIds = new Set(
      jobs.map(j => j.data?.sessionId).filter((s): s is string => typeof s === 'string'),
    )
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      'Cleanup zombies : impossible de lister les jobs BullMQ, skip',
    )
    await inspectQueue.close()
    return
  }
  await inspectQueue.close()

  const zombies = orphaned.filter(s => !activeSessionIds.has(s.id))
  if (zombies.length === 0) {
    logger.info(
      { running: orphaned.length, active: activeSessionIds.size },
      'Cleanup zombies : aucune session orpheline (toutes ont un job actif)',
    )
    return
  }

  await prisma.auditSession.updateMany({
    where: { id: { in: zombies.map(z => z.id) } },
    data: { status: 'failed', finishedAt: new Date() },
  })

  logger.warn(
    {
      zombieCount: zombies.length,
      sessionKeys: zombies.map(z => z.sessionKey),
    },
    'Cleanup zombies : sessions orphelines marquées failed',
  )
}

async function bootstrap() {
  // 1) Nettoyer les sessions zombies AVANT que le worker commence à tirer des jobs.
  await cleanupZombieSessions().catch(err => {
    logger.error(
      { err: (err as Error).message },
      'Cleanup zombies : erreur fatale, skip',
    )
  })

  // 2) Démarrer le worker BullMQ.
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
}

bootstrap().catch(err => {
  logger.error({ err: (err as Error).message }, 'Bootstrap worker : erreur fatale')
  process.exit(1)
})
