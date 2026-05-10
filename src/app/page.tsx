import Link from 'next/link'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const session = await auth()
  const user = session!.user

  const where = user.role === 'admin' ? {} : { userId: user.id }

  const [platforms, llmConfigs, totalAudits, recent] = await Promise.all([
    prisma.moodlePlatform.count(),
    prisma.llmConfig.count(),
    prisma.auditSession.count({ where }),
    prisma.auditSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        sessionKey: true,
        status: true,
        totalCourses: true,
        doneCourses: true,
        failedCourses: true,
        createdAt: true,
        platform: { select: { name: true } },
      },
    }),
  ])

  const stats: Array<[string | number, string]> = [
    [platforms, 'plateformes Moodle'],
    [llmConfigs, 'configurations LLM'],
    [totalAudits, 'audits total'],
    [recent.filter(r => r.status === 'completed').length, 'audits récents OK'],
    [recent.filter(r => r.status === 'running' || r.status === 'pending').length, 'en cours'],
  ]

  return (
    <div className="flex-col-20">
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <span className="card-icon">🏠</span>
            Bienvenue, {user.fullName || 'utilisateur'}
          </span>
          <span className="badge badge-info">{user.role === 'admin' ? 'Administrateur' : 'Auditeur'}</span>
        </div>
        <div className="card-body">
          <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 16 }}>
            Plateforme d&apos;audit pédagogique des cours Moodle de l&apos;Université Numérique Cheikh Hamidou Kane.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link href="/audits/new" className="btn btn-primary">▶ Lancer un nouvel audit</Link>
            <Link href="/audits" className="btn btn-secondary">Voir mes audits</Link>
            {user.role === 'admin' && (
              <Link href="/configuration" className="btn btn-secondary">Configuration</Link>
            )}
          </div>
        </div>
      </div>

      <div className="stats-row">
        {stats.map(([n, l]) => (
          <div key={l} className="stat-card">
            <div className="stat-num">{n}</div>
            <div className="stat-label">{l}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <span className="card-icon">🗄</span>
            Audits récents
          </span>
          <Link href="/audits" className="btn btn-secondary" style={{ fontSize: 12 }}>Tout voir</Link>
        </div>
        <div className="card-body">
          {recent.length === 0 ? (
            <p style={{ color: 'var(--text3)', fontSize: 13 }}>
              Aucun audit pour le moment. <Link href="/audits/new">Lancez votre premier audit</Link>.
            </p>
          ) : (
            recent.map(r => (
              <Link
                key={r.id}
                href={`/audits/${r.id}`}
                className="platform-item"
                style={{ marginBottom: 8, textDecoration: 'none', color: 'inherit' }}
              >
                <div className="platform-info">
                  <span className="platform-name" style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {r.sessionKey}
                  </span>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    <span className="badge badge-info">{r.platform.name}</span>
                    <span
                      className={`badge ${
                        r.status === 'completed'
                          ? 'badge-success'
                          : r.status === 'failed' || r.status === 'cancelled'
                            ? 'badge-danger'
                            : r.status === 'running'
                              ? 'badge-warn'
                              : 'badge-neutral'
                      }`}
                    >
                      {r.status}
                    </span>
                    <span className="badge badge-neutral">
                      {r.doneCourses}/{r.totalCourses} cours
                      {r.failedCourses > 0 ? ` · ${r.failedCourses} échec(s)` : ''}
                    </span>
                    <span className="badge badge-neutral">
                      {new Date(r.createdAt).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
