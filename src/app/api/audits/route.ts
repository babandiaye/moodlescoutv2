import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAuth, rateLimit } from '@/lib/api-helpers'
import { getAuditQueue } from '@/lib/queue'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const createSchema = z.object({
  platformId: z.string().uuid(),
  llmConfigId: z.string().uuid(),
  extractImages: z.boolean().default(true),
  quizDetail: z.enum(['meta', 'detail', 'both']).default('both'),
  categories: z.array(z.string()).default([]),
})

function buildSessionKey(): string {
  const ts = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)
  const rand = Math.random().toString(36).slice(2, 8)
  return `audit-${ts}-${rand}`
}

export async function GET(req: NextRequest) {
  const a = await requireAuth()
  if (!a.ok) return a.response

  const url = new URL(req.url)
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 100)
  const where = a.user.role === 'admin' ? {} : { userId: a.user.id }

  const sessions = await prisma.auditSession.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      sessionKey: true,
      status: true,
      totalCourses: true,
      doneCourses: true,
      failedCourses: true,
      startedAt: true,
      finishedAt: true,
      createdAt: true,
      user: { select: { id: true, fullName: true } },
      platform: { select: { id: true, name: true, url: true } },
      llmConfig: { select: { id: true, name: true, provider: true, model: true } },
    },
  })
  return NextResponse.json({ sessions })
}

export async function POST(req: NextRequest) {
  const a = await requireAuth()
  if (!a.ok) return a.response

  // Rate limit per-user : protège contre l'abus individuel
  const userLimited = await rateLimit(`audit-start:${a.user.id}`, 5, 300, {
    kind: 'user',
    label: 'votre quota personnel',
  })
  if (userLimited) return userLimited

  // Rate limit global : protège l'infra (Moodle, Ollama, BullMQ) contre la
  // saturation simultanée par plusieurs utilisateurs légitimes.
  const globalLimited = await rateLimit('audit-start:global', 20, 300, {
    kind: 'global',
    label: 'le quota global de la plateforme',
  })
  if (globalLimited) return globalLimited

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const { platformId, llmConfigId, extractImages, quizDetail, categories } = parsed.data

  const [platform, llm] = await Promise.all([
    prisma.moodlePlatform.findUnique({ where: { id: platformId } }),
    prisma.llmConfig.findUnique({ where: { id: llmConfigId } }),
  ])
  if (!platform) return NextResponse.json({ error: 'Plateforme inconnue' }, { status: 404 })
  if (!llm) return NextResponse.json({ error: 'Config LLM inconnue' }, { status: 404 })

  const session = await prisma.auditSession.create({
    data: {
      sessionKey: buildSessionKey(),
      status: 'pending',
      userId: a.user.id,
      platformId,
      llmConfigId,
      extractImages,
      quizDetail,
      categoriesJson: categories,
    },
    select: { id: true, sessionKey: true, status: true, createdAt: true },
  })

  try {
    const queue = getAuditQueue()
    // attempts: 2 + backoff = filet de sécurité contre les pannes infra TRANSITOIRES
    // (Postgres hiccup au tout début de processAudit, déconnexion Redis, etc.).
    // Le retry pop la même session ; grâce à l'upsert idempotent dans CourseAudit
    // (clé unique sessionId+courseId), les cours déjà traités ne sont pas doublonnés
    // — le worker reprend là où il s'est arrêté.
    const job = await queue.add(
      'audit',
      { sessionId: session.id },
      {
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
        attempts: 2,
        backoff: { type: 'exponential', delay: 30000 },
      },
    )
    await prisma.analysisJob.create({
      data: { sessionId: session.id, bullJobId: String(job.id), status: 'queued' },
    })
    logger.info(
      { sessionId: session.id, jobId: job.id, userId: a.user.id },
      'Audit créé et mis en file',
    )
  } catch (err) {
    await prisma.auditSession.update({
      where: { id: session.id },
      data: { status: 'failed' },
    })
    logger.error({ err: (err as Error).message }, 'Mise en file échouée')
    return NextResponse.json(
      { error: `File d'attente indisponible : ${(err as Error).message}` },
      { status: 503 },
    )
  }

  return NextResponse.json({ session }, { status: 201 })
}
