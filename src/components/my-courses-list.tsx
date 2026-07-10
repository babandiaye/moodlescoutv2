'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  MagnifyingGlassIcon,
  BuildingLibraryIcon,
  UserIcon,
  FunnelIcon,
  ListBulletIcon,
  Squares2X2Icon,
  BookOpenIcon,
  EllipsisVerticalIcon,
  CalendarIcon,
  ArrowTopRightOnSquareIcon,
  PlayIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'
import { hueForPlatform } from '@/lib/platform-hue'

export type PlatformOption = { id: string; name: string }

export type CourseRow = {
  key: string
  courseId: number
  shortname: string
  fullname: string
  visible: boolean
  categoryName: string | null
  timecreated: number | null
  role: 'enseignant' | 'tuteur' | 'autre'
  platform: { id: string; name: string; url: string }
  auditsCount: number
  lastAuditAt: string | null
  moodleHref: string
  auditHref: string
}

type Props = {
  initial: CourseRow[]
  platforms: PlatformOption[]
  canLaunch: boolean
}

type RoleFilter = 'all' | 'enseignant' | 'tuteur'
type StatusFilter = 'all' | 'visible' | 'hidden'
type ViewMode = 'list' | 'grid'

/**
 * Liste unifiée des cours de l'utilisateur, tous plateformes confondues.
 * Filtres locaux (les données arrivent déjà chargées) + pagination client.
 */
export function MyCoursesList({ initial, platforms, canLaunch }: Props) {
  const [search, setSearch] = useState('')
  const [platformFilter, setPlatformFilter] = useState<string>('all')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [view, setView] = useState<ViewMode>('list')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return initial.filter(r => {
      if (platformFilter !== 'all' && r.platform.id !== platformFilter) return false
      if (roleFilter !== 'all' && r.role !== roleFilter) return false
      if (statusFilter === 'visible' && !r.visible) return false
      if (statusFilter === 'hidden' && r.visible) return false
      if (!q) return true
      return (
        r.shortname.toLowerCase().includes(q) ||
        r.fullname.toLowerCase().includes(q) ||
        (r.categoryName?.toLowerCase().includes(q) ?? false) ||
        r.platform.name.toLowerCase().includes(q)
      )
    })
  }, [initial, search, platformFilter, roleFilter, statusFilter])

  const total = filtered.length
  const start = (page - 1) * pageSize
  const paged = filtered.slice(start, start + pageSize)

  // Si les filtres réduisent la liste sous la page courante, on revient à la 1re
  const effectivePage = paged.length === 0 && page > 1 ? 1 : page
  if (effectivePage !== page) setPage(effectivePage)

  const activeFilterCount =
    (platformFilter !== 'all' ? 1 : 0) +
    (roleFilter !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (search.trim() ? 1 : 0)

  return (
    <>
      {/* Barre de filtres */}
      <div className="filter-bar" style={{ marginBottom: 20 }}>
        <div className="search-input">
          <MagnifyingGlassIcon />
          <input
            type="search"
            placeholder="Rechercher un cours…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>

        <div style={{ position: 'relative' }}>
          <BuildingLibraryIcon
            style={{ width: 14, height: 14, position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }}
          />
          <select
            value={platformFilter}
            onChange={e => { setPlatformFilter(e.target.value); setPage(1) }}
            style={{ paddingLeft: 34, minWidth: 190 }}
          >
            <option value="all">Toutes les plateformes</option>
            {platforms.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div style={{ position: 'relative' }}>
          <UserIcon
            style={{ width: 14, height: 14, position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }}
          />
          <select
            value={roleFilter}
            onChange={e => { setRoleFilter(e.target.value as RoleFilter); setPage(1) }}
            style={{ paddingLeft: 34, minWidth: 160 }}
          >
            <option value="all">Tous les rôles</option>
            <option value="enseignant">Enseignant</option>
            <option value="tuteur">Tuteur</option>
          </select>
        </div>

        <div style={{ position: 'relative' }}>
          <FunnelIcon
            style={{ width: 14, height: 14, position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none' }}
          />
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value as StatusFilter); setPage(1) }}
            style={{ paddingLeft: 34, minWidth: 160 }}
          >
            <option value="all">Tous les statuts</option>
            <option value="visible">Visible</option>
            <option value="hidden">Caché</option>
          </select>
        </div>

        <div className="view-toggle" role="group" aria-label="Basculer vue">
          <button
            type="button"
            className={`view-toggle-btn ${view === 'list' ? 'active' : ''}`}
            onClick={() => setView('list')}
            aria-label="Vue liste"
            aria-pressed={view === 'list'}
          >
            <ListBulletIcon />
          </button>
          <button
            type="button"
            className={`view-toggle-btn ${view === 'grid' ? 'active' : ''}`}
            onClick={() => setView('grid')}
            aria-label="Vue grille"
            aria-pressed={view === 'grid'}
          >
            <Squares2X2Icon />
          </button>
        </div>
      </div>

      {/* Liste */}
      {total === 0 ? (
        <div className="card">
          <div className="empty-state">
            {activeFilterCount > 0 ? (
              <>Aucun cours ne correspond aux filtres.</>
            ) : (
              <>Vous n&apos;êtes enseignant ou tuteur d&apos;aucun cours sur les plateformes actives.</>
            )}
          </div>
        </div>
      ) : view === 'list' ? (
        <div className="courses-list">
          {paged.map(r => <CourseListCard key={r.key} r={r} canLaunch={canLaunch} />)}
        </div>
      ) : (
        <div className="courses-grid">
          {paged.map(r => <CourseGridCard key={r.key} r={r} canLaunch={canLaunch} />)}
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div style={{ marginTop: 20 }}>
          <PaginationClient
            page={page}
            pageSize={pageSize}
            total={total}
            onPage={setPage}
            onPageSize={n => { setPageSize(n); setPage(1) }}
          />
        </div>
      )}
    </>
  )
}

// ─── Carte cours (vue liste) ───────────────────────────────────

function CourseListCard({ r, canLaunch }: { r: CourseRow; canLaunch: boolean }) {
  const hue = hueForPlatform(r.platform.name)
  return (
    <article className={`course-card ${r.visible ? '' : 'is-hidden'}`}>
      <div className={`course-card-icon hue-${hue}`}><BookOpenIcon /></div>

      <div className="course-card-body">
        <div className="course-card-title-row">
          <span className="course-card-name">{r.fullname}</span>
          <span className={`course-card-platform hue-${hue}`}>{r.platform.name}</span>
          <button type="button" className="course-card-menu" aria-label="Actions" title="Actions">
            <EllipsisVerticalIcon />
          </button>
        </div>

        <div className="course-card-cols">
          <div className="course-col">
            <span className="course-col-label">Catégorie</span>
            <span className="course-col-value">{r.categoryName ?? '—'}</span>
          </div>
          <div className="course-col">
            <span className="course-col-label">Code</span>
            <span className="course-col-value mono">{r.shortname}</span>
          </div>
          <div className="course-col">
            <span className="course-col-label">UE / Cours</span>
            <span className="course-col-value">{r.fullname}</span>
          </div>
        </div>

        <div className="course-card-meta">
          <span className="course-meta-item">
            <UserIcon width={12} height={12} /> Rôle&nbsp;: <RolePill role={r.role} />
          </span>
          <span className="course-meta-item">
            <CalendarIcon width={12} height={12} /> Créé le {fmtDate(r.timecreated)}
          </span>
        </div>
      </div>

      <div className="course-card-side">
        <div className="course-side-metric">
          <span className="course-side-label">Audits</span>
          <span className={`course-side-num ${r.auditsCount === 0 ? 'na' : ''}`}>{r.auditsCount}</span>
        </div>
        <div className="course-side-metric">
          <span className="course-side-label">Dernier audit</span>
          <span className="course-side-last">
            {r.lastAuditAt ? (
              <>
                <CheckCircleIcon width={12} height={12} style={{ color: 'var(--success)' }} />
                {' '}
                {fmtDateTime(r.lastAuditAt)}
              </>
            ) : '—'}
          </span>
        </div>
        <div className="course-side-metric">
          <span className="course-side-label">Statut</span>
          <span className={`course-status-pill ${r.visible ? 'visible' : 'hidden'}`}>
            {r.visible ? 'Visible' : 'Caché'}
          </span>
        </div>
      </div>

      <div className="course-card-actions">
        <a href={r.moodleHref} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
          <ArrowTopRightOnSquareIcon width={14} height={14} /> Voir le cours
        </a>
        {canLaunch && (
          <Link href={r.auditHref} className="btn btn-primary btn-sm">
            <PlayIcon width={14} height={14} /> Auditer ce cours
          </Link>
        )}
      </div>
    </article>
  )
}

// ─── Carte cours (vue grille) ──────────────────────────────────

function CourseGridCard({ r, canLaunch }: { r: CourseRow; canLaunch: boolean }) {
  const hue = hueForPlatform(r.platform.name)
  return (
    <article className={`course-tile ${r.visible ? '' : 'is-hidden'}`}>
      <div className="course-tile-head">
        <div className={`course-card-icon hue-${hue}`}><BookOpenIcon /></div>
        <span className={`course-card-platform hue-${hue}`}>{r.platform.name}</span>
        <button type="button" className="course-card-menu" aria-label="Actions">
          <EllipsisVerticalIcon />
        </button>
      </div>
      <div className="course-tile-title">{r.fullname}</div>
      <div className="course-tile-code mono">{r.shortname}</div>
      <div className="course-tile-meta">
        <span><UserIcon width={11} height={11} /> <RolePill role={r.role} /></span>
        <span className={`course-status-pill ${r.visible ? 'visible' : 'hidden'}`}>
          {r.visible ? 'Visible' : 'Caché'}
        </span>
      </div>
      <div className="course-tile-metrics">
        <div>
          <span className="course-side-label">Audits</span>
          <span className={`course-side-num ${r.auditsCount === 0 ? 'na' : ''}`}>{r.auditsCount}</span>
        </div>
        <div>
          <span className="course-side-label">Dernier</span>
          <span className="course-side-last">
            {r.lastAuditAt ? fmtDate(new Date(r.lastAuditAt).getTime() / 1000) : '—'}
          </span>
        </div>
      </div>
      <div className="course-tile-actions">
        <a href={r.moodleHref} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
          <ArrowTopRightOnSquareIcon width={12} height={12} /> Voir
        </a>
        {canLaunch && (
          <Link href={r.auditHref} className="btn btn-primary btn-sm">
            <PlayIcon width={12} height={12} /> Auditer
          </Link>
        )}
      </div>
    </article>
  )
}

// ─── Sous-composants ───────────────────────────────────────────

function RolePill({ role }: { role: CourseRow['role'] }) {
  const label = role === 'enseignant' ? 'Enseignant' : role === 'tuteur' ? 'Tuteur' : 'Autre'
  return <span className={`role-mini ${role}`}>{label}</span>
}

function PaginationClient({
  page, pageSize, total, onPage, onPageSize,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (p: number) => void
  onPageSize: (n: number) => void
}) {
  const nbPages = Math.max(1, Math.ceil(total / pageSize))
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  return (
    <div
      style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '16px 20px', borderTop: '1px solid var(--border)',
        flexWrap: 'wrap', gap: 12, background: 'var(--surface)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--text2)' }}>
        {start}–{end} sur {total} cours
      </div>
      <div className="pagination-nav">
        <button
          type="button"
          className="pag-btn"
          disabled={page === 1}
          onClick={() => onPage(page - 1)}
        >
          ‹ Précédent
        </button>
        {pageNumbers(page, nbPages).map((n, i) =>
          n === '…' ? (
            <span key={`e${i}`} className="pag-ellipsis">…</span>
          ) : (
            <button
              key={n}
              type="button"
              className={`pag-btn ${n === page ? 'active' : ''}`}
              onClick={() => onPage(n)}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          className="pag-btn"
          disabled={page >= nbPages}
          onClick={() => onPage(page + 1)}
        >
          Suivant ›
        </button>
      </div>
      <select
        value={pageSize}
        onChange={e => onPageSize(Number(e.target.value))}
        style={{
          padding: '6px 8px', border: '1px solid var(--border2)',
          borderRadius: 8, fontSize: 12, cursor: 'pointer',
          background: 'var(--surface)', color: 'var(--text)',
        }}
      >
        {[10, 25, 50].map(n => <option key={n} value={n}>{n} par page</option>)}
      </select>
    </div>
  )
}

function pageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const out: (number | '…')[] = [1]
  if (current > 3) out.push('…')
  const from = Math.max(2, current - 1)
  const to = Math.min(total - 1, current + 1)
  for (let n = from; n <= to; n++) out.push(n)
  if (current < total - 2) out.push('…')
  out.push(total)
  return out
}

// ─── Helpers ───────────────────────────────────────────────────

function fmtDate(unix: number | null): string {
  if (!unix) return '—'
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(new Date(unix * 1000))
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso)
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d)
}
