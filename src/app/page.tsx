import Link from 'next/link'
import {
  ClipboardDocumentListIcon,
  PlayIcon,
  Cog6ToothIcon,
  ChevronRightIcon,
  DocumentTextIcon,
  CpuChipIcon,
  Squares2X2Icon,
  ShieldCheckIcon,
  ChartBarIcon,
  ServerStackIcon,
  CircleStackIcon,
  CheckCircleIcon,
  AcademicCapIcon,
} from '@heroicons/react/24/outline'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  activeAuditPlatformFilter,
  activePlatformFilter,
  canLaunchAudit,
  canViewAllAudits,
  isAdmin,
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
  const seesAll = canViewAllAudits(user.role)

  const where = {
    ...(seesAll ? {} : { userId: user.id }),
    ...activeAuditPlatformFilter(user.role),
  }

  const [platformsCount, llmCount, totalAudits, recentAudits, allSessions, topPlatforms] = await Promise.all([
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
    // Timeline "Activité récente" : 4 événements (audits + plateformes)
    prisma.auditSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 4,
      select: {
        id: true,
        sessionKey: true,
        status: true,
        createdAt: true,
        finishedAt: true,
        totalCourses: true,
        doneCourses: true,
        platform: { select: { name: true } },
      },
    }),
    fetchTopPlatforms(1, isAdmin(user.role)),
  ])

  const recentOk = recentAudits.filter(a => a.status === 'completed').length

  return (
    <div className="flex-col-20">
      {/* HERO */}
      <section className="hero-card">
        <div className="hero-card-body">
          <h1 className="hero-card-title">
            Bienvenue, {user.fullName || 'utilisateur'}
            <span className="hero-card-wave" aria-hidden="true">👋</span>
          </h1>
          <p className="hero-card-desc">
            Plateforme d&apos;audit pédagogique des cours Moodle de l&apos;Université Numérique
            Cheikh Hamidou Kane.
          </p>
          <div className="hero-card-actions">
            {canLaunchAudit(user.role) && (
              <Link href="/audits/new" className="btn btn-primary">
                <PlayIcon width={16} height={16} /> Lancer un nouvel audit
              </Link>
            )}
            <Link href="/audits" className="btn btn-secondary">
              <ClipboardDocumentListIcon width={16} height={16} /> Voir tous les audits
            </Link>
            {isAdmin(user.role) && (
              <Link href="/configuration" className="btn btn-secondary">
                <Cog6ToothIcon width={16} height={16} /> Configuration
              </Link>
            )}
          </div>
        </div>
        <div className="hero-card-illustration">
          <img src="/mslogo-transparent.svg" alt="" className="hero-card-logo" />
        </div>
      </section>

      {/* GRILLE : 4 stats + colonne latérale */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20 }} className="grid-main">
        <div className="flex-col-20" style={{ minWidth: 0 }}>
          <div className="stats-row">
            <StatCard
              icon={<DocumentTextIcon />}
              iconColor="blue"
              value={platformsCount}
              label="Plateformes Moodle"
              sub="Actives"
            />
            <StatCard
              icon={<CpuChipIcon />}
              iconColor="teal"
              value={llmCount}
              label="Configurations LLM"
              sub="Déployées"
            />
            <StatCard
              icon={<Squares2X2Icon />}
              iconColor="purple"
              value={totalAudits}
              label="Audits total"
              sub="Depuis le début"
            />
            <StatCard
              icon={<ShieldCheckIcon />}
              iconColor="pink"
              value={recentOk}
              label="Audits récents OK"
              sub="Dans les 5 derniers"
            />
          </div>

          {/* Audits récents */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                <ClipboardDocumentListIcon className="card-icon" /> Audits récents
              </span>
              <Link href="/audits" className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }}>
                Voir tout
              </Link>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              {recentAudits.length === 0 ? (
                <p style={{ color: 'var(--text3)', fontSize: 13, padding: 24 }}>
                  {canLaunchAudit(user.role) ? (
                    <>Aucun audit. <Link href="/audits/new">Lancez votre premier audit</Link>.</>
                  ) : (
                    <>Aucun audit pour le moment.</>
                  )}
                </p>
              ) : (
                <div className="results-table-wrap">
                  <table className="results-table">
                    <thead>
                      <tr>
                        <th>Audit</th>
                        <th>Plateforme</th>
                        <th>Statut</th>
                        <th>Cours / échecs</th>
                        <th>Date</th>
                        <th style={{ width: 40 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentAudits.map(a => (
                        <tr key={a.id}>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                            {a.sessionKey.length > 32 ? a.sessionKey.slice(0, 30) + '…' : a.sessionKey}
                          </td>
                          <td>
                            <span className="badge badge-info">{a.platform.name}</span>
                          </td>
                          <td>
                            <StatusBadge status={a.status} />
                          </td>
                          <td style={{ fontSize: 12 }}>
                            {a.doneCourses}/{a.totalCourses} cours
                            {a.failedCourses > 0 && (
                              <> · <span style={{ color: 'var(--danger)' }}>{a.failedCourses} échec(s)</span></>
                            )}
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text3)' }}>
                            {new Date(a.createdAt).toLocaleString('fr-FR', {
                              day: '2-digit', month: '2-digit', year: 'numeric',
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </td>
                          <td>
                            <Link
                              href={`/audits/${a.id}`}
                              aria-label="Ouvrir l'audit"
                              style={{ display: 'grid', placeItems: 'center', color: 'var(--text3)' }}
                            >
                              <ChevronRightIcon width={18} height={18} />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Colonne latérale : Activité + Statut système */}
        <div className="flex-col-20" style={{ minWidth: 0 }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">
                <ChartBarIcon className="card-icon" /> Activité récente
              </span>
            </div>
            <div className="card-body">
              {allSessions.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text3)', margin: 0 }}>Aucune activité récente.</p>
              ) : (
                <div className="timeline">
                  {allSessions.map((a, i) => {
                    const color = a.status === 'completed'
                      ? 'green'
                      : a.status === 'failed' || a.status === 'cancelled'
                        ? 'orange'
                        : a.status === 'running' || a.status === 'pending'
                          ? 'blue'
                          : 'purple'
                    const title = a.status === 'completed'
                      ? 'Audit terminé'
                      : a.status === 'failed'
                        ? 'Audit en échec'
                        : a.status === 'cancelled'
                          ? 'Audit annulé'
                          : a.status === 'running'
                            ? 'Audit en cours'
                            : 'Audit créé'
                    return (
                      <div key={i} className="timeline-item">
                        <span className={`timeline-dot ${color}`} />
                        <div className="timeline-content">
                          <div className="timeline-title">{title}</div>
                          <div className="timeline-desc">
                            {a.platform.name} — {a.doneCourses}/{a.totalCourses} cours
                          </div>
                          <div className="timeline-time">{relativeTime(a.createdAt)}</div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">
                <ShieldCheckIcon className="card-icon" /> Statut système
              </span>
              <Link href="/plateformes" style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 600 }}>
                Tout voir
              </Link>
            </div>
            <div className="card-body">
              <div className="status-list">
                <StatusItem icon={<ServerStackIcon />} label="Services d'audit" ok />
                <StatusItem
                  icon={<CpuChipIcon />}
                  label={llmCount > 0 ? `LLM (${llmCount} config${llmCount > 1 ? 's' : ''})` : 'LLM'}
                  ok={llmCount > 0}
                />
                <StatusItem icon={<CircleStackIcon />} label="Base de données" ok />
                <StatusItem icon={<AcademicCapIcon />} label="Intégration Moodle" ok={platformsCount > 0} />
              </div>
            </div>
          </div>

          {topPlatforms.length > 0 && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">
                  <ChartBarIcon className="card-icon" /> Top plateforme
                </span>
              </div>
              <div className="card-body">
                {topPlatforms.map(p => {
                  const scoreColor = p.avg_score >= 75 ? 'var(--success)' : p.avg_score >= 50 ? 'var(--warn)' : 'var(--danger)'
                  return (
                    <Link
                      key={p.platform_id}
                      href={`/plateformes/${p.platform_id}`}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        color: 'var(--text)', textDecoration: 'none',
                      }}
                    >
                      <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: 'var(--brand-soft)',
                        display: 'grid', placeItems: 'center',
                        color: 'var(--brand)', fontWeight: 700, fontSize: 12,
                      }}>
                        #1
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{p.platform_name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                          {p.nb_audited} cours · {p.conformes_pct}% conformes
                        </div>
                      </div>
                      <span style={{
                        fontSize: 13, fontWeight: 700, color: scoreColor,
                        padding: '4px 10px', borderRadius: 10,
                        background: `${scoreColor}18`,
                      }}>
                        {p.avg_score}
                      </span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sous-composants ─────────────────────────────────────────

function StatCard({
  icon,
  iconColor,
  value,
  label,
  sub,
}: {
  icon: React.ReactNode
  iconColor: 'blue' | 'purple' | 'pink' | 'orange' | 'teal' | 'green' | 'yellow'
  value: number | string
  label: string
  sub?: string
}) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${iconColor}`}>{icon}</div>
      <div className="stat-body">
        <div className="stat-num">{value}</div>
        <div className="stat-label">{label}</div>
        {sub && <div className="stat-sublabel">{sub}</div>}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'completed') {
    return <span className="badge badge-success"><CheckCircleIcon width={12} height={12} /> Terminé</span>
  }
  if (status === 'failed' || status === 'cancelled') {
    return <span className="badge badge-danger">✕ {status === 'failed' ? 'Échec' : 'Annulé'}</span>
  }
  if (status === 'running') {
    return <span className="badge badge-warn">● En cours</span>
  }
  return <span className="badge badge-neutral">En attente</span>
}

function StatusItem({ icon, label, ok }: { icon: React.ReactNode; label: string; ok: boolean }) {
  return (
    <div className="status-item">
      <div className={`status-item-icon ${ok ? '' : 'warn'}`}>{icon}</div>
      <div className="status-item-label">{label}</div>
      <span className={`status-item-badge ${ok ? '' : 'warn'}`}>
        {ok ? 'Opérationnel' : 'Non configuré'}
      </span>
    </div>
  )
}

function relativeTime(d: Date): string {
  const diff = Date.now() - d.getTime()
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'à l\'instant'
  const min = Math.floor(sec / 60)
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  const days = Math.floor(h / 24)
  if (days < 7) return `il y a ${days} j`
  return d.toLocaleDateString('fr-FR')
}

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
