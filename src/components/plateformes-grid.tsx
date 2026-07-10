'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  MagnifyingGlassIcon,
  ArrowsUpDownIcon,
  Squares2X2Icon,
  ListBulletIcon,
  AcademicCapIcon,
  EllipsisVerticalIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline'
import { hueForPlatform, type PlatformHue } from '@/lib/platform-hue'

export type PlateformeCard = {
  id: string
  name: string
  url: string
  version: string
  isActive: boolean
  auditsCount: number
  successRate: number | null
}

type Props = {
  plateformes: PlateformeCard[]
}

type Sort = 'name' | 'audits-desc' | 'audits-asc' | 'success-desc' | 'success-asc'
type StatusFilter = 'all' | 'active' | 'inactive'
type ViewMode = 'grid' | 'list'

/**
 * Grille filtrable + triable des plateformes Moodle, avec toggle
 * grille/liste. Charge tout côté serveur puis filtre en local (côté client)
 * car la liste tient dans 100 éléments max.
 */
export function PlateformesGrid({ plateformes }: Props) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sort, setSort] = useState<Sort>('name')
  const [view, setView] = useState<ViewMode>('grid')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = plateformes.filter(p => {
      if (statusFilter === 'active' && !p.isActive) return false
      if (statusFilter === 'inactive' && p.isActive) return false
      if (!q) return true
      return (
        p.name.toLowerCase().includes(q) ||
        p.url.toLowerCase().includes(q)
      )
    })
    switch (sort) {
      case 'name':          list = [...list].sort((a, b) => a.name.localeCompare(b.name, 'fr')); break
      case 'audits-desc':   list = [...list].sort((a, b) => b.auditsCount - a.auditsCount); break
      case 'audits-asc':    list = [...list].sort((a, b) => a.auditsCount - b.auditsCount); break
      case 'success-desc':  list = [...list].sort((a, b) => (b.successRate ?? -1) - (a.successRate ?? -1)); break
      case 'success-asc':   list = [...list].sort((a, b) => (a.successRate ?? 101) - (b.successRate ?? 101)); break
    }
    return list
  }, [plateformes, search, statusFilter, sort])

  return (
    <>
      <div className="filter-bar">
        <div className="search-input">
          <MagnifyingGlassIcon />
          <input
            type="search"
            placeholder="Rechercher une plateforme…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as StatusFilter)}>
          <option value="all">Tous les statuts</option>
          <option value="active">Actives</option>
          <option value="inactive">Désactivées</option>
        </select>

        <div style={{ position: 'relative' }}>
          <select
            value={sort}
            onChange={e => setSort(e.target.value as Sort)}
            className="btn-sort"
            style={{ paddingLeft: 40, minWidth: 190 }}
          >
            <option value="name">Trier · Nom (A→Z)</option>
            <option value="audits-desc">Trier · Audits (↓)</option>
            <option value="audits-asc">Trier · Audits (↑)</option>
            <option value="success-desc">Trier · Réussite (↓)</option>
            <option value="success-asc">Trier · Réussite (↑)</option>
          </select>
          <ArrowsUpDownIcon
            style={{
              width: 14, height: 14, position: 'absolute', left: 14, top: '50%',
              transform: 'translateY(-50%)', color: 'var(--text3)', pointerEvents: 'none',
            }}
          />
        </div>

        <div className="view-toggle" role="group" aria-label="Basculer vue">
          <button
            type="button"
            className={`view-toggle-btn ${view === 'grid' ? 'active' : ''}`}
            onClick={() => setView('grid')}
            aria-label="Vue grille"
            aria-pressed={view === 'grid'}
          >
            <Squares2X2Icon />
          </button>
          <button
            type="button"
            className={`view-toggle-btn ${view === 'list' ? 'active' : ''}`}
            onClick={() => setView('list')}
            aria-label="Vue liste"
            aria-pressed={view === 'list'}
          >
            <ListBulletIcon />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            {search || statusFilter !== 'all' ? (
              <>Aucune plateforme ne correspond aux filtres.</>
            ) : (
              <>Aucune plateforme configurée.</>
            )}
          </div>
        </div>
      ) : view === 'grid' ? (
        <div className="plateformes-grid">
          {filtered.map(p => <PlateformeCardTile key={p.id} p={p} hue={hueForPlatform(p.name)} />)}
        </div>
      ) : (
        <div className="plateformes-list">
          {filtered.map(p => <PlateformeRowItem key={p.id} p={p} hue={hueForPlatform(p.name)} />)}
        </div>
      )}
    </>
  )
}

// ─── Sous-composants ─────────────────────────────────────────

function PlateformeCardTile({ p, hue }: { p: PlateformeCard; hue: PlatformHue }) {
  return (
    <div className={`plateforme-card ${p.isActive ? '' : 'inactive'}`}>
      <div className="plateforme-card-head">
        <div className={`plateforme-card-icon hue-${hue}`}>
          <AcademicCapIcon />
        </div>
        <div className="plateforme-card-title-row">
          <div className="plateforme-card-name">{p.name}</div>
          <span className="plateforme-card-version">Moodle {p.version}.x</span>
        </div>
        <button
          type="button"
          className="plateforme-card-menu"
          aria-label="Plus d'actions"
          title="Actions (à venir)"
        >
          <EllipsisVerticalIcon width={18} height={18} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="plateforme-card-url">{p.url}</div>
        <span className={`plateforme-card-status ${p.isActive ? 'active' : 'inactive'}`}>
          <span className="dot" /> {p.isActive ? 'Active' : 'Désactivée'}
        </span>
      </div>

      <div className="plateforme-card-footer">
        <div className="plateforme-card-metric">
          <span className={`plateforme-card-metric-num ${p.auditsCount === 0 ? 'na' : ''}`}>
            {p.auditsCount}
          </span>
          <span className="plateforme-card-metric-label">
            {p.auditsCount > 1 ? 'Audits' : 'Audit'}
          </span>
        </div>
        <div className="plateforme-card-metric">
          <span className={`plateforme-card-metric-num ${p.successRate === null ? 'na' : ''}`}>
            {p.successRate === null ? '—' : `${p.successRate.toFixed(0)}%`}
          </span>
          <span className="plateforme-card-metric-label">Taux de réussite</span>
        </div>
        <Link href={`/plateformes/${p.id}`} className="plateforme-card-explore">
          Explorer <ArrowRightIcon width={14} height={14} />
        </Link>
      </div>
    </div>
  )
}

function PlateformeRowItem({ p, hue }: { p: PlateformeCard; hue: PlatformHue }) {
  return (
    <div className="plateforme-row">
      <div className={`plateforme-card-icon hue-${hue}`}>
        <AcademicCapIcon />
      </div>
      <div className="plateforme-row-body">
        <div className="plateforme-row-title-row">
          <span className="plateforme-card-name">{p.name}</span>
          <span className="plateforme-card-version">Moodle {p.version}.x</span>
          <span className={`plateforme-card-status ${p.isActive ? 'active' : 'inactive'}`}>
            <span className="dot" /> {p.isActive ? 'Active' : 'Désactivée'}
          </span>
        </div>
        <span className="plateforme-card-url">{p.url}</span>
      </div>
      <div className="plateforme-row-metrics">
        <div className="plateforme-card-metric" style={{ textAlign: 'center' }}>
          <span className={`plateforme-card-metric-num ${p.auditsCount === 0 ? 'na' : ''}`}>
            {p.auditsCount}
          </span>
          <span className="plateforme-card-metric-label">Audits</span>
        </div>
        <div className="plateforme-card-metric" style={{ textAlign: 'center' }}>
          <span className={`plateforme-card-metric-num ${p.successRate === null ? 'na' : ''}`}>
            {p.successRate === null ? '—' : `${p.successRate.toFixed(0)}%`}
          </span>
          <span className="plateforme-card-metric-label">Taux</span>
        </div>
        <Link href={`/plateformes/${p.id}`} className="plateforme-card-explore">
          Explorer <ArrowRightIcon width={14} height={14} />
        </Link>
      </div>
    </div>
  )
}
