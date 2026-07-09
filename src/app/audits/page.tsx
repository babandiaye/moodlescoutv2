import Link from 'next/link'
import { ClipboardDocumentListIcon } from '@heroicons/react/24/outline'
import type { AuditStatus } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { AuditsFilters } from '@/components/audits-filters'
import { DeleteAuditButton } from '@/components/delete-audit-button'
import { PaginationUrl } from '@/components/pagination-url'
import { PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE } from '@/lib/pagination-options'
import {
  activeAuditPlatformFilter,
  canLaunchAudit,
  canModifyAudit,
  canViewAllAudits,
} from '@/lib/permissions'
import { statusBadgeClass, statusLabel } from '@/lib/audit-status'

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
  // Accepte YYYY-MM-DD (format <input type="date">). Toute autre entrée → ignore.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0)
  return Number.isNaN(dt.getTime()) ? undefined : dt
}

export default async function AuditsPage({ searchParams }: Props) {
  const session = await auth()
  const user = session!.user
  const sp = await searchParams

  // Filtres URL (search + platform + status + période)
  const q = (sp.q ?? '').trim()
  const filterPlatformId = (sp.platformId ?? '').trim()
  const filterStatus = (sp.status ?? '').trim() as AuditStatus | ''
  const filterFrom = parseDate(sp.from)
  const filterTo = parseDate(sp.to, true)

  // Where composé : permissions + plateforme active + filtres UI
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
      // Admin voit toutes les plateformes (même désactivées) pour filtrer sur
      // l'historique. Non-admin ne voit que les actives, cohérent avec ce
      // qu'il peut voir dans les audits.
      where: canViewAllAudits(user.role) && user.role === 'admin' ? {} : { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ])
  const hasFilter = Boolean(q || filterPlatformId || filterStatus || filterFrom || filterTo)

  return (
    <div className="flex-col-16">
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <ClipboardDocumentListIcon className="card-icon" /> Audits {canViewAllAudits(user.role) ? '(tous)' : 'personnels'}
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="badge badge-info">
              {total} {total > 1 ? 'résultats' : 'résultat'}{hasFilter ? ' filtrés' : ''}
            </span>
            <Link
              href="/audits/compare"
              className="btn btn-secondary"
              style={{ fontSize: 12 }}
              title="Comparer 2 audits d'une même plateforme"
            >
              Comparer
            </Link>
            {canLaunchAudit(user.role) && (
              <Link href="/audits/new" className="btn btn-primary" style={{ fontSize: 12 }}>
                + Nouvel audit
              </Link>
            )}
          </div>
        </div>
        <div className="card-body">
          <AuditsFilters platforms={platforms} />
          {sessions.length === 0 ? (
            <p style={{ color: 'var(--text3)', fontSize: 13 }}>
              {hasFilter ? (
                <>Aucun audit ne correspond aux filtres. Cliquez « Réinitialiser » ci-dessus.</>
              ) : canLaunchAudit(user.role) ? (
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
                      <span className={`badge ${statusBadgeClass(s.status)}`}>
                        {statusLabel(s.status)}
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
                    {canModifyAudit(user.role, user.id, s.userId)
                      && s.status !== 'running' && s.status !== 'pending' && (
                        <DeleteAuditButton id={s.id} sessionKey={s.sessionKey} />
                      )}
                  </div>
                </div>
              )
            })
          )}
        </div>
        {total > 0 && (
          <PaginationUrl page={page} pageSize={pageSize} total={total} />
        )}
      </div>
    </div>
  )
}
