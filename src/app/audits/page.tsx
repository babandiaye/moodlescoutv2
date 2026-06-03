import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { DeleteAuditButton } from '@/components/delete-audit-button'
import { canViewAllAudits, canLaunchAudit, canModifyAudit } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-neutral',
  running: 'badge-warn',
  completed: 'badge-success',
  failed: 'badge-danger',
  cancelled: 'badge-danger',
}

export default async function AuditsPage() {
  const session = await auth()
  const user = session!.user
  const where = canViewAllAudits(user.role) ? {} : { userId: user.id }

  const sessions = await prisma.auditSession.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 50,
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
      userId: true,
      user: { select: { fullName: true } },
      platform: { select: { name: true } },
      llmConfig: { select: { provider: true, model: true } },
    },
  })

  return (
    <div className="flex-col-16">
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <span className="card-icon">🗄</span> Audits {canViewAllAudits(user.role) ? '(tous)' : 'personnels'}
          </span>
          {canLaunchAudit(user.role) && (
            <Link href="/audits/new" className="btn btn-primary" style={{ fontSize: 12 }}>
              + Nouvel audit
            </Link>
          )}
        </div>
        <div className="card-body">
          {sessions.length === 0 ? (
            <p style={{ color: 'var(--text3)', fontSize: 13 }}>
              {canLaunchAudit(user.role) ? (
                <>Aucun audit. <Link href="/audits/new">Lancez votre premier audit</Link>.</>
              ) : (
                <>Aucun audit pour le moment.</>
              )}
            </p>
          ) : (
            sessions.map(s => {
              const pct =
                s.totalCourses > 0 ? Math.round((s.doneCourses / s.totalCourses) * 100) : 0
              return (
                <div key={s.id} className="platform-item" style={{ marginBottom: 8 }}>
                  <div className="platform-info">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Link
                        href={`/audits/${s.id}`}
                        className="platform-name"
                        style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--brand2)' }}
                      >
                        {s.sessionKey}
                      </Link>
                      <span className={`badge ${STATUS_BADGE[s.status] ?? 'badge-neutral'}`}>
                        {s.status}
                      </span>
                      <span className="badge badge-info">{s.platform.name}</span>
                      <span className="badge badge-neutral">
                        {s.llmConfig.provider}/{s.llmConfig.model}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {s.doneCourses}/{s.totalCourses} cours · {pct}%
                        {s.failedCourses > 0 ? ` · ${s.failedCourses} échec(s)` : ''}
                      </span>
                      {canViewAllAudits(user.role) && (
                        <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                          par {s.user.fullName ?? '—'}
                        </span>
                      )}
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                        {new Date(s.createdAt).toLocaleString('fr-FR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="platform-actions">
                    <Link
                      href={`/audits/${s.id}`}
                      className="btn btn-primary"
                      style={{ fontSize: 12, padding: '6px 14px' }}
                    >
                      Ouvrir
                    </Link>
                    {canModifyAudit(user.role, user.id, s.userId) && (
                      <DeleteAuditButton id={s.id} sessionKey={s.sessionKey} />
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
