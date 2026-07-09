import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChartBarIcon, ArrowDownTrayIcon, ArrowLeftIcon } from '@heroicons/react/24/outline'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AuditLiveView } from '@/components/audit-live-view'
import { AuditResultsView } from '@/components/audit-results-view'
import { CancelAuditButton } from '@/components/cancel-audit-button'
import { RelaunchAuditButton } from '@/components/relaunch-audit-button'
import { canViewAudit, canModifyAudit, canLaunchAudit, isAdmin } from '@/lib/permissions'
import { statusBadgeClass, statusLabel } from '@/lib/audit-status'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export default async function AuditDetailPage({ params }: Ctx) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const { id } = await params

  const audit = await prisma.auditSession.findUnique({
    where: { id },
    include: {
      user: { select: { fullName: true } },
      platform: { select: { name: true, url: true, version: true, isActive: true } },
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
          resultJson: true,
          createdAt: true,
        },
      },
    },
  })
  if (!audit) notFound()
  if (!canViewAudit(session.user.role, session.user.id, audit.userId)) {
    redirect('/audits')
  }
  // Un audit sur une plateforme désactivée n'est visible que par l'admin.
  if (!audit.platform.isActive && !isAdmin(session.user.role)) {
    redirect('/audits')
  }
  const canModify = canModifyAudit(session.user.role, session.user.id, audit.userId)

  const isFinal = ['completed', 'failed', 'cancelled'].includes(audit.status)
  const isRunning = audit.status === 'running' || audit.status === 'pending'

  // Liste des résultats parsés (cours sans erreur). Disponibles même pendant l'audit.
  const courses = audit.courseAudits
    .filter(c => !c.errorMessage && c.resultJson && typeof c.resultJson === 'object')
    .map(c => c.resultJson as Record<string, unknown>)

  const errors = audit.courseAudits
    .filter(c => c.errorMessage)
    .map(c => ({
      courseId: c.courseId,
      shortname: c.shortname,
      fullname: c.fullname,
      error: c.errorMessage ?? '',
    }))

  const hasResults = courses.length > 0

  return (
    <div className="flex-col-16">
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <ChartBarIcon className="card-icon" />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{audit.sessionKey}</span>
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className={`badge ${statusBadgeClass(audit.status)}`}>
              {statusLabel(audit.status)}
            </span>
            {hasResults && (
              <>
                <a
                  className="btn btn-secondary"
                  style={{ fontSize: 12 }}
                  href={`/api/audits/${audit.id}/export?format=pdf`}
                  target="_blank"
                  rel="noopener"
                >
                  <ArrowDownTrayIcon style={{ width: 14, height: 14 }} /> PDF{!isFinal ? ' (partiel)' : ''}
                </a>
                <a
                  className="btn btn-success"
                  style={{ fontSize: 12 }}
                  href={`/api/audits/${audit.id}/export?format=excel`}
                  target="_blank"
                  rel="noopener"
                >
                  <ArrowDownTrayIcon style={{ width: 14, height: 14 }} /> Excel{!isFinal ? ' (partiel)' : ''}
                </a>
                <a
                  className="btn btn-secondary"
                  style={{ fontSize: 12 }}
                  href={`/api/audits/${audit.id}/export?format=csv`}
                  target="_blank"
                  rel="noopener"
                  title="Export CSV (RFC 4180, UTF-8 avec BOM) — pour tableur ou ré-import"
                >
                  <ArrowDownTrayIcon style={{ width: 14, height: 14 }} /> CSV{!isFinal ? ' (partiel)' : ''}
                </a>
              </>
            )}
            {isRunning && canModify && <CancelAuditButton id={audit.id} />}
            {isFinal && canModify && canLaunchAudit(session.user.role) && (
              <RelaunchAuditButton id={audit.id} />
            )}
            <Link href="/audits" className="btn btn-secondary" style={{ fontSize: 12 }}>
              <ArrowLeftIcon style={{ width: 14, height: 14 }} /> Retour
            </Link>
          </div>
        </div>
        <div className="card-body" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <div>
            <div className="form-label">Plateforme</div>
            <div style={{ fontSize: 13 }}>
              {audit.platform.name} · Moodle {audit.platform.version}.x
            </div>
          </div>
          <div>
            <div className="form-label">LLM</div>
            <div style={{ fontSize: 13 }}>
              {audit.llmConfig.name} ({audit.llmConfig.provider}/{audit.llmConfig.model})
            </div>
          </div>
          <div>
            <div className="form-label">Lancé par</div>
            <div style={{ fontSize: 13 }}>{audit.user.fullName ?? '—'}</div>
          </div>
          <div>
            <div className="form-label">Démarré</div>
            <div style={{ fontSize: 13 }}>
              {audit.startedAt
                ? new Date(audit.startedAt).toLocaleString('fr-FR')
                : '—'}
            </div>
          </div>
          {audit.finishedAt && (
            <div>
              <div className="form-label">Terminé</div>
              <div style={{ fontSize: 13 }}>
                {new Date(audit.finishedAt).toLocaleString('fr-FR')}
              </div>
            </div>
          )}
        </div>
      </div>

      {!isFinal && (
        <AuditLiveView
          sessionId={audit.id}
          initial={{
            status: audit.status,
            done: audit.doneCourses,
            failed: audit.failedCourses,
            total: audit.totalCourses,
          }}
        />
      )}

      {(hasResults || isFinal) && (
        <AuditResultsView
          sessionId={audit.id}
          totalCourses={audit.totalCourses}
          doneCourses={audit.doneCourses}
          failedCourses={audit.failedCourses}
          courses={courses}
          errors={errors}
          isPartial={!isFinal}
        />
      )}
    </div>
  )
}
