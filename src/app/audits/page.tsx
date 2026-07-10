import Link from 'next/link'
import {
  ChartBarIcon,
  PlusIcon,
  CheckCircleIcon,
  XCircleIcon,
  CalendarIcon,
  EyeIcon,
  ClockIcon,
} from '@heroicons/react/24/outline'
import type { AuditStatus } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AuditsFilters } from '@/components/audits-filters'
import { DeleteAuditButton } from '@/components/delete-audit-button'
import { PaginationNumbered } from '@/components/pagination-numbered'
import { PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE } from '@/lib/pagination-options'
import { hueForPlatform } from '@/lib/platform-hue'
import {
  activeAuditPlatformFilter,
  canLaunchAudit,
  canModifyAudit,
  canViewAllAudits,
} from '@/lib/permissions'

export const dynamic = 'force-dynamic'

type Props = {
  searchParams: Promise<{
    page?: string
    size?: string
    q?: string
    platformId?: string
    status?: string
    from?: string
    to?: string
  }>
}

const VALID_STATUSES = new Set<AuditStatus>(['pending', 'running', 'completed', 'failed', 'cancelled'])

function parseDate(s: string | undefined, endOfDay = false): Date | undefined {
  if (!s) return undefined
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0)
  return Number.isNaN(dt.getTime()) ? undefined : dt
}

export default async function AuditsPage({ searchParams }: Props) {
  const session = await auth()
  const user = session!.user
  const sp = await searchParams

  const q = (sp.q ?? '').trim()
  const filterPlatformId = (sp.platformId ?? '').trim()
  const filterStatus = (sp.status ?? '').trim() as AuditStatus | ''
  const filterFrom = parseDate(sp.from)
  const filterTo = parseDate(sp.to, true)

  const where: Record<string, unknown> = {
    ...(canViewAllAudits(user.role) ? {} : { userId: user.id }),
    ...activeAuditPlatformFilter(user.role),
  }
  if (q) where.sessionKey = { contains: q, mode: 'insensitive' }
  if (filterPlatformId) where.platformId = filterPlatformId
  if (filterStatus && VALID_STATUSES.has(filterStatus)) where.status = filterStatus
  if (filterFrom || filterTo) {
    where.createdAt = {
      ...(filterFrom ? { gte: filterFrom } : {}),
      ...(filterTo ? { lte: filterTo } : {}),
    }
  }

  const requestedSize = Number(sp.size ?? DEFAULT_PAGE_SIZE)
  const pageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(requestedSize)
    ? requestedSize
    : DEFAULT_PAGE_SIZE
  const page = Math.max(1, Number(sp.page ?? 1) || 1)

  const [total, sessions, platforms] = await Promise.all([
    prisma.auditSession.count({ where }),
    prisma.auditSession.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
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
    }),
    prisma.moodlePlatform.findMany({
      where: canViewAllAudits(user.role) && user.role === 'admin' ? {} : { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])
  const hasFilter = Boolean(q || filterPlatformId || filterStatus || filterFrom || filterTo)

  return (
    <>
      {/* Header : titre + description + actions à droite */}
      <div className="page-title-block">
        <div className="page-title-body">
          <h1 className="page-title">Audits</h1>
          <p className="page-subtitle">
            {canViewAllAudits(user.role)
              ? 'Consultez et gérez tous les audits réalisés sur vos plateformes.'
              : 'Consultez et gérez vos audits.'}
          </p>
        </div>
        <div className="page-title-actions">
          <span className="badge-results">
            {total} {total > 1 ? 'résultats' : 'résultat'}{hasFilter ? ' filtrés' : ''}
          </span>
          <Link
            href="/audits/compare"
            className="btn btn-secondary"
            title="Comparer 2 audits d'une même plateforme"
          >
            <ChartBarIcon width={16} height={16} /> Comparer
          </Link>
          {canLaunchAudit(user.role) && (
            <Link href="/audits/new" className="btn btn-primary">
              <PlusIcon width={16} height={16} /> Nouvel audit
            </Link>
          )}
        </div>
      </div>

      {/* Filtres */}
      <AuditsFilters platforms={platforms} />

      {/* Table */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {sessions.length === 0 ? (
          <div className="empty-state">
            {hasFilter ? (
              <>Aucun audit ne correspond aux filtres. Cliquez « Réinitialiser » ci-dessus.</>
            ) : canLaunchAudit(user.role) ? (
              <>Aucun audit. <Link href="/audits/new">Lancez votre premier audit</Link>.</>
            ) : (
              <>Aucun audit pour le moment.</>
            )}
          </div>
        ) : (
          <div className="results-table-wrap">
            <table className="results-table">
              <thead>
                <tr>
                  <th>Audit</th>
                  <th>Plateforme</th>
                  <th>Statut</th>
                  <th>Progression</th>
                  <th>Durée</th>
                  <th>Date</th>
                  <th style={{ width: 100, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => {
                  const pct = s.totalCourses > 0 ? Math.round((s.doneCourses / s.totalCourses) * 100) : 0
                  const hue = hueForPlatform(s.platform.name)
                  const canDelete = canModifyAudit(user.role, user.id, s.userId) &&
                    s.status !== 'running' && s.status !== 'pending'
                  const dateObj = new Date(s.createdAt)
                  return (
                    <tr key={s.id}>
                      <td>
                        <Link href={`/audits/${s.id}`} className="audit-link">
                          {s.sessionKey}
                        </Link>
                        {canViewAllAudits(user.role) && s.user.fullName && (
                          <div className="audit-subline">par {s.user.fullName}</div>
                        )}
                      </td>
                      <td>
                        <span className={`platform-badge hue-${hue}`}>{s.platform.name}</span>
                      </td>
                      <td><StatusPill status={s.status} /></td>
                      <td>
                        <ProgressCell
                          done={s.doneCourses}
                          total={s.totalCourses}
                          failed={s.failedCourses}
                          pct={pct}
                          status={s.status}
                        />
                      </td>
                      <td>
                        <DurationCell
                          failed={s.failedCourses}
                          startedAt={s.startedAt}
                          finishedAt={s.finishedAt}
                          status={s.status}
                        />
                      </td>
                      <td>
                        <div className="date-cell">
                          <CalendarIcon className="date-cell-icon" />
                          <div>
                            <div className="date-cell-date">
                              {dateObj.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                            </div>
                            <div className="date-cell-time">
                              {dateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="actions-cell" style={{ justifyContent: 'flex-end' }}>
                          <Link
                            href={`/audits/${s.id}`}
                            className="action-btn view"
                            title="Ouvrir l'audit"
                            aria-label="Ouvrir l'audit"
                          >
                            <EyeIcon />
                          </Link>
                          {canDelete && (
                            <DeleteAuditButton id={s.id} sessionKey={s.sessionKey} />
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <PaginationNumbered page={page} pageSize={pageSize} total={total} />
      </div>
    </>
  )
}

// ─── Sous-composants ─────────────────────────────────────────

function StatusPill({ status }: { status: string }) {
  if (status === 'completed') {
    return (
      <span className="badge badge-success">
        <CheckCircleIcon width={12} height={12} /> Terminé
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className="badge badge-danger">
        <XCircleIcon width={12} height={12} /> Échec
      </span>
    )
  }
  if (status === 'cancelled') {
    return <span className="badge badge-danger">Annulé</span>
  }
  if (status === 'running') {
    return <span className="badge badge-warn">● En cours</span>
  }
  return <span className="badge badge-neutral">En attente</span>
}

function ProgressCell({
  done, total, failed, pct, status,
}: {
  done: number
  total: number
  failed: number
  pct: number
  status: string
}) {
  const fillClass = status === 'failed'
    ? 'danger'
    : status === 'running' || status === 'pending'
      ? 'running'
      : failed > 0
        ? 'warn'
        : ''
  return (
    <div className="progress-inline">
      <div className="progress-inline-header">
        <span className="progress-inline-count">
          {done}/{total}<span className="unit">cours</span>
        </span>
        <span className="progress-inline-pct">{pct}%</span>
      </div>
      <div className="progress-inline-bar">
        <div className={`progress-inline-fill ${fillClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function DurationCell({
  failed,
  startedAt,
  finishedAt,
  status,
}: {
  failed: number
  startedAt: Date | null
  finishedAt: Date | null
  status: string
}) {
  if (failed > 0 && (status === 'failed' || status === 'completed')) {
    return <span style={{ color: 'var(--danger)', fontWeight: 500, fontSize: 12.5 }}>{failed} échec(s)</span>
  }
  if (startedAt && finishedAt) {
    const durMs = new Date(finishedAt).getTime() - new Date(startedAt).getTime()
    if (durMs > 0) {
      const sec = Math.round(durMs / 1000)
      const label = sec >= 60 ? `${Math.floor(sec / 60)} min ${sec % 60}s` : `${sec}s`
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12.5, color: 'var(--text2)' }}>
          <ClockIcon width={12} height={12} /> {label}
        </span>
      )
    }
  }
  return <span style={{ color: 'var(--text3)', fontSize: 13 }}>—</span>
}
