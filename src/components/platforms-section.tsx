'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ListBulletIcon,
  Squares2X2Icon,
  AcademicCapIcon,
  PlusIcon,
  PlayIcon,
  EyeIcon,
  EllipsisVerticalIcon,
  CheckIcon,
  XMarkIcon,
  TrashIcon,
  BuildingLibraryIcon,
  ArrowPathIcon,
  ArrowRightIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { hueForPlatform, type PlatformHue } from '@/lib/platform-hue'

type Platform = {
  id: string
  name: string
  url: string
  version: string
  isActive: boolean
  createdAt: Date | string
  nbAudits: number
  nbCoursesAudited: number
}

type Stats = {
  url: string
  sitename: string | null
  release: string | null
  version: string | null
  nbUsers: number | null
  usersBreakdown: Record<string, number> | null
  usersBreakdownPartial: boolean
  usersError: string | null
  usersMethod: 'auth-list' | 'enrolment'
  usersNbCoursesScanned: number | null
  tokenUsername: string | null
  tokenIsAdmin: boolean
  hasGetUsersFunction: boolean
  computedAt: string
  durationMs: number
  cached: boolean
}

type StatusFilter = 'all' | 'active' | 'inactive'
type VersionFilter = 'all' | '4' | '5'
type ViewMode = 'list' | 'grid'
type TestState = 'loading' | { ok: true; sitename?: string; release?: string; latencyMs: number } | { ok: false; error: string }
type StatsState = 'loading' | { error: string } | Stats

type Props = { initial: Platform[] }

export function PlatformsSection({ initial }: Props) {
  const router = useRouter()
  const [platforms, setPlatforms] = useState<Platform[]>(initial)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [versionFilter, setVersionFilter] = useState<VersionFilter>('all')
  const [view, setView] = useState<ViewMode>('list')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [testing, setTesting] = useState<Record<string, TestState>>({})
  const [stats, setStats] = useState<Record<string, StatsState | undefined>>({})
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => { setPage(1) }, [search, statusFilter, versionFilter, pageSize])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return platforms.filter(p => {
      if (statusFilter === 'active' && !p.isActive) return false
      if (statusFilter === 'inactive' && p.isActive) return false
      if (versionFilter !== 'all' && p.version !== versionFilter) return false
      if (!q) return true
      return p.name.toLowerCase().includes(q) || p.url.toLowerCase().includes(q)
    })
  }, [platforms, search, statusFilter, versionFilter])

  const total = filtered.length
  const nbPages = Math.max(1, Math.ceil(total / pageSize))
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize)

  const activeFilterCount =
    (statusFilter !== 'all' ? 1 : 0) +
    (versionFilter !== 'all' ? 1 : 0) +
    (search.trim() ? 1 : 0)

  const pagedIds = paged.map(p => p.id)
  const allPagedSelected = pagedIds.length > 0 && pagedIds.every(id => selected.has(id))
  const somePagedSelected = pagedIds.some(id => selected.has(id))

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const togglePage = () => {
    setSelected(prev => {
      const next = new Set(prev)
      if (allPagedSelected) pagedIds.forEach(id => next.delete(id))
      else pagedIds.forEach(id => next.add(id))
      return next
    })
  }

  const clearMessages = () => { setError(null); setSuccess(null) }

  const handleToggleActive = async (p: Platform) => {
    clearMessages()
    const newVal = !p.isActive
    try {
      const res = await fetch(`/api/moodle-platforms/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newVal }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setPlatforms(ps => ps.map(x => x.id === p.id ? { ...x, isActive: newVal } : x))
      setSuccess(`« ${p.name} » ${newVal ? 'activée' : 'désactivée'}`)
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleBulkToggle = async (isActive: boolean) => {
    clearMessages()
    const ids = Array.from(selected)
    if (ids.length === 0) return
    if (!confirm(`${isActive ? 'Activer' : 'Désactiver'} ${ids.length} plateforme(s) sélectionnée(s) ?`)) return
    setBulkBusy(true)
    try {
      const res = await fetch('/api/moodle-platforms/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, isActive }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setPlatforms(ps => ps.map(x => selected.has(x.id) ? { ...x, isActive } : x))
      setSelected(new Set())
      setSuccess(`${data.updated ?? ids.length} plateforme(s) ${isActive ? 'activée(s)' : 'désactivée(s)'}`)
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBulkBusy(false)
    }
  }

  const handleClearCache = async (p: Platform) => {
    if (!confirm(`Vider le cache Redis des appels WS pour « ${p.name} » ?`)) return
    clearMessages()
    try {
      const res = await fetch(`/api/moodle-platforms/${p.id}/cache`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setSuccess(`Cache WS de « ${p.name} » vidé (${data.deleted ?? 0} clés)`)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleTest = async (id: string) => {
    setTesting(t => ({ ...t, [id]: 'loading' }))
    try {
      const res = await fetch(`/api/moodle-platforms/${id}/test`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setTesting(t => ({ ...t, [id]: { ok: false, error: data.error ?? `HTTP ${res.status}` } }))
        return
      }
      setTesting(t => ({ ...t, [id]: data }))
    } catch (err) {
      setTesting(t => ({ ...t, [id]: { ok: false, error: (err as Error).message } }))
    }
  }

  const handleStats = async (id: string, refresh = false) => {
    setStats(s => ({ ...s, [id]: 'loading' }))
    try {
      const res = await fetch(`/api/moodle-platforms/${id}/stats${refresh ? '?refresh=1' : ''}`)
      const data = await res.json()
      if (!res.ok) {
        setStats(s => ({ ...s, [id]: { error: data.error ?? `HTTP ${res.status}` } }))
        return
      }
      setStats(s => ({ ...s, [id]: data }))
    } catch (err) {
      setStats(s => ({ ...s, [id]: { error: (err as Error).message } }))
    }
  }

  const handleDelete = async (p: Platform) => {
    if (!confirm(`Supprimer la plateforme « ${p.name} » ? Cette action est irréversible.`)) return
    clearMessages()
    try {
      const res = await fetch(`/api/moodle-platforms/${p.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setPlatforms(ps => ps.filter(x => x.id !== p.id))
      setSuccess(`Plateforme « ${p.name} » supprimée`)
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleCreated = (p: Platform) => {
    setPlatforms(ps => [p, ...ps])
    setShowAddModal(false)
    setSuccess(`Plateforme « ${p.name} » ajoutée`)
    router.refresh()
  }

  return (
    <>
      {/* CTA + filter bar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button type="button" className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          <PlusIcon width={16} height={16} /> Ajouter une plateforme
        </button>
      </div>

      {/* Filter bar */}
      <div className="filter-bar" style={{ marginBottom: 12 }}>
        <div className="search-input">
          <MagnifyingGlassIcon />
          <input
            type="search"
            placeholder="Rechercher une plateforme…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)} style={{ minWidth: 160 }}>
          <option value="all">Tous les statuts</option>
          <option value="active">Actives</option>
          <option value="inactive">Désactivées</option>
        </select>

        <select value={versionFilter} onChange={e => setVersionFilter(e.target.value as VersionFilter)} style={{ minWidth: 160 }}>
          <option value="all">Toutes versions</option>
          <option value="4">Moodle 4.x</option>
          <option value="5">Moodle 5.x</option>
        </select>

        {activeFilterCount > 0 && (
          <button
            type="button"
            className="btn btn-secondary"
            style={{ padding: '8px 12px', fontSize: 12 }}
            onClick={() => { setSearch(''); setStatusFilter('all'); setVersionFilter('all') }}
          >
            <FunnelIcon width={14} height={14} /> Réinitialiser
          </button>
        )}

        <div className="view-toggle" role="group" aria-label="Basculer vue">
          <button type="button" className={`view-toggle-btn ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')} aria-label="Vue liste" aria-pressed={view === 'list'}>
            <ListBulletIcon />
          </button>
          <button type="button" className={`view-toggle-btn ${view === 'grid' ? 'active' : ''}`} onClick={() => setView('grid')} aria-label="Vue grille" aria-pressed={view === 'grid'}>
            <Squares2X2Icon />
          </button>
        </div>
      </div>

      {/* Banners */}
      {error && (
        <div className="error-banner" style={{ marginBottom: 12 }}>
          <ExclamationTriangleIcon width={14} height={14} style={{ marginRight: 6 }} /> {error}
        </div>
      )}
      {success && <div className="success-banner" style={{ marginBottom: 12 }}>{success}</div>}

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="bulk-bar">
          <label className="bulk-check">
            <input
              type="checkbox"
              checked={allPagedSelected}
              ref={el => { if (el) el.indeterminate = !allPagedSelected && somePagedSelected }}
              onChange={togglePage}
            />
            <span>{selected.size} sélectionnée(s)</span>
          </label>
          <div className="bulk-actions">
            <button type="button" className="btn btn-success btn-sm" disabled={bulkBusy} onClick={() => handleBulkToggle(true)}>
              <CheckIcon width={12} height={12} /> Activer
            </button>
            <button type="button" className="btn btn-danger btn-sm" disabled={bulkBusy} onClick={() => handleBulkToggle(false)}>
              <XMarkIcon width={12} height={12} /> Désactiver
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelected(new Set())} disabled={bulkBusy}>
              Réinitialiser
            </button>
          </div>
        </div>
      )}

      {/* Count line */}
      <div style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 4px 12px' }}>
        {total} configuration{total > 1 ? 's' : ''}
      </div>

      {/* List / grid */}
      {total === 0 ? (
        <div className="card">
          <div className="empty-state">
            {activeFilterCount > 0 ? (
              <>Aucune plateforme ne correspond aux filtres.</>
            ) : (
              <>Aucune plateforme configurée. Cliquez sur <strong>Ajouter une plateforme</strong>.</>
            )}
          </div>
        </div>
      ) : view === 'list' ? (
        <div className="platform-list-v2">
          {paged.map(p => (
            <PlatformListRow
              key={p.id}
              p={p}
              selected={selected.has(p.id)}
              onToggleSelect={() => toggleOne(p.id)}
              testing={testing[p.id]}
              onTest={() => handleTest(p.id)}
              statsState={stats[p.id]}
              onStats={() => handleStats(p.id)}
              onStatsRefresh={() => handleStats(p.id, true)}
              onToggleActive={() => handleToggleActive(p)}
              onClearCache={() => handleClearCache(p)}
              onDelete={() => handleDelete(p)}
              menuOpen={openMenu === p.id}
              onMenuToggle={() => setOpenMenu(m => m === p.id ? null : p.id)}
              onMenuClose={() => setOpenMenu(null)}
            />
          ))}
        </div>
      ) : (
        <div className="platform-grid-v2">
          {paged.map(p => (
            <PlatformGridCard
              key={p.id}
              p={p}
              testing={testing[p.id]}
              onTest={() => handleTest(p.id)}
              onStats={() => handleStats(p.id)}
              onToggleActive={() => handleToggleActive(p)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="platform-pagination">
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            {total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} sur {total} configuration{total > 1 ? 's' : ''}
          </div>
          <div className="pagination-nav">
            <button type="button" className="pag-btn" disabled={page === 1} onClick={() => setPage(page - 1)}>‹</button>
            {pageNumbers(page, nbPages).map((n, i) =>
              n === '…' ? (
                <span key={`e${i}`} className="pag-ellipsis">…</span>
              ) : (
                <button key={n} type="button" className={`pag-btn ${n === page ? 'active' : ''}`} onClick={() => setPage(n)}>{n}</button>
              ),
            )}
            <button type="button" className="pag-btn" disabled={page >= nbPages} onClick={() => setPage(page + 1)}>›</button>
          </div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' }}>
            <span>Par page</span>
            <select
              value={pageSize}
              onChange={e => setPageSize(Number(e.target.value))}
              style={{ padding: '4px 8px', border: '1px solid var(--border2)', borderRadius: 6, fontSize: 12 }}
            >
              {[5, 10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Add modal */}
      {showAddModal && (
        <AddPlatformModal
          onClose={() => setShowAddModal(false)}
          onCreated={handleCreated}
        />
      )}
    </>
  )
}

// ─── Ligne plateforme (vue liste) ──────────────────────────────

function PlatformListRow({
  p, selected, onToggleSelect, testing, onTest, statsState, onStats, onStatsRefresh,
  onToggleActive, onClearCache, onDelete, menuOpen, onMenuToggle, onMenuClose,
}: {
  p: Platform
  selected: boolean
  onToggleSelect: () => void
  testing?: TestState
  onTest: () => void
  statsState?: StatsState
  onStats: () => void
  onStatsRefresh: () => void
  onToggleActive: () => void
  onClearCache: () => void
  onDelete: () => void
  menuOpen: boolean
  onMenuToggle: () => void
  onMenuClose: () => void
}) {
  const hue: PlatformHue = hueForPlatform(p.name)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onMenuClose()
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [menuOpen, onMenuClose])

  const isStatsLoading = statsState === 'loading'
  const statsObj = statsState && statsState !== 'loading' && !('error' in statsState) ? statsState : null
  const statsErr = statsState && statsState !== 'loading' && 'error' in statsState ? statsState.error : null
  const t = testing && testing !== 'loading' ? testing : null

  return (
    <div className={`platform-row-v2 ${p.isActive ? '' : 'is-inactive'}`}>
      <div className="platform-row-main">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Sélectionner ${p.name}`}
          className="platform-row-check"
        />

        <div className={`platform-row-icon hue-${hue}`}>
          <AcademicCapIcon />
        </div>

        <div className="platform-row-name-block">
          <div className="platform-row-name-row">
            <span className="platform-row-name">{p.name}</span>
            <span className={`platform-row-code hue-${hue}`}>{p.name}</span>
          </div>
          <div className="platform-row-url mono">{p.url}</div>
        </div>

        <div className="platform-row-col">
          <span className="platform-row-col-value">Moodle {p.version}.x</span>
          <span className="platform-row-col-label">Plateforme</span>
        </div>

        <div className="platform-row-col">
          <span className="platform-row-col-value">
            {p.nbAudits} audit{p.nbAudits > 1 ? 's' : ''}
          </span>
          <span className="platform-row-col-label">{p.nbCoursesAudited} cours audités</span>
        </div>

        <div className="platform-row-status-block">
          <span className={`platform-status-pill ${p.isActive ? 'active' : 'disabled'}`}>
            <span className="dot" /> {p.isActive ? 'Actif' : 'Désactivé'}
          </span>
          <span className="platform-row-since">Depuis {formatDate(p.createdAt)}</span>
        </div>

        <div className="platform-row-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onTest} disabled={testing === 'loading'}>
            <PlayIcon width={12} height={12} /> {testing === 'loading' ? '…' : 'Tester'}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onStats} disabled={isStatsLoading}>
            <EyeIcon width={12} height={12} /> {isStatsLoading ? '…' : 'Détails'}
          </button>
          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="icon-menu-btn"
              onClick={onMenuToggle}
              aria-label="Plus d'actions"
              aria-expanded={menuOpen}
            >
              <EllipsisVerticalIcon width={18} height={18} />
            </button>
            {menuOpen && (
              <div className="platform-menu-dropdown">
                <Link href={`/plateformes/${p.id}`} className="platform-menu-item">
                  <ArrowRightIcon width={14} height={14} /> Explorer
                </Link>
                <button type="button" className="platform-menu-item" onClick={() => { onClearCache(); onMenuClose() }}>
                  <ArrowPathIcon width={14} height={14} /> Vider cache
                </button>
                <button type="button" className="platform-menu-item" onClick={() => { onToggleActive(); onMenuClose() }}>
                  {p.isActive ? (
                    <><XMarkIcon width={14} height={14} /> Désactiver</>
                  ) : (
                    <><CheckIcon width={14} height={14} /> Activer</>
                  )}
                </button>
                <button type="button" className="platform-menu-item danger" onClick={() => { onDelete(); onMenuClose() }}>
                  <TrashIcon width={14} height={14} /> Supprimer
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Test result banner */}
      {t && (
        <div className={`platform-row-test-result ${t.ok ? 'ok' : 'ko'}`}>
          {t.ok ? (
            <><CheckIcon width={13} height={13} /> {t.sitename || 'OK'} {t.release ? `(${t.release})` : ''} · {t.latencyMs}ms</>
          ) : (
            <><XMarkIcon width={13} height={13} /> {String(t.error).slice(0, 180)}</>
          )}
        </div>
      )}

      {/* Stats panel */}
      {(isStatsLoading || statsErr || statsObj) && (
        <div className="platform-row-stats">
          {isStatsLoading && <div style={{ fontSize: 12, color: 'var(--text2)' }}>⏳ Récupération…</div>}
          {statsErr && (
            <div style={{ fontSize: 12, color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <XMarkIcon width={13} height={13} /> {statsErr}
            </div>
          )}
          {statsObj && (
            <>
              <div className="platform-stats-grid">
                <StatChip label="Site" value={statsObj.sitename ?? '—'} />
                <StatChip label="Version" value={statsObj.release?.split(' ')[0] ?? '—'} hint={statsObj.release ?? undefined} />
                <StatChip
                  label="Utilisateurs"
                  value={statsObj.nbUsers !== null ? statsObj.nbUsers.toLocaleString('fr-FR') : 'n/a'}
                  variant={statsObj.nbUsers === null ? 'warn' : undefined}
                />
                <StatChip
                  label="Compte du token"
                  value={statsObj.tokenUsername ?? '—'}
                  hint={statsObj.tokenIsAdmin ? 'admin Moodle' : 'non-admin'}
                  mono
                />
              </div>
              <div className="platform-stats-footer">
                <span>
                  {new Date(statsObj.computedAt).toLocaleString('fr-FR')} · {Math.round(statsObj.durationMs)}ms
                  {statsObj.cached ? ' · cache' : ''}
                </span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={onStatsRefresh}>
                  <ArrowPathIcon width={11} height={11} /> Recalculer
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Carte plateforme (vue grille) ─────────────────────────────

function PlatformGridCard({
  p, testing, onTest, onStats, onToggleActive,
}: {
  p: Platform
  testing?: TestState
  onTest: () => void
  onStats: () => void
  onToggleActive: () => void
}) {
  const hue = hueForPlatform(p.name)
  return (
    <div className={`platform-tile ${p.isActive ? '' : 'is-inactive'}`}>
      <div className="platform-tile-head">
        <div className={`platform-row-icon hue-${hue}`}><AcademicCapIcon /></div>
        <div className="platform-tile-name-block">
          <div className="platform-row-name">{p.name}</div>
          <div className="platform-row-url mono">{p.url}</div>
        </div>
      </div>
      <div className="platform-tile-meta">
        <span>Moodle {p.version}.x</span>
        <span className={`course-status-pill ${p.isActive ? 'visible' : 'hidden'}`}>
          <span className="dot" /> {p.isActive ? 'Actif' : 'Désactivé'}
        </span>
      </div>
      <div className="platform-tile-metrics">
        <div><span className="course-side-label">Audits</span><span className="course-side-num">{p.nbAudits}</span></div>
        <div><span className="course-side-label">Cours audités</span><span className="course-side-num">{p.nbCoursesAudited}</span></div>
      </div>
      <div className="platform-tile-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onTest} disabled={testing === 'loading'}>
          <PlayIcon width={12} height={12} /> Tester
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onStats}>
          <EyeIcon width={12} height={12} /> Détails
        </button>
        <button type="button" className={`btn btn-sm ${p.isActive ? 'btn-secondary' : 'btn-success'}`} onClick={onToggleActive}>
          {p.isActive ? 'Désactiver' : 'Activer'}
        </button>
      </div>
    </div>
  )
}

// ─── Modal ajouter ─────────────────────────────────────────────

function AddPlatformModal({
  onClose, onCreated,
}: {
  onClose: () => void
  onCreated: (p: Platform) => void
}) {
  const [form, setForm] = useState({ name: '', url: '', token: '', version: '4' })
  const [showToken, setShowToken] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErr(null)
    if (!form.name || !form.url || !form.token) { setErr('Nom, URL et token sont requis'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/moodle-platforms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      onCreated({ ...data.platform, nbAudits: 0, nbCoursesAudited: 0 })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <div className="modal-card-header">
          <h3 className="modal-card-title">
            <BuildingLibraryIcon width={18} height={18} /> Ajouter une plateforme Moodle
          </h3>
          <button type="button" className="modal-card-close" onClick={onClose} aria-label="Fermer">
            <XMarkIcon width={18} height={18} />
          </button>
        </div>

        <form onSubmit={submit}>
          {err && (
            <div className="error-banner" style={{ marginBottom: 12 }}>
              <ExclamationTriangleIcon width={14} height={14} style={{ marginRight: 6 }} /> {err}
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Nom affiché</label>
            <input type="text" placeholder="P13 SEJA" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>

          <div className="form-group">
            <label className="form-label">URL Moodle</label>
            <input type="url" placeholder="https://moodle.unchk.edu.sn" value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} />
          </div>

          <div className="form-group">
            <label className="form-label">Token Web Services</label>
            <div className="input-row">
              <input
                type={showToken ? 'text' : 'password'}
                placeholder="Token Moodle Web Services"
                value={form.token}
                onChange={e => setForm(f => ({ ...f, token: e.target.value }))}
              />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowToken(s => !s)}>
                {showToken ? 'Masquer' : 'Afficher'}
              </button>
            </div>
            <span className="form-hint">
              Moodle → Admin → Plugins → Web Services → Gérer les tokens. Le token est chiffré (AES-256-GCM) avant stockage.
            </span>
          </div>

          <div className="form-group">
            <label className="form-label">Version Moodle</label>
            <div className="version-toggle">
              {['4', '5'].map(v => (
                <button
                  type="button"
                  key={v}
                  className={`version-btn ${form.version === v ? 'active' : ''}`}
                  onClick={() => setForm(f => ({ ...f, version: v }))}
                >
                  Moodle {v}.x
                </button>
              ))}
            </div>
          </div>

          <div className="modal-card-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Validation…' : 'Ajouter la plateforme'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Sous-composants ───────────────────────────────────────────

function StatChip({
  label, value, hint, mono, variant,
}: {
  label: string
  value: string
  hint?: string
  mono?: boolean
  variant?: 'warn'
}) {
  return (
    <div className="platform-stat-chip" title={hint}>
      <span className="platform-stat-chip-label">{label}</span>
      <span
        className="platform-stat-chip-value"
        style={{ fontFamily: mono ? 'var(--mono)' : undefined, color: variant === 'warn' ? 'var(--warn)' : undefined }}
      >
        {value}
      </span>
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

function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
}
