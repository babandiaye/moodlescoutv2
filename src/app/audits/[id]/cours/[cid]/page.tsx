import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import {
  ArrowLeftIcon,
  ArrowLongLeftIcon,
  ArrowLongRightIcon,
  ClockIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canViewAudit, isAdmin } from '@/lib/permissions'
import { CourseDetailView } from '@/components/course-detail-view'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

type Ctx = { params: Promise<{ id: string; cid: string }> }

/**
 * Vue détaillée d'un cours au sein d'un audit précis.
 * Chargée depuis /audits/[id] via un lien "Voir détail" sur chaque cours,
 * ou depuis le raccourci "Voir le cours" dans /plateformes/[id]/cours/[cid].
 */
export default async function CourseDetailPage({ params }: Ctx) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const { id, cid } = await params
  const courseId = parseInt(cid, 10)
  if (!Number.isFinite(courseId) || courseId <= 0) notFound()

  // Charge l'audit + tous ses cours (pour la nav prev/next), sans les
  // gros resultJson des autres cours.
  const audit = await prisma.auditSession.findUnique({
    where: { id },
    select: {
      id: true,
      sessionKey: true,
      status: true,
      userId: true,
      platform: { select: { id: true, name: true, url: true, version: true, isActive: true } },
      llmConfig: { select: { name: true, provider: true, model: true } },
      courseAudits: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          courseId: true,
          shortname: true,
          fullname: true,
          scoreGlobal: true,
          errorMessage: true,
        },
      },
    },
  })
  if (!audit) notFound()
  // Contrôle d'accès (même règles que la page audit parente).
  if (!canViewAudit(session.user.role, session.user.id, audit.userId)) {
    redirect('/audits')
  }
  if (!audit.platform.isActive && !isAdmin(session.user.role)) {
    redirect('/audits')
  }

  const current = await prisma.courseAudit.findUnique({
    where: { sessionId_courseId: { sessionId: id, courseId } },
    select: {
      id: true,
      courseId: true,
      shortname: true,
      fullname: true,
      scoreGlobal: true,
      errorMessage: true,
      durationMs: true,
      resultJson: true,
      createdAt: true,
    },
  })
  if (!current) notFound()

  // Prev / next : navigation entre cours du même audit
  const idx = audit.courseAudits.findIndex(c => c.courseId === courseId)
  const prev = idx > 0 ? audit.courseAudits[idx - 1] : null
  const next = idx >= 0 && idx < audit.courseAudits.length - 1 ? audit.courseAudits[idx + 1] : null

  const result =
    current.resultJson && typeof current.resultJson === 'object'
      ? (current.resultJson as Record<string, unknown>)
      : null

  return (
    <div className="flex-col-16">
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <ClipboardDocumentListIcon className="card-icon" />
            <span>
              {current.shortname || current.fullname || `Cours ${courseId}`}
            </span>
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="badge badge-info" title={audit.sessionKey}>
              Audit {audit.sessionKey.slice(0, 24)}
            </span>
            <span className="badge badge-neutral">
              {audit.llmConfig.provider}/{audit.llmConfig.model}
            </span>
            <Link
              href={`/plateformes/${audit.platform.id}/cours/${courseId}`}
              className="btn btn-secondary"
              style={{ fontSize: 12 }}
              title="Voir l'historique de tous les audits de ce cours"
            >
              <ClockIcon style={{ width: 14, height: 14 }} /> Historique
            </Link>
            <Link href={`/audits/${audit.id}`} className="btn btn-secondary" style={{ fontSize: 12 }}>
              <ArrowLeftIcon style={{ width: 14, height: 14 }} /> Retour à l&apos;audit
            </Link>
          </div>
        </div>
        <div className="card-body" style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 13 }}>
          <div>
            <div className="form-label">Plateforme</div>
            <div>{audit.platform.name}</div>
          </div>
          <div>
            <div className="form-label">Cours</div>
            <div style={{ fontWeight: 500 }}>{current.fullname}</div>
          </div>
          <div>
            <div className="form-label">Analysé le</div>
            <div>{new Date(current.createdAt).toLocaleString('fr-FR')}</div>
          </div>
          {current.durationMs && (
            <div>
              <div className="form-label">Durée d&apos;analyse</div>
              <div>{Math.round(current.durationMs / 1000)}s</div>
            </div>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <a
              href={`${audit.platform.url.replace(/\/+$/, '')}/course/view.php?id=${courseId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{ fontSize: 12 }}
            >
              Ouvrir dans Moodle
            </a>
          </div>
        </div>
      </div>

      {current.errorMessage && !result && (
        <div className="card">
          <div className="card-body" style={{ color: 'var(--danger)' }}>
            <strong>Erreur lors de l&apos;audit :</strong> {current.errorMessage}
          </div>
        </div>
      )}

      {result && <CourseDetailView result={result} errorMessage={current.errorMessage} />}

      <div
        className="card"
        style={{ background: 'transparent', boxShadow: 'none', border: 'none' }}
      >
        <div
          className="card-body"
          style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: 0 }}
        >
          {prev ? (
            <Link
              href={`/audits/${id}/cours/${prev.courseId}`}
              className="btn btn-secondary"
              style={{ fontSize: 12 }}
              title={prev.fullname}
            >
              <ArrowLongLeftIcon style={{ width: 14, height: 14 }} />{' '}
              {prev.shortname || `Cours ${prev.courseId}`}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link
              href={`/audits/${id}/cours/${next.courseId}`}
              className="btn btn-secondary"
              style={{ fontSize: 12 }}
              title={next.fullname}
            >
              {next.shortname || `Cours ${next.courseId}`}{' '}
              <ArrowLongRightIcon style={{ width: 14, height: 14 }} />
            </Link>
          ) : (
            <span />
          )}
        </div>
      </div>
    </div>
  )
}
