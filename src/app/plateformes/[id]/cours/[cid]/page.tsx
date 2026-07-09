import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeftIcon, ClockIcon, EyeIcon, ChartBarIcon } from '@heroicons/react/24/outline'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  canViewAllAudits,
  isAdmin,
  activeAuditPlatformFilter,
} from '@/lib/permissions'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

type Ctx = { params: Promise<{ id: string; cid: string }> }

/**
 * Historique de tous les audits successifs d'un cours donné sur une plateforme.
 * Affiche une timeline verticale : chaque ligne = un audit (score, delta, LLM,
 * date, statut) → cliquable vers la vue détail de cet audit-là.
 *
 * Le non-admin ne voit que les audits qui lui appartiennent (auditeur) ou tous
 * s'il est lecteur/admin. Les audits sur plateforme désactivée sont masqués
 * aux non-admins (règle globale).
 */
export default async function CourseHistoryPage({ params }: Ctx) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const { id, cid } = await params
  const courseId = parseInt(cid, 10)
  if (!Number.isFinite(courseId) || courseId <= 0) notFound()

  const platform = await prisma.moodlePlatform.findUnique({
    where: { id },
    select: { id: true, name: true, url: true, isActive: true },
  })
  if (!platform) notFound()
  if (!platform.isActive && !isAdmin(session.user.role)) redirect('/plateformes')

  // Restriction visibilité :
  //  - lecteur/admin : tous les audits sur ce cours
  //  - auditeur : uniquement ses propres audits
  const sessionsWhere = {
    platformId: id,
    ...(canViewAllAudits(session.user.role) ? {} : { userId: session.user.id }),
    ...activeAuditPlatformFilter(session.user.role),
  }

  const audits = await prisma.courseAudit.findMany({
    where: {
      courseId,
      session: sessionsWhere,
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      scoreGlobal: true,
      errorMessage: true,
      durationMs: true,
      createdAt: true,
      shortname: true,
      fullname: true,
      session: {
        select: {
          id: true,
          sessionKey: true,
          status: true,
          user: { select: { fullName: true } },
          llmConfig: { select: { provider: true, model: true, name: true } },
        },
      },
    },
  })

  const firstOk = audits.find(a => !a.errorMessage)
  const displayName = firstOk?.fullname || audits[0]?.fullname || `Cours ${courseId}`
  const displayCode = firstOk?.shortname || audits[0]?.shortname

  // Delta vs audit précédent (pour la timeline). audits est trié desc,
  // donc "précédent chronologiquement" = index suivant dans le tableau.
  const rows = audits.map((a, i) => {
    const prev = audits[i + 1]
    const prevScore = prev && !prev.errorMessage ? Number(prev.scoreGlobal ?? 0) : null
    const currScore = !a.errorMessage ? Number(a.scoreGlobal ?? 0) : null
    const delta = currScore !== null && prevScore !== null ? currScore - prevScore : null
    return { ...a, delta, currScore }
  })

  return (
    <div className="flex-col-16">
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <ClockIcon className="card-icon" /> Historique — {displayName}
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {displayCode && <span className="badge badge-neutral" style={{ fontFamily: 'var(--mono)' }}>{displayCode}</span>}
            <span className="badge badge-info">{audits.length} audit{audits.length > 1 ? 's' : ''}</span>
            <a
              href={`${platform.url.replace(/\/+$/, '')}/course/view.php?id=${courseId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary"
              style={{ fontSize: 12 }}
            >
              Ouvrir dans Moodle
            </a>
            <Link href={`/plateformes/${platform.id}`} className="btn btn-secondary" style={{ fontSize: 12 }}>
              <ArrowLeftIcon style={{ width: 14, height: 14 }} /> Retour plateforme
            </Link>
          </div>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>
            Tous les audits successifs de ce cours sur <strong>{platform.name}</strong>, du plus récent au plus ancien.
            {canViewAllAudits(session.user.role)
              ? ' Vous voyez tous les audits (rôle admin/lecteur).'
              : ' Vous ne voyez que les audits que vous avez lancés.'}
          </p>
        </div>
      </div>

      {audits.length === 0 ? (
        <div className="card">
          <div className="card-body">
            <p style={{ fontSize: 13, color: 'var(--text3)', margin: 0 }}>
              Aucun audit pour ce cours. <Link href={`/audits/new?platform=${platform.id}`}>Lancez-en un</Link>.
            </p>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            <div className="results-table-wrap">
              <table className="results-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Session</th>
                    <th>LLM</th>
                    <th>Lancé par</th>
                    <th style={{ width: 90 }}>Score</th>
                    <th style={{ width: 90 }}>Δ</th>
                    <th style={{ width: 80 }}>Durée</th>
                    <th style={{ width: 90 }}>Statut</th>
                    <th style={{ width: 100 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(a => {
                    const score = a.currScore ?? 0
                    const scoreCls = score >= 75 ? 'high' : score >= 50 ? 'mid' : 'low'
                    return (
                      <tr key={a.id}>
                        <td style={{ fontSize: 12 }}>
                          {new Date(a.createdAt).toLocaleString('fr-FR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>
                          {a.session.sessionKey.slice(0, 24)}
                        </td>
                        <td style={{ fontSize: 12 }}>
                          <span className="badge badge-neutral">
                            {a.session.llmConfig.provider}/{a.session.llmConfig.model}
                          </span>
                        </td>
                        <td style={{ fontSize: 12 }}>{a.session.user.fullName ?? '—'}</td>
                        <td>
                          {a.errorMessage ? (
                            <span className="badge badge-danger">Échec</span>
                          ) : (
                            <div className={`score-circle ${scoreCls}`}>{score}</div>
                          )}
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {a.delta === null ? (
                            <span style={{ color: 'var(--text3)' }}>—</span>
                          ) : a.delta === 0 ? (
                            <span style={{ color: 'var(--text3)' }}>±0</span>
                          ) : a.delta > 0 ? (
                            <span style={{ color: '#16a34a', fontWeight: 600 }}>+{a.delta}</span>
                          ) : (
                            <span style={{ color: '#dc2626', fontWeight: 600 }}>{a.delta}</span>
                          )}
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {a.durationMs ? `${Math.round(a.durationMs / 1000)}s` : '—'}
                        </td>
                        <td>
                          <span
                            className={`badge ${a.session.status === 'completed' ? 'badge-success'
                              : a.session.status === 'failed' || a.session.status === 'cancelled' ? 'badge-danger'
                              : 'badge-warn'}`}
                          >
                            {a.session.status}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <Link
                              href={`/audits/${a.session.id}/cours/${courseId}`}
                              className="btn btn-secondary"
                              style={{ fontSize: 11, padding: '4px 8px' }}
                              title="Voir le détail de ce cours dans cet audit"
                            >
                              <EyeIcon style={{ width: 12, height: 12 }} />
                            </Link>
                            <Link
                              href={`/audits/${a.session.id}`}
                              className="btn btn-secondary"
                              style={{ fontSize: 11, padding: '4px 8px' }}
                              title="Voir l'audit complet"
                            >
                              <ChartBarIcon style={{ width: 12, height: 12 }} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
