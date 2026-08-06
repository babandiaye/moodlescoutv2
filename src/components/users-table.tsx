'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ListBulletIcon,
  Squares2X2Icon,
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EllipsisVerticalIcon,
  XMarkIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import type { UserRole } from '@prisma/client'
import { hueForPlatform } from '@/lib/platform-hue'

export type UserRow = {
  id: string
  email: string
  preferredUsername: string
  fullName: string | null
  direction: string | null
  role: UserRole
  isActive: boolean
  createdAt: string
  lastLogin: string | null
  auditsCount: number
}

type Props = {
  initial: UserRow[]
  currentUserId: string
}

type RoleFilter = 'all' | UserRole
type StatusFilter = 'all' | 'active' | 'inactive'
type ViewMode = 'list' | 'grid'

const PAGE_SIZES = [10, 25, 50] as const

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  enseignant: 'Enseignant',
  lecteur: 'Lecteur',
}

/**
 * Table utilisateurs avec :
 *  - Recherche par nom / email / direction
 *  - Filtres par rôle et par statut (dans le panneau "Filtres")
 *  - Toggle vue liste (défaut) / grille de cards
 *  - Modal "Voir détails" pour éditer rôle + statut
 *  - Bouton "Réactiver" direct pour les désactivés (raccourci)
 */
export function UsersTable({ initial, currentUserId }: Props) {
  const router = useRouter()
  const [users, setUsers] = useState<UserRow[]>(initial)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [showFilters, setShowFilters] = useState(false)
  const [view, setView] = useState<ViewMode>('list')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(10)
  const [selected, setSelected] = useState<UserRow | null>(null)
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  const upsertLocal = (u: UserRow) => setUsers(list => list.map(x => (x.id === u.id ? u : x)))

  const showBanner = (kind: 'ok' | 'err', msg: string) => {
    setBanner({ kind, msg })
    setTimeout(() => setBanner(null), 4000)
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter(u => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (statusFilter === 'active' && !u.isActive) return false
      if (statusFilter === 'inactive' && u.isActive) return false
      if (!q) return true
      return (
        (u.fullName ?? '').toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.direction ?? '').toLowerCase().includes(q) ||
        u.preferredUsername.toLowerCase().includes(q)
      )
    })
  }, [users, search, roleFilter, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * pageSize
  const pageItems = filtered.slice(pageStart, pageStart + pageSize)

  const hasFilter = search || roleFilter !== 'all' || statusFilter !== 'all'

  return (
    <>
      {banner && (
        <div className={banner.kind === 'ok' ? 'success-banner' : 'error-banner'}>
          {banner.kind === 'ok' ? <CheckCircleIcon width={16} height={16} /> : <XCircleIcon width={16} height={16} />}
          {banner.msg}
        </div>
      )}

      <div className="card">
        <div className="card-body" style={{ paddingBottom: 8 }}>
          <div className="filter-bar" style={{ marginBottom: 12 }}>
            <div className="search-input">
              <MagnifyingGlassIcon />
              <input
                type="search"
                placeholder="Rechercher par nom, email, direction…"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1) }}
              />
            </div>

            <select
              value={roleFilter}
              onChange={e => { setRoleFilter(e.target.value as RoleFilter); setPage(1) }}
            >
              <option value="all">Tous les rôles</option>
              <option value="admin">Administrateur</option>
              <option value="enseignant">Enseignant</option>
              <option value="lecteur">Lecteur</option>
            </select>

            <button
              type="button"
              className="btn-sort"
              onClick={() => setShowFilters(v => !v)}
              style={{
                background: showFilters ? 'var(--brand-soft)' : 'var(--surface)',
                color: showFilters ? 'var(--brand)' : 'var(--text)',
                borderColor: showFilters ? 'var(--brand)' : 'var(--border)',
              }}
            >
              <FunnelIcon width={14} height={14} /> Filtres
              {statusFilter !== 'all' && (
                <span style={{
                  display: 'inline-block', width: 6, height: 6,
                  borderRadius: '50%', background: 'var(--brand)',
                }} />
              )}
            </button>

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

          {showFilters && (
            <div style={{
              padding: 12, marginBottom: 12,
              background: 'var(--surface2)', borderRadius: 10, border: '1px solid var(--border)',
              display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
            }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>Statut :</span>
              {(['all', 'active', 'inactive'] as StatusFilter[]).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => { setStatusFilter(v); setPage(1) }}
                  className="btn-sort"
                  style={{
                    height: 32, padding: '0 12px', fontSize: 12,
                    background: statusFilter === v ? 'var(--brand-soft)' : 'var(--surface)',
                    color: statusFilter === v ? 'var(--brand)' : 'var(--text2)',
                    borderColor: statusFilter === v ? 'var(--brand)' : 'var(--border)',
                  }}
                >
                  {v === 'all' ? 'Tous' : v === 'active' ? 'Actifs' : 'Désactivés'}
                </button>
              ))}
              {hasFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch(''); setRoleFilter('all'); setStatusFilter('all'); setPage(1)
                  }}
                  style={{
                    marginLeft: 'auto', background: 'none', border: 'none',
                    color: 'var(--brand)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Réinitialiser tous les filtres
                </button>
              )}
            </div>
          )}
        </div>

        {view === 'list' ? (
          <UsersListView
            users={pageItems}
            currentUserId={currentUserId}
            onOpenDetail={setSelected}
            onQuickReactivate={async u => {
              try {
                const res = await fetch(`/api/users/${u.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ isActive: true }),
                })
                const d = await res.json()
                if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`)
                upsertLocal({ ...u, isActive: true })
                showBanner('ok', `Compte de « ${u.fullName ?? u.email} » réactivé.`)
                router.refresh()
              } catch (e) {
                showBanner('err', (e as Error).message)
              }
            }}
          />
        ) : (
          <UsersGridView
            users={pageItems}
            currentUserId={currentUserId}
            onOpenDetail={setSelected}
          />
        )}

        {filtered.length === 0 && (
          <div className="empty-state">
            {hasFilter ? 'Aucun utilisateur ne correspond aux filtres.' : 'Aucun utilisateur.'}
          </div>
        )}

        <div className="list-panel-footer">
          <span>
            {filtered.length > 0
              ? `${pageStart + 1}-${Math.min(pageStart + pageSize, filtered.length)} sur ${filtered.length} utilisateur${filtered.length > 1 ? 's' : ''}`
              : '0 utilisateur'}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value) as any); setPage(1) }}
              style={{
                height: 34, padding: '0 10px',
                border: '1px solid var(--border2)', borderRadius: 8,
                fontSize: 12, cursor: 'pointer',
              }}
            >
              {PAGE_SIZES.map(n => <option key={n} value={n}>{n} par page</option>)}
            </select>
            <div className="pagination-nav">
              <button
                type="button"
                className="pag-btn"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                aria-label="Précédent"
              >
                <ChevronLeftIcon width={14} height={14} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 5).map(n => (
                <button
                  key={n}
                  type="button"
                  className={`pag-btn ${n === currentPage ? 'active' : ''}`}
                  onClick={() => setPage(n)}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                className="pag-btn"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                aria-label="Suivant"
              >
                <ChevronRightIcon width={14} height={14} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {selected && (
        <UserDetailsModal
          user={selected}
          currentUserId={currentUserId}
          onClose={() => setSelected(null)}
          onSaved={u => {
            upsertLocal(u)
            setSelected(null)
            showBanner('ok', 'Utilisateur mis à jour.')
            router.refresh()
          }}
          onError={msg => showBanner('err', msg)}
        />
      )}
    </>
  )
}

// ─── Vue liste (table) ───────────────────────────────────────

function UsersListView({
  users,
  currentUserId,
  onOpenDetail,
  onQuickReactivate,
}: {
  users: UserRow[]
  currentUserId: string
  onOpenDetail: (u: UserRow) => void
  onQuickReactivate: (u: UserRow) => void
}) {
  if (users.length === 0) return null
  return (
    <div className="results-table-wrap">
      <table className="results-table">
        <thead>
          <tr>
            <th>Utilisateur</th>
            <th>Email</th>
            <th>Direction</th>
            <th>Rôle</th>
            <th>Statut</th>
            <th style={{ textAlign: 'right' }}>Audits</th>
            <th>Dernière connexion</th>
            <th style={{ width: 180, textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td>
                <div className="user-name-cell">
                  <div className={`avatar-round hue-${hueForPlatform(u.fullName || u.email)}`}>
                    {initials(u.fullName || u.email)}
                  </div>
                  <div className="user-name-body">
                    <div className="user-name">{u.fullName || u.email}</div>
                    {u.id === currentUserId && <span className="user-name-you">Vous</span>}
                  </div>
                </div>
              </td>
              <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{u.email}</td>
              <td style={{ fontSize: 12.5, color: u.direction ? 'var(--text)' : 'var(--text3)' }}>
                {u.direction || '—'}
              </td>
              <td><span className={`role-pill ${u.role}`}>{ROLE_LABEL[u.role]}</span></td>
              <td>
                <span className={`status-pill ${u.isActive ? 'active' : 'inactive'}`}>
                  <span className="dot" /> {u.isActive ? 'Actif' : 'Désactivé'}
                </span>
              </td>
              <td style={{ textAlign: 'right', fontSize: 13, fontWeight: 600 }}>
                <span style={{ color: u.auditsCount === 0 ? 'var(--text3)' : 'var(--text)' }}>
                  {u.auditsCount}
                </span>
              </td>
              <td>
                {u.lastLogin ? (
                  <div className="date-cell">
                    <CalendarIcon className="date-cell-icon" />
                    <div>
                      <div className="date-cell-date">
                        {new Date(u.lastLogin).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </div>
                      <div className="date-cell-time">
                        {new Date(u.lastLogin).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <span style={{ color: 'var(--text3)', fontSize: 12 }}>Jamais</span>
                )}
              </td>
              <td>
                <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end', width: '100%' }}>
                  {u.isActive ? (
                    <button type="button" className="btn-detail" onClick={() => onOpenDetail(u)}>
                      Voir détails
                    </button>
                  ) : (
                    <button type="button" className="btn-detail reactivate" onClick={() => onQuickReactivate(u)}>
                      Réactiver
                    </button>
                  )}
                  <button
                    type="button"
                    className="icon-menu-btn"
                    onClick={() => onOpenDetail(u)}
                    aria-label="Plus d'actions"
                  >
                    <EllipsisVerticalIcon />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Vue grille (cards) ──────────────────────────────────────

function UsersGridView({
  users,
  currentUserId,
  onOpenDetail,
}: {
  users: UserRow[]
  currentUserId: string
  onOpenDetail: (u: UserRow) => void
}) {
  if (users.length === 0) return null
  return (
    <div
      className="plateformes-grid"
      style={{ padding: '0 20px 20px' }}
    >
      {users.map(u => (
        <div key={u.id} className={`plateforme-card ${u.isActive ? '' : 'inactive'}`}>
          <div className="plateforme-card-head">
            <div className={`avatar-round hue-${hueForPlatform(u.fullName || u.email)}`}>
              {initials(u.fullName || u.email)}
            </div>
            <div className="plateforme-card-title-row">
              <div className="plateforme-card-name">{u.fullName || u.email}</div>
              {u.id === currentUserId && <span className="user-name-you">Vous</span>}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)', wordBreak: 'break-all' }}>
              {u.email}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span className={`role-pill ${u.role}`}>{ROLE_LABEL[u.role]}</span>
              <span className={`status-pill ${u.isActive ? 'active' : 'inactive'}`}>
                <span className="dot" /> {u.isActive ? 'Actif' : 'Désactivé'}
              </span>
              {u.direction && <span className="badge badge-neutral">{u.direction}</span>}
            </div>
          </div>
          <div className="plateforme-card-footer">
            <div className="plateforme-card-metric">
              <span className={`plateforme-card-metric-num ${u.auditsCount === 0 ? 'na' : ''}`}>
                {u.auditsCount}
              </span>
              <span className="plateforme-card-metric-label">Audits</span>
            </div>
            <button
              type="button"
              className="plateforme-card-explore"
              onClick={() => onOpenDetail(u)}
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Voir détails →
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Modal détails ───────────────────────────────────────────

function UserDetailsModal({
  user,
  currentUserId,
  onClose,
  onSaved,
  onError,
}: {
  user: UserRow
  currentUserId: string
  onClose: () => void
  onSaved: (u: UserRow) => void
  onError: (msg: string) => void
}) {
  const [role, setRole] = useState<UserRole>(user.role)
  const [isActive, setIsActive] = useState(user.isActive)
  const [saving, setSaving] = useState(false)
  const isSelf = user.id === currentUserId

  const submit = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, isActive }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`)
      onSaved({ ...user, role, isActive })
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-card-header">
          <div className="modal-card-title">Détails de l&apos;utilisateur</div>
          <button type="button" className="modal-card-close" onClick={onClose} aria-label="Fermer">
            <XMarkIcon width={18} height={18} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div className={`avatar-round hue-${hueForPlatform(user.fullName || user.email)}`} style={{ width: 56, height: 56, fontSize: 16 }}>
            {initials(user.fullName || user.email)}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>
              {user.fullName || user.email}
              {isSelf && <span className="user-name-you" style={{ marginLeft: 8 }}>Vous</span>}
            </div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>
              {user.email}
            </div>
          </div>
        </div>

        <div className="detail-info-grid" style={{ marginBottom: 20 }}>
          <div className="detail-field">
            <div className="detail-field-label">Username Keycloak</div>
            <div className="detail-field-value mono">{user.preferredUsername}</div>
          </div>
          <div className="detail-field">
            <div className="detail-field-label">Direction</div>
            <div className="detail-field-value">{user.direction || '—'}</div>
          </div>
          <div className="detail-field">
            <div className="detail-field-label">Créé le</div>
            <div className="detail-field-value">
              {new Date(user.createdAt).toLocaleString('fr-FR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </div>
          </div>
          <div className="detail-field">
            <div className="detail-field-label">Dernière connexion</div>
            <div className="detail-field-value">
              {user.lastLogin
                ? new Date(user.lastLogin).toLocaleString('fr-FR', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })
                : 'Jamais'}
            </div>
          </div>
          <div className="detail-field">
            <div className="detail-field-label">Audits lancés</div>
            <div className="detail-field-value">{user.auditsCount}</div>
          </div>
          <div className="detail-field">
            <div className="detail-field-label">Statut actuel</div>
            <div className="detail-field-value">
              <span className={`status-pill ${user.isActive ? 'active' : 'inactive'}`}>
                <span className="dot" /> {user.isActive ? 'Actif' : 'Désactivé'}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div className="detail-field-label">Rôle</div>
            <select
              value={role}
              onChange={e => setRole(e.target.value as UserRole)}
              disabled={isSelf}
              style={{
                width: '100%', padding: '10px 12px', fontSize: 13,
                border: '1px solid var(--border2)', borderRadius: 8,
                marginTop: 6, cursor: isSelf ? 'not-allowed' : 'pointer',
              }}
            >
              <option value="admin">Administrateur — accès complet</option>
              <option value="enseignant">Enseignant — audite ses propres cours</option>
              <option value="lecteur">Lecteur — lecture seule globale</option>
            </select>
            {isSelf && (
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                Vous ne pouvez pas modifier votre propre rôle.
              </div>
            )}
          </div>

          <div>
            <div className="detail-field-label">Statut du compte</div>
            <label style={{
              display: 'flex', alignItems: 'center', gap: 10, marginTop: 6,
              padding: 12, borderRadius: 10,
              background: isActive ? 'var(--success-soft)' : 'var(--danger-light)',
              border: `1px solid ${isActive ? 'var(--success-light)' : '#FCA5A5'}`,
              cursor: isSelf ? 'not-allowed' : 'pointer',
              opacity: isSelf ? 0.6 : 1,
            }}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                disabled={isSelf}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: isActive ? 'var(--success)' : 'var(--danger)' }}>
                  {isActive ? 'Compte actif' : 'Compte désactivé'}
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 2 }}>
                  {isActive
                    ? 'L\'utilisateur peut se connecter et utiliser la plateforme.'
                    : 'L\'utilisateur ne peut pas se connecter.'}
                </div>
              </div>
            </label>
            {isSelf && (
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                Vous ne pouvez pas désactiver votre propre compte.
              </div>
            )}
          </div>
        </div>

        <div className="modal-card-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={submit}
            disabled={saving || (role === user.role && isActive === user.isActive)}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────

function initials(name: string): string {
  return (name || 'UN')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('') || 'UN'
}
