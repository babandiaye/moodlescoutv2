import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAuth, rateLimit } from '@/lib/api-helpers'
import { checkAuditAccess } from '@/lib/audit-access'
import { getAuditQueue } from '@/lib/queue'
import { canLaunchAudit, isAdmin } from '@/lib/permissions'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function buildSessionKey(prefix: string): string {
  const ts = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}-${ts}-${rand}`
}

/**
 * POST /api/audits/[id]/relaunch
 *
 * Crée une NOUVELLE session d'audit avec les mêmes paramètres que la session
 * source (plateforme, LLM, catégories, cours ciblés, options). N'écrit rien
 * dans l'audit source — c'est une session complètement indépendante avec sa
 * propre session_key.
 *
 * Contraintes :
 *   - Seul l'admin ou le propriétaire peut relancer (canLaunchAudit)
 *   - Le rôle 'lecteur' ne peut PAS relancer (pas d'écriture)
 *   - L'audit source doit être terminé (completed/failed/cancelled) — pas de
 *     relance d'un audit encore running
 *   - La plateforme ET le LLM doivent toujours être actifs (sauf pour l'admin
 *     côté plateforme, comme partout ailleurs dans le code)
 *   - Rate limits identiques à POST /api/audits (partagés user + global)
 */
export async function POST(_req: NextRequest, ctx: Ctx) {
  const a = await requireAuth()
  if (!a.ok) return a.response
  const { id } = await ctx.params

  if (!canLaunchAudit(a.user.role)) {
    return NextResponse.json({ error: 'Votre rôle ne permet pas de relancer un audit.' }, { status: 403 })
  }

  // 1) Accès + existence + plateforme active (helper commun)
  const access = await checkAuditAccess(id, a.user, true)
  if (!access.ok) return access.response

  // 2) L'audit source doit être terminé
  if (!['completed', 'failed', 'cancelled'].includes(access.audit.status)) {
    return NextResponse.json(
      { error: 'Relance impossible : cet audit est encore en cours.' },
      { status: 409 },
    )
  }

  // 3) Rate limits (identiques à POST /api/audits)
  const userLimited = await rateLimit(`audit-start:${a.user.id}`, 5, 300, {
    kind: 'user',
    label: 'votre quota personnel',
  })
  if (userLimited) return userLimited
  const globalLimited = await rateLimit('audit-start:global', 20, 300, {
    kind: 'global',
    label: 'le quota global de la plateforme',
  })
  if (globalLimited) return globalLimited

  // 4) Récupère les paramètres complets de l'audit source
  const src = await prisma.auditSession.findUnique({
    where: { id },
    select: {
      platformId: true,
      llmConfigId: true,
      extractImages: true,
      quizDetail: true,
      categoriesJson: true,
      courseIdsJson: true,
      sessionKey: true,
      platform: { select: { isActive: true, name: true } },
      llmConfig: { select: { isActive: true } },
    },
  })
  if (!src) return NextResponse.json({ error: 'Audit source introuvable' }, { status: 404 })

  if (!src.platform.isActive && !isAdmin(a.user.role)) {
    return NextResponse.json({ error: 'Plateforme désactivée par l\'administrateur.' }, { status: 403 })
  }
  if (!src.llmConfig.isActive) {
    return NextResponse.json(
      { error: 'Le fournisseur IA utilisé par cet audit est désactivé. Éditez la config LLM ou lancez un audit neuf avec un autre fournisseur.' },
      { status: 403 },
    )
  }

  // 5) Crée la nouvelle session — préfixe "relaunch-" pour repérer visuellement
  const prefix = src.sessionKey.startsWith('audit-course-') ? 'relaunch-course' : 'relaunch'
  const created = await prisma.auditSession.create({
    data: {
      sessionKey: buildSessionKey(prefix),
      status: 'pending',
      userId: a.user.id,
      platformId: src.platformId,
      llmConfigId: src.llmConfigId,
      extractImages: src.extractImages,
      quizDetail: src.quizDetail,
      categoriesJson: src.categoriesJson ?? [],
      courseIdsJson: src.courseIdsJson ?? undefined,
    },
    select: { id: true, sessionKey: true, status: true, createdAt: true },
  })

  // 6) Met en file BullMQ (même flow que POST /api/audits)
  try {
    const queue = getAuditQueue()
    const job = await queue.add(
      'audit',
      { sessionId: created.id },
      {
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
        attempts: 2,
        backoff: { type: 'exponential', delay: 30000 },
      },
    )
    await prisma.analysisJob.create({
      data: { sessionId: created.id, bullJobId: String(job.id), status: 'queued' },
    })
    logger.info(
      { sourceId: id, newId: created.id, jobId: job.id, userId: a.user.id },
      'Audit relancé',
    )
  } catch (err) {
    await prisma.auditSession.update({
      where: { id: created.id },
      data: { status: 'failed' },
    })
    return NextResponse.json(
      { error: `File d'attente indisponible : ${(err as Error).message}` },
      { status: 503 },
    )
  }

  return NextResponse.json({ session: created }, { status: 201 })
}
