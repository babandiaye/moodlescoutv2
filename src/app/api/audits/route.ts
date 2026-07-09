import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { requireAuth, rateLimit } from '@/lib/api-helpers'
import { getAuditQueue } from '@/lib/queue'
import { logger } from '@/lib/logger'
import {
  activeAuditPlatformFilter,
  canLaunchAudit,
  canViewAllAudits,
  isAdmin,
} from '@/lib/permissions'
import { getMoodleUserIdByEmail, getUserEnrolledCourses } from '@/lib/moodle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const createSchema = z.object({
  platformId: z.string().uuid(),
  llmConfigId: z.string().uuid(),
  extractImages: z.boolean().default(true),
  quizDetail: z.enum(['meta', 'detail', 'both']).default('both'),
  categories: z.array(z.string()).default([]),
  // Sous-ensemble d'IDs Moodle. Optionnel : si présent, l'audit ne traite
  // que ces cours (feature "Auditer mes cours" depuis /me/courses).
  courseIds: z.array(z.number().int().positive()).optional(),
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
  const where = {
    ...(canViewAllAudits(a.user.role) ? {} : { userId: a.user.id }),
    ...activeAuditPlatformFilter(a.user.role),
  }

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

  // Blocage rôle `lecteur` : ne peut PAS lancer d'audit (lecture seule globale).
  if (!canLaunchAudit(a.user.role)) {
    return NextResponse.json(
      { error: "Votre rôle ne permet pas de lancer un audit." },
      { status: 403 },
    )
  }

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

  const { platformId, llmConfigId, extractImages, quizDetail, categories, courseIds } = parsed.data

  const [platform, llm] = await Promise.all([
    prisma.moodlePlatform.findUnique({ where: { id: platformId } }),
    prisma.llmConfig.findUnique({ where: { id: llmConfigId } }),
  ])
  if (!platform) return NextResponse.json({ error: 'Plateforme inconnue' }, { status: 404 })
  if (!llm) return NextResponse.json({ error: 'Config LLM inconnue' }, { status: 404 })
  // Un non-admin ne peut pas cibler une plateforme désactivée (elle est censée
  // ne pas lui être visible dans l'UI, mais on ferme aussi la porte côté API
  // pour empêcher tout POST direct).
  if (!isAdmin(a.user.role) && !platform.isActive) {
    return NextResponse.json({ error: 'Plateforme désactivée par l\'administrateur.' }, { status: 403 })
  }
  // Même règle pour le LLM : un fournisseur IA désactivé n'est plus disponible,
  // quel que soit le rôle (contrairement aux plateformes, où l'admin garde la
  // main — un LLM inactif est vraiment inactif partout).
  if (!llm.isActive) {
    return NextResponse.json({ error: 'Fournisseur IA désactivé.' }, { status: 403 })
  }

  // Restriction rôle "auditeur" : ne peut lancer un audit QUE sur ses propres
  // cours (enseignant / tuteur sur la plateforme). L'admin garde le mode libre.
  //   - courseIds obligatoire
  //   - chaque ID doit correspondre à un cours de l'auditeur sur cette plateforme
  // Vérifié côté serveur pour empêcher le bypass (client qui trafique la
  // requête pour auditer des cours hors périmètre).
  if (!isAdmin(a.user.role)) {
    if (!courseIds || courseIds.length === 0) {
      return NextResponse.json(
        {
          error:
            'En tant qu\'auditeur, vous devez sélectionner des cours dans « Mes cours » avant de lancer un audit.',
        },
        { status: 403 },
      )
    }
    try {
      const email = a.user.email ?? ''
      const token = decrypt(platform.tokenEnc)
      const userid = await getMoodleUserIdByEmail(platform.url, token, email)
      if (!userid) {
        return NextResponse.json(
          {
            error:
              'Votre email ne correspond à aucun compte sur cette plateforme Moodle.',
          },
          { status: 403 },
        )
      }
      const enrolled = await getUserEnrolledCourses(platform.url, token, userid, {
        teacherOnly: true,
      })
      if (enrolled.accessDenied) {
        return NextResponse.json(
          {
            error:
              'La fonction Moodle "core_enrol_get_users_courses" n\'est pas activée. Demandez à la DITSI de l\'ajouter au service Web externe.',
          },
          { status: 503 },
        )
      }
      const myCourseIds = new Set(enrolled.courses.map(c => Number(c.id)))
      const forbidden = courseIds.filter(id => !myCourseIds.has(id))
      if (forbidden.length > 0) {
        return NextResponse.json(
          {
            error: `Vous n'êtes pas enseignant/tuteur de ${forbidden.length} cours demandé(s). Rechargez « Mes cours ».`,
          },
          { status: 403 },
        )
      }
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'Vérification enrôlement audit ciblé : échec')
      return NextResponse.json(
        { error: 'Impossible de vérifier votre enrôlement Moodle : ' + (err as Error).message.slice(0, 120) },
        { status: 503 },
      )
    }
  }

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
      // Null si pas de sous-ensemble → worker audite toute la plateforme (comportement historique).
      courseIdsJson: courseIds && courseIds.length > 0 ? courseIds : undefined,
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
