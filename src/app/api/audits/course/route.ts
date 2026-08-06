import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { requireAuth, rateLimit } from '@/lib/api-helpers'
import { getAuditQueue } from '@/lib/queue'
import { logger } from '@/lib/logger'
import { canLaunchAudit, isAdmin } from '@/lib/permissions'
import { getMoodleUserIdByEmail, getUserEnrolledCourses } from '@/lib/moodle'
import { resolveCourseInput } from '@/lib/audit-input-resolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  /** URL complète du cours, shortname, ou ID numérique. */
  input: z.string().min(1),
  llmConfigId: z.string().uuid(),
  /**
   * Optionnel : plateforme cible pour désambiguïser si le shortname existe
   * sur plusieurs plateformes. Sinon on prend le 1er match.
   */
  platformId: z.string().uuid().optional(),
  extractImages: z.boolean().default(true),
  quizDetail: z.enum(['meta', 'detail', 'both']).default('both'),
})

function buildSessionKey(): string {
  const ts = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)
  const rand = Math.random().toString(36).slice(2, 8)
  return `audit-course-${ts}-${rand}`
}

/**
 * POST /api/audits/course
 *
 * Lance un audit sur UN cours identifié par URL, shortname, ou ID.
 * Utile pour l'analyse ciblée d'un cours dont l'auteur veut extraire
 * spécifiquement les infos (dont le nom de l'enseignant depuis l'image
 * de couverture, si le vrai enseignant n'est pas enrôlé sur la plateforme).
 *
 * Réponses possibles :
 *   201 { session } — audit créé et mis en file
 *   400 { ambiguous, matches } — plusieurs matches, l'UI doit demander de choisir
 *   400 / 403 / 404 — erreur de résolution ou permission
 */
export async function POST(req: NextRequest) {
  try {
    return await postImpl(req)
  } catch (err) {
    // Idem GET : évite qu'une exception fasse cracher la route en HTML.
    const message = (err as Error).message ?? 'Erreur inconnue'
    logger.error({ err: message, stack: (err as Error).stack?.slice(0, 500) }, 'POST /audits/course: exception non gérée')
    return NextResponse.json(
      { error: 'Erreur serveur : ' + message.slice(0, 200) },
      { status: 500 },
    )
  }
}

async function postImpl(req: NextRequest) {
  const a = await requireAuth()
  if (!a.ok) return a.response

  if (!canLaunchAudit(a.user.role)) {
    return NextResponse.json({ error: 'Votre rôle ne permet pas de lancer un audit.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Paramètres invalides', details: parsed.error.issues },
      { status: 400 },
    )
  }

  const { input, llmConfigId, platformId, extractImages, quizDetail } = parsed.data

  // Rate limits — mêmes que /api/audits (partage la protection infra).
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

  // 1) Résolution input → matches. Même l'admin ne peut cibler qu'une
  //    plateforme active depuis cette vue ; il doit d'abord la réactiver
  //    dans /configuration.
  const resolved = await resolveCourseInput(input)
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: 404 })
  }

  // 2) Sélection du match : soit forcé par platformId, soit 1er match, soit ambigu.
  let match = resolved.matches[0]
  if (platformId) {
    const forced = resolved.matches.find(m => m.platformId === platformId)
    if (!forced) {
      return NextResponse.json(
        { error: 'Le cours n\'existe pas sur la plateforme sélectionnée.' },
        { status: 404 },
      )
    }
    match = forced
  } else if (resolved.matches.length > 1) {
    // Ambiguïté : le shortname existe sur plusieurs plateformes. On demande
    // à l'UI de proposer un choix. Pas de création d'audit à ce stade.
    return NextResponse.json(
      {
        ambiguous: true,
        matches: resolved.matches,
        message: `Ce ${resolved.kind === 'id' ? 'ID' : 'code'} existe sur ${resolved.matches.length} plateformes. Sélectionnez-en une.`,
      },
      { status: 400 },
    )
  }

  // 3) Vérification LLM config existe + est activée
  const llm = await prisma.llmConfig.findUnique({ where: { id: llmConfigId } })
  if (!llm) return NextResponse.json({ error: 'Config LLM inconnue' }, { status: 404 })
  if (!llm.isActive) return NextResponse.json({ error: 'Fournisseur IA désactivé.' }, { status: 403 })

  // 4) Restriction rôle "enseignant" : ne peut auditer que ses propres cours
  //    (même règle que POST /api/audits — pas de bypass via cette nouvelle route).
  if (!isAdmin(a.user.role)) {
    try {
      const platform = await prisma.moodlePlatform.findUnique({
        where: { id: match.platformId },
        select: { url: true, tokenEnc: true, isActive: true },
      })
      if (!platform) return NextResponse.json({ error: 'Plateforme introuvable' }, { status: 404 })
      if (!platform.isActive) {
        return NextResponse.json(
          { error: 'Plateforme désactivée par l\'administrateur.' },
          { status: 403 },
        )
      }
      const email = a.user.email ?? ''
      const token = decrypt(platform.tokenEnc)
      const userid = await getMoodleUserIdByEmail(platform.url, token, email)
      if (!userid) {
        return NextResponse.json(
          { error: 'Votre email ne correspond à aucun compte sur cette plateforme Moodle.' },
          { status: 403 },
        )
      }
      const enrolled = await getUserEnrolledCourses(platform.url, token, userid, { teacherOnly: true })
      if (enrolled.accessDenied) {
        return NextResponse.json(
          {
            error:
              'La fonction Moodle "core_enrol_get_users_courses" n\'est pas activée sur cette plateforme. Demandez à la DITSI de l\'ajouter au service Web externe.',
          },
          { status: 503 },
        )
      }
      const isMine = enrolled.courses.some(c => Number(c.id) === match.courseId)
      if (!isMine) {
        return NextResponse.json(
          { error: 'Vous n\'êtes pas enseignant/tuteur de ce cours.' },
          { status: 403 },
        )
      }
    } catch (err) {
      return NextResponse.json(
        { error: 'Impossible de vérifier votre enrôlement : ' + (err as Error).message.slice(0, 120) },
        { status: 503 },
      )
    }
  }

  // 5) Création session + mise en file, même flow que POST /api/audits
  const session = await prisma.auditSession.create({
    data: {
      sessionKey: buildSessionKey(),
      status: 'pending',
      userId: a.user.id,
      platformId: match.platformId,
      llmConfigId,
      extractImages,
      quizDetail,
      categoriesJson: [],
      courseIdsJson: [match.courseId],
    },
    select: { id: true, sessionKey: true, status: true, createdAt: true },
  })

  try {
    const queue = getAuditQueue()
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
      { sessionId: session.id, jobId: job.id, userId: a.user.id, courseId: match.courseId, source: resolved.kind },
      'Audit ciblé sur 1 cours créé',
    )
  } catch (err) {
    await prisma.auditSession.update({
      where: { id: session.id },
      data: { status: 'failed' },
    })
    return NextResponse.json(
      { error: `File d'attente indisponible : ${(err as Error).message}` },
      { status: 503 },
    )
  }

  return NextResponse.json(
    {
      session,
      resolved: {
        courseId: match.courseId,
        shortname: match.shortname,
        fullname: match.fullname,
        platformName: match.platformName,
      },
    },
    { status: 201 },
  )
}

/**
 * GET /api/audits/course/resolve?input=X
 *
 * Aperçu SEUL — pour l'UI qui veut afficher "le cours trouvé est …" avant
 * que l'utilisateur clique sur "Lancer". Ne crée aucune session.
 */
export async function GET(req: NextRequest) {
  try {
    const a = await requireAuth()
    if (!a.ok) return a.response

    const url = new URL(req.url)
    const input = url.searchParams.get('input') ?? ''
    if (!input) {
      return NextResponse.json({ error: 'Paramètre "input" manquant' }, { status: 400 })
    }
    const resolved = await resolveCourseInput(input)
    return NextResponse.json(resolved)
  } catch (err) {
    // Filet de sécurité : sans try/catch ici, une exception non prévue (ex:
    // decrypt() qui throw sur un token corrompu, WS Moodle qui timeout,
    // panne Prisma) fait rendre à Next.js sa page d'erreur HTML par défaut
    // — le client échoue alors avec "Unexpected token '<'".
    const message = (err as Error).message ?? 'Erreur inconnue'
    logger.error({ err: message, stack: (err as Error).stack?.slice(0, 500) }, 'Resolve course: exception non gérée')
    return NextResponse.json(
      { ok: false, error: 'Erreur serveur : ' + message.slice(0, 200) },
      { status: 500 },
    )
  }
}
