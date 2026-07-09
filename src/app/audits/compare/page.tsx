import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { AuditStatus } from '@prisma/client'
import {
  ArrowsRightLeftIcon,
  ArrowLongRightIcon,
  ArrowLongLeftIcon,
} from '@heroicons/react/24/outline'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CompareSelectors } from '@/components/compare-selectors'
import {
  activeAuditPlatformFilter,
  canViewAllAudits,
  canViewAudit,
} from '@/lib/permissions'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

type Props = {
  searchParams: Promise<{ from?: string; to?: string }>
}

/**
 * Comparateur d'audits : choisit 2 sessions sur la MÊME plateforme (from/to) et
 * affiche la matrice diff des scores par cours. Utile pour voir l'impact
 * réel des recommandations entre 2 audits successifs de la même plateforme.
 *
 * Contraintes :
 *  - from et to sont validés sur (userId visible) + platforme active pour non-admin
 *  - from.platformId doit == to.platformId (sinon on affiche un message)
 *  - "from" = ancien, "to" = récent — l'UI met à jour l'ordre automatiquement
 *    par createdAt pour éviter les Δ négatifs contre-intuitifs
 */
export default async function CompareAuditsPage({ searchParams }: Props) {
  const session = await auth()
  if (!session?.user) redirect('/login')
  const user = session.user
  const sp = await searchParams

  // Liste des audits disponibles pour le picker : ceux que l'utilisateur peut
  // voir (respect canViewAudit + activePlatformFilter).
  const sessionsWhere = {
    ...(canViewAllAudits(user.role) ? {} : { userId: user.id }),
    ...activeAuditPlatformFilter(user.role),
    status: { in: ['completed', 'failed', 'cancelled'] as AuditStatus[] },
  }
  const availableAudits = await prisma.auditSession.findMany({
    where: sessionsWhere,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      sessionKey: true,
      status: true,
      createdAt: true,
      totalCourses: true,
      doneCourses: true,
      platform: { select: { id: true, name: true } },
    },
    take: 100,
  })

  // Résolution des 2 audits sélectionnés
  const fromId = sp.from ?? ''
  const toId = sp.to ?? ''
  const [fromAudit, toAudit] = await Promise.all([
    fromId ? loadAuditWithCourses(fromId, user) : null,
    toId ? loadAuditWithCourses(toId, user) : null,
  ])

  const bothLoaded = fromAudit && toAudit
  const samePlatform = bothLoaded && fromAudit.platformId === toAudit.platformId
  // Ordre chronologique : from = plus ancien
  const [older, newer] = bothLoaded && fromAudit.createdAt > toAudit.createdAt
    ? [toAudit, fromAudit]
    : bothLoaded
      ? [fromAudit, toAudit]
      : [null, null]

  const diff = older && newer && samePlatform ? computeCourseDiff(older.courses, newer.courses) : null

  return (
    <div className="flex-col-16">
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <ArrowsRightLeftIcon className="card-icon" /> Comparateur d&apos;audits
          </span>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 13, color: 'var(--text2)', marginTop: 0 }}>
            Choisissez deux audits <strong>sur la même plateforme</strong> pour comparer les scores cours par cours.
            Le comparateur détecte automatiquement l&apos;audit le plus ancien et calcule le Δ vers le plus récent.
          </p>
          <CompareSelectors
            available={availableAudits.map(a => ({
              id: a.id,
              sessionKey: a.sessionKey,
              status: a.status,
              createdAt: a.createdAt.toISOString(),
              totalCourses: a.totalCourses,
              doneCourses: a.doneCourses,
              platformId: a.platform.id,
              platformName: a.platform.name,
            }))}
            initialFrom={fromId}
            initialTo={toId}
          />
        </div>
      </div>

      {bothLoaded && !samePlatform && (
        <div className="card">
          <div className="card-body" style={{ color: 'var(--danger)', fontSize: 13 }}>
            Les deux audits ne portent pas sur la même plateforme. Comparaison impossible.
          </div>
        </div>
      )}

      {diff && older && newer && (
        <>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Synthèse</span>
              <span className="badge badge-info">{diff.rows.length} cours communs</span>
            </div>
            <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, fontSize: 13 }}>
              <MiniStat label="Audit ancien" value={new Date(older.createdAt).toLocaleDateString('fr-FR')} />
              <MiniStat label="Audit récent" value={new Date(newer.createdAt).toLocaleDateString('fr-FR')} />
              <MiniStat label="Score moy. ancien" value={diff.avgOlder} />
              <MiniStat label="Score moy. récent" value={diff.avgNewer} />
              <MiniStat
                label="Δ moyen"
                value={
                  diff.avgDelta > 0 ? `+${diff.avgDelta}` : String(diff.avgDelta)
                }
                color={diff.avgDelta > 0 ? '#16a34a' : diff.avgDelta < 0 ? '#dc2626' : undefined}
              />
              <MiniStat label="En hausse" value={`${diff.improved} cours`} color="#16a34a" />
              <MiniStat label="En baisse" value={`${diff.degraded} cours`} color="#dc2626" />
              <MiniStat label="Stables" value={`${diff.stable} cours`} />
              <MiniStat label="Uniquement dans ancien" value={diff.onlyOlder.length} />
              <MiniStat label="Uniquement dans récent" value={diff.onlyNewer.length} />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Détail par cours</span>
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>
                <ArrowLongLeftIcon style={{ width: 12, height: 12, verticalAlign: '-2px', display: 'inline-block' }} />{' '}
                {older.sessionKey.slice(0, 20)}
                {' → '}
                {newer.sessionKey.slice(0, 20)}{' '}
                <ArrowLongRightIcon style={{ width: 12, height: 12, verticalAlign: '-2px', display: 'inline-block' }} />
              </span>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <div className="results-table-wrap">
                <table className="results-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Intitulé</th>
                      <th style={{ width: 80 }}>Ancien</th>
                      <th style={{ width: 80 }}>Récent</th>
                      <th style={{ width: 80 }}>Δ</th>
                      <th style={{ width: 120 }}>Ouvrir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.rows.map(r => (
                      <tr key={r.courseId}>
                        <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{r.shortname}</td>
                        <td>{r.fullname}</td>
                        <td><ScoreCell v={r.olderScore} /></td>
                        <td><ScoreCell v={r.newerScore} /></td>
                        <td>
                          {r.delta === 0 ? (
                            <span style={{ color: 'var(--text3)' }}>±0</span>
                          ) : r.delta > 0 ? (
                            <span style={{ color: '#16a34a', fontWeight: 600 }}>+{r.delta}</span>
                          ) : (
                            <span style={{ color: '#dc2626', fontWeight: 600 }}>{r.delta}</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <Link
                              href={`/audits/${older.id}/cours/${r.courseId}`}
                              className="btn btn-secondary"
                              style={{ fontSize: 11, padding: '2px 6px' }}
                              title="Détail dans l'ancien audit"
                            >
                              ⏴
                            </Link>
                            <Link
                              href={`/audits/${newer.id}/cours/${r.courseId}`}
                              className="btn btn-secondary"
                              style={{ fontSize: 11, padding: '2px 6px' }}
                              title="Détail dans le récent audit"
                            >
                              ⏵
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {(diff.onlyOlder.length > 0 || diff.onlyNewer.length > 0) && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">Cours non communs</span>
              </div>
              <div className="card-body" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, fontSize: 13 }}>
                {diff.onlyOlder.length > 0 && (
                  <div>
                    <div className="form-label">Uniquement dans l&apos;ancien ({diff.onlyOlder.length})</div>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {diff.onlyOlder.map(c => (
                        <li key={c.courseId}>
                          <code style={{ fontSize: 11 }}>{c.shortname}</code> — {c.fullname}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {diff.onlyNewer.length > 0 && (
                  <div>
                    <div className="form-label">Uniquement dans le récent ({diff.onlyNewer.length})</div>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {diff.onlyNewer.map(c => (
                        <li key={c.courseId}>
                          <code style={{ fontSize: 11 }}>{c.shortname}</code> — {c.fullname}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────

type LoadedAudit = {
  id: string
  sessionKey: string
  platformId: string
  createdAt: Date
  courses: Array<{ courseId: number; shortname: string; fullname: string; scoreGlobal: number | null; errorMessage: string | null }>
}

async function loadAuditWithCourses(auditId: string, user: { id: string; role: any }): Promise<LoadedAudit | null> {
  const audit = await prisma.auditSession.findUnique({
    where: { id: auditId },
    select: {
      id: true,
      userId: true,
      sessionKey: true,
      platformId: true,
      createdAt: true,
      platform: { select: { isActive: true } },
      courseAudits: {
        select: { courseId: true, shortname: true, fullname: true, scoreGlobal: true, errorMessage: true },
      },
    },
  })
  if (!audit) return null
  if (!canViewAudit(user.role, user.id, audit.userId)) return null
  if (!audit.platform.isActive && user.role !== 'admin') return null
  return {
    id: audit.id,
    sessionKey: audit.sessionKey,
    platformId: audit.platformId,
    createdAt: audit.createdAt,
    courses: audit.courseAudits,
  }
}

type DiffRow = {
  courseId: number
  shortname: string
  fullname: string
  olderScore: number | null
  newerScore: number | null
  delta: number
}

function computeCourseDiff(
  older: LoadedAudit['courses'],
  newer: LoadedAudit['courses'],
): {
  rows: DiffRow[]
  onlyOlder: Array<{ courseId: number; shortname: string; fullname: string }>
  onlyNewer: Array<{ courseId: number; shortname: string; fullname: string }>
  avgOlder: number
  avgNewer: number
  avgDelta: number
  improved: number
  degraded: number
  stable: number
} {
  const olderMap = new Map(older.map(c => [c.courseId, c]))
  const newerMap = new Map(newer.map(c => [c.courseId, c]))
  const commonIds = [...olderMap.keys()].filter(id => newerMap.has(id))
  const onlyOlder = older.filter(c => !newerMap.has(c.courseId)).map(c => ({ courseId: c.courseId, shortname: c.shortname, fullname: c.fullname }))
  const onlyNewer = newer.filter(c => !olderMap.has(c.courseId)).map(c => ({ courseId: c.courseId, shortname: c.shortname, fullname: c.fullname }))

  const rows: DiffRow[] = []
  let improved = 0, degraded = 0, stable = 0
  let sumOlder = 0, sumNewer = 0, cnt = 0

  for (const cid of commonIds) {
    const o = olderMap.get(cid)!
    const n = newerMap.get(cid)!
    const oScore = o.errorMessage ? null : Number(o.scoreGlobal ?? 0)
    const nScore = n.errorMessage ? null : Number(n.scoreGlobal ?? 0)
    const delta = (nScore ?? 0) - (oScore ?? 0)
    rows.push({
      courseId: cid,
      shortname: n.shortname || o.shortname,
      fullname: n.fullname || o.fullname,
      olderScore: oScore,
      newerScore: nScore,
      delta,
    })
    if (oScore !== null && nScore !== null) {
      sumOlder += oScore
      sumNewer += nScore
      cnt++
      if (delta > 0) improved++
      else if (delta < 0) degraded++
      else stable++
    }
  }
  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))

  return {
    rows,
    onlyOlder,
    onlyNewer,
    avgOlder: cnt > 0 ? Math.round(sumOlder / cnt) : 0,
    avgNewer: cnt > 0 ? Math.round(sumNewer / cnt) : 0,
    avgDelta: cnt > 0 ? Math.round((sumNewer - sumOlder) / cnt) : 0,
    improved,
    degraded,
    stable,
  }
}

function MiniStat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{ padding: '8px 10px', background: 'var(--surface2)', borderRadius: 6 }}>
      <div style={{ fontSize: 20, fontWeight: 700, color: color ?? 'var(--brand)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4, textTransform: 'uppercase' }}>{label}</div>
    </div>
  )
}

function ScoreCell({ v }: { v: number | null }) {
  if (v === null) return <span style={{ color: 'var(--text3)', fontSize: 11 }}>échec</span>
  const cls = v >= 75 ? 'high' : v >= 50 ? 'mid' : 'low'
  return <div className={`score-circle ${cls}`}>{v}</div>
}
