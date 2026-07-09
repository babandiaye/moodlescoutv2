import Link from 'next/link'
import {
  HomeIcon,
  ClipboardDocumentListIcon,
  PlayIcon,
  ChartBarIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AuditSparkline } from '@/components/audit-sparkline'
import {
  activeAuditPlatformFilter,
  activePlatformFilter,
  canLaunchAudit,
  canViewAllAudits,
  isAdmin,
  roleLabel,
} from '@/lib/permissions'

export const dynamic = 'force-dynamic'

type PlatformScoreRow = {
  platform_id: string
  platform_name: string
  nb_audited: number
  avg_score: number
  conformes_pct: number
}

export default async function Home() {
  const session = await auth()
  const user = session!.user

  // Audits visibles : lecteur/admin voient tout, auditeur voit ses siens.
  // Non-admins ne voient PAS les audits liés à une plateforme désactivée.
  const where = {
    ...(canViewAllAudits(user.role) ? {} : { userId: user.id }),
    ...activeAuditPlatformFilter(user.role),
  }

  const seesAll = canViewAllAudits(user.role)

  const [platforms, llmConfigs, totalAudits, recent, sparklineData, topPlatforms] = await Promise.all([
    prisma.moodlePlatform.count({ where: activePlatformFilter(user.role) }),
    prisma.llmConfig.count({ where: { isActive: true } }),
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
    // Sparkline 30 jours — filtre user si non-admin/non-lecteur
    fetchAuditsPerDayScoped(30, seesAll ? null : user.id, isAdmin(user.role)),
    // Top 5 plateformes par score moyen des derniers audits de cours
    fetchTopPlatforms(5, isAdmin(user.role)),
  ])

  const totalRecentActive = sparklineData.reduce((s, n) => s + n, 0)

  const stats: Array<[string | number, string]> = [
    [platforms, 'plateformes actives'],
    [llmConfigs, 'fournisseurs IA'],
    [totalAudits, 'audits total'],
    [totalRecentActive, 'audits 30j'],
    [recent.filter(r => r.status === 'running' || r.status === 'pending').length, 'en cours'],
  ]

  return (
    <div className="flex-col-20">
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <HomeIcon className="card-icon" />
            Bienvenue, {user.fullName || 'utilisateur'}
          </span>
          <span className="badge badge-info">{roleLabel(user.role)}</span>
        </div>
        <div className="card-body">
          <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 16 }}>
            Plateforme d&apos;audit pédagogique des cours Moodle de l&apos;Université Numérique Cheikh Hamidou Kane.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canLaunchAudit(user.role) && (
              <Link href="/audits/new" className="btn btn-primary">
                <PlayIcon style={{ width: 14, height: 14 }} /> Lancer un nouvel audit
              </Link>
            )}
            <Link href="/audits" className="btn btn-secondary">
              {canViewAllAudits(user.role) ? 'Voir tous les audits' : 'Voir mes audits'}
            </Link>
            <Link href="/plateformes" className="btn btn-secondary">Explorer les plateformes</Link>
            {isAdmin(user.role) && (
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
        {/* Activité 30 jours */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <ChartBarIcon className="card-icon" /> Activité (30 jours)
            </span>
            <span className="badge badge-info">{totalRecentActive} audit{totalRecentActive > 1 ? 's' : ''}</span>
          </div>
          <div className="card-body">
            <AuditSparkline data={sparklineData} width={280} height={60} />
            <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6, marginBottom: 0 }}>
              {seesAll
                ? 'Nombre d\'audits lancés par jour (toutes plateformes actives).'
                : 'Vos audits, jour par jour.'}
            </p>
          </div>
        </div>

        {/* Top 5 plateformes */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <TrophyIcon className="card-icon" /> Top plateformes par score
            </span>
            <span className="badge badge-info">{topPlatforms.length}</span>
          </div>
          <div className="card-body">
            {topPlatforms.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text3)', margin: 0 }}>
                Aucun cours audité pour l&apos;instant.
              </p>
            ) : (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: 13 }}>
                {topPlatforms.map((p, i) => {
                  const scoreColor = p.avg_score >= 75 ? '#16a34a' : p.avg_score >= 50 ? '#d97706' : '#dc2626'
                  return (
                    <li key={p.platform_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: 'var(--text3)', fontFamily: 'var(--mono)', width: 20 }}>{i + 1}.</span>
                      <Link href={`/plateformes/${p.platform_id}`} style={{ flex: 1, color: 'var(--text)', textDecoration: 'none', fontWeight: 500 }}>
                        {p.platform_name}
                      </Link>
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>{p.nb_audited} cours</span>
                      <span style={{ fontSize: 11, color: 'var(--text3)' }}>{p.conformes_pct}% conf.</span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: 10,
                          background: `${scoreColor}20`,
                          color: scoreColor,
                          border: `1px solid ${scoreColor}`,
                          minWidth: 46,
                          textAlign: 'center',
                        }}
                      >
                        {p.avg_score}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <ClipboardDocumentListIcon className="card-icon" />
            Audits récents
          </span>
          <Link href="/audits" className="btn btn-secondary" style={{ fontSize: 12 }}>Tout voir</Link>
        </div>
        <div className="card-body">
          {recent.length === 0 ? (
            <p style={{ color: 'var(--text3)', fontSize: 13 }}>
              {canLaunchAudit(user.role) ? (
                <>Aucun audit pour le moment. <Link href="/audits/new">Lancez votre premier audit</Link>.</>
              ) : (
                <>Aucun audit pour le moment.</>
              )}
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

/**
 * Version scopée par utilisateur/plateforme active. Séparée pour garder les
 * queries $queryRaw lisibles (pas de branchement dans le SQL tagged template).
 */
async function fetchAuditsPerDayScoped(
  days: number,
  userIdFilter: string | null,
  seesInactive: boolean,
): Promise<number[]> {
  const rows = userIdFilter
    ? await prisma.$queryRaw<Array<{ day: Date; c: bigint }>>`
        SELECT DATE_TRUNC('day', s.created_at) AS day, COUNT(*)::bigint AS c
        FROM audit_sessions s
        INNER JOIN moodle_platforms p ON p.id = s.platform_id
        WHERE s.created_at >= NOW() - (${days}::int * INTERVAL '1 day')
          AND s.user_id = ${userIdFilter}
          AND p.is_active = true
        GROUP BY day
        ORDER BY day ASC
      `
    : seesInactive
      ? await prisma.$queryRaw<Array<{ day: Date; c: bigint }>>`
          SELECT DATE_TRUNC('day', s.created_at) AS day, COUNT(*)::bigint AS c
          FROM audit_sessions s
          WHERE s.created_at >= NOW() - (${days}::int * INTERVAL '1 day')
          GROUP BY day
          ORDER BY day ASC
        `
      : await prisma.$queryRaw<Array<{ day: Date; c: bigint }>>`
          SELECT DATE_TRUNC('day', s.created_at) AS day, COUNT(*)::bigint AS c
          FROM audit_sessions s
          INNER JOIN moodle_platforms p ON p.id = s.platform_id
          WHERE s.created_at >= NOW() - (${days}::int * INTERVAL '1 day')
            AND p.is_active = true
          GROUP BY day
          ORDER BY day ASC
        `

  const byDay = new Map<string, number>()
  for (const r of rows) {
    byDay.set(new Date(r.day).toISOString().slice(0, 10), Number(r.c))
  }
  const out: number[] = []
  const today = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    out.push(byDay.get(key) ?? 0)
  }
  return out
}

/**
 * Top N plateformes par score moyen (dernier audit réussi par cours agrégé).
 * Similaire à category-stats mais groupé par platform.
 */
async function fetchTopPlatforms(limit: number, seesInactive: boolean): Promise<PlatformScoreRow[]> {
  const rows = seesInactive
    ? await prisma.$queryRaw<PlatformScoreRow[]>`
        WITH latest AS (
          SELECT DISTINCT ON (s.platform_id, ca.course_id)
            s.platform_id,
            ca.score_global
          FROM course_audits ca
          INNER JOIN audit_sessions s ON s.id = ca.session_id
          WHERE ca.error_message IS NULL
          ORDER BY s.platform_id, ca.course_id, ca.created_at DESC
        )
        SELECT
          p.id AS platform_id,
          p.name AS platform_name,
          COUNT(*)::int AS nb_audited,
          ROUND(AVG(latest.score_global))::int AS avg_score,
          ROUND(100.0 * SUM(CASE WHEN latest.score_global >= 75 THEN 1 ELSE 0 END) / COUNT(*))::int AS conformes_pct
        FROM latest
        INNER JOIN moodle_platforms p ON p.id = latest.platform_id
        GROUP BY p.id, p.name
        ORDER BY avg_score DESC, nb_audited DESC
        LIMIT ${limit}
      `
    : await prisma.$queryRaw<PlatformScoreRow[]>`
        WITH latest AS (
          SELECT DISTINCT ON (s.platform_id, ca.course_id)
            s.platform_id,
            ca.score_global
          FROM course_audits ca
          INNER JOIN audit_sessions s ON s.id = ca.session_id
          INNER JOIN moodle_platforms p ON p.id = s.platform_id
          WHERE ca.error_message IS NULL
            AND p.is_active = true
          ORDER BY s.platform_id, ca.course_id, ca.created_at DESC
        )
        SELECT
          p.id AS platform_id,
          p.name AS platform_name,
          COUNT(*)::int AS nb_audited,
          ROUND(AVG(latest.score_global))::int AS avg_score,
          ROUND(100.0 * SUM(CASE WHEN latest.score_global >= 75 THEN 1 ELSE 0 END) / COUNT(*))::int AS conformes_pct
        FROM latest
        INNER JOIN moodle_platforms p ON p.id = latest.platform_id
        GROUP BY p.id, p.name
        ORDER BY avg_score DESC, nb_audited DESC
        LIMIT ${limit}
      `
  return rows
}
