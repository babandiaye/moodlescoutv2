'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { UsersIcon } from '@heroicons/react/24/outline'
import type { UserRole } from '@prisma/client'
import { Pagination } from './pagination'

type User = {
  id: string
  email: string
  preferredUsername: string
  fullName: string | null
  direction: string | null
  role: UserRole
  isActive: boolean
  createdAt: string | Date
  lastLogin: string | Date | null
  _count: { auditSessions: number }
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin',
  enseignant: 'Enseignant',
  lecteur: 'Lecteur',
}

const ROLE_BADGE_CLASS: Record<UserRole, string> = {
  admin: 'badge-success',
  enseignant: 'badge-neutral',
  lecteur: 'badge-info',
}

type Props = {
  initial: User[]
  currentUserId: string
}

function formatDate(d: string | Date | null): string {
  if (!d) return '—'
  return new Date(d).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function initials(name: string | null, email: string): string {
  const src = (name && name.trim()) || email
  return src
    .split(/\s+|[._@]/)
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function UsersListSection({ initial, currentUserId }: Props) {
  const router = useRouter()
  const [users, setUsers] = useState<User[]>(initial)
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState<'all' | UserRole>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // Tout changement de filtre ramène à la première page (sinon on peut se
  // retrouver sur "page 3" alors qu'il ne reste plus que 5 résultats).
  useEffect(() => { setPage(1) }, [search, filterRole, pageSize])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return users.filter(u => {
      if (filterRole !== 'all' && u.role !== filterRole) return false
      if (!q) return true
      return (
        (u.fullName ?? '').toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.direction ?? '').toLowerCase().includes(q) ||
        u.preferredUsername.toLowerCase().includes(q)
      )
    })
  }, [users, search, filterRole])

  const paged = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  )

  const stats = useMemo(
    () => ({
      total: users.length,
      admins: users.filter(u => u.role === 'admin').length,
      enseignants: users.filter(u => u.role === 'enseignant').length,
      lecteurs: users.filter(u => u.role === 'lecteur').length,
      actifs: users.filter(u => u.isActive).length,
      desactives: users.filter(u => !u.isActive).length,
    }),
    [users],
  )

  const patchUser = async (
    id: string,
    body: { role?: UserRole; isActive?: boolean },
    confirmMsg: string,
  ) => {
    if (!confirm(confirmMsg)) return
    setError(null)
    setBusy(b => ({ ...b, [id]: true }))
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? `HTTP ${res.status}`)
        return
      }
      setUsers(list =>
        list.map(u =>
          u.id === id
            ? { ...u, role: data.user.role, isActive: data.user.isActive }
            : u,
        ),
      )
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(b => ({ ...b, [id]: false }))
    }
  }

  return (
    <div className="flex-col-16">
      <div className="card">
        <div className="card-header">
          <span className="card-title">
            <UsersIcon className="card-icon" /> Gestion des utilisateurs
          </span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className="badge badge-info">{stats.total} comptes</span>
            <span className="badge badge-success">{stats.admins} admin(s)</span>
            <span className="badge badge-neutral">{stats.enseignants} enseignant(s)</span>
            {stats.lecteurs > 0 && (
              <span className="badge badge-info">{stats.lecteurs} lecteur(s)</span>
            )}
            {stats.desactives > 0 && (
              <span className="badge badge-danger">{stats.desactives} désactivé(s)</span>
            )}
          </div>
        </div>
        <div className="card-body">
          {error && <div className="error-banner">{error}</div>}

          <div className="filters-row" style={{ marginBottom: 12 }}>
            <input
              type="text"
              placeholder="Rechercher par nom, email, direction…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ minWidth: 260 }}
            />
            <select
              value={filterRole}
              onChange={e => setFilterRole(e.target.value as 'all' | UserRole)}
            >
              <option value="all">Tous rôles</option>
              <option value="admin">Admins uniquement</option>
              <option value="enseignant">Enseignants uniquement</option>
              <option value="lecteur">Lecteurs uniquement</option>
            </select>
          </div>

          <div className="results-table-wrap">
            <table className="results-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Nom</th>
                  <th>Email</th>
                  <th>Direction</th>
                  <th>Rôle</th>
                  <th>Statut</th>
                  <th>Audits</th>
                  <th>Dernière connexion</th>
                  <th style={{ minWidth: 200 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr className="empty-row">
                    <td colSpan={9}>Aucun utilisateur</td>
                  </tr>
                )}
                {paged.map(u => {
                  const isMe = u.id === currentUserId
                  const isBusy = busy[u.id] === true
                  return (
                    <tr key={u.id} style={!u.isActive ? { opacity: 0.55 } : undefined}>
                      <td>
                        <div className="avatar">{initials(u.fullName, u.email)}</div>
                      </td>
                      <td style={{ fontWeight: 500 }}>
                        {u.fullName || u.preferredUsername || '—'}
                        {isMe && (
                          <span
                            className="badge badge-info"
                            style={{ marginLeft: 6, fontSize: 10 }}
                          >
                            vous
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>
                        {u.email}
                      </td>
                      <td style={{ fontSize: 12 }}>{u.direction ?? '—'}</td>
                      <td>
                        <span className={`badge ${ROLE_BADGE_CLASS[u.role]}`}>
                          {ROLE_LABELS[u.role]}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${u.isActive ? 'badge-success' : 'badge-danger'}`}>
                          {u.isActive ? '● actif' : '○ désactivé'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center', fontFamily: 'var(--mono)' }}>
                        {u._count.auditSessions}
                      </td>
                      <td style={{ fontSize: 11, color: 'var(--text2)' }}>
                        {formatDate(u.lastLogin)}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                          <select
                            value={u.role}
                            disabled={isBusy || isMe}
                            title={isMe ? 'Vous ne pouvez pas modifier votre propre rôle.' : 'Changer le rôle'}
                            style={{ fontSize: 11, padding: '3px 6px' }}
                            onChange={e => {
                              const newRole = e.target.value as UserRole
                              if (newRole === u.role) return
                              patchUser(
                                u.id,
                                { role: newRole },
                                `Changer le rôle de ${u.fullName || u.email} en "${ROLE_LABELS[newRole]}" ?`,
                              )
                            }}
                          >
                            <option value="admin">Admin</option>
                            <option value="enseignant">Enseignant</option>
                            <option value="lecteur">Lecteur</option>
                          </select>
                          {u.isActive ? (
                            <button
                              type="button"
                              className="btn btn-danger"
                              style={{ fontSize: 11, padding: '3px 8px' }}
                              disabled={isBusy || isMe}
                              title={
                                isMe
                                  ? 'Vous ne pouvez pas désactiver votre propre compte.'
                                  : undefined
                              }
                              onClick={() =>
                                patchUser(
                                  u.id,
                                  { isActive: false },
                                  `Désactiver le compte de ${u.fullName || u.email} ?\n\nIl ne pourra plus se connecter (sera bloqué au login Keycloak).`,
                                )
                              }
                            >
                              Désactiver
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-success"
                              style={{ fontSize: 11, padding: '3px 8px' }}
                              disabled={isBusy}
                              onClick={() =>
                                patchUser(
                                  u.id,
                                  { isActive: true },
                                  `Réactiver le compte de ${u.fullName || u.email} ?`,
                                )
                              }
                            >
                              Réactiver
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div
            style={{
              marginTop: 12,
              padding: '8px 12px',
              fontSize: 11,
              color: 'var(--text3)',
              background: 'var(--surface2)',
              borderRadius: 6,
            }}
          >
            ⓘ Les comptes sont créés automatiquement à la première connexion Keycloak. Le rôle initial dépend de la
            direction (DITSI → admin, autres → enseignant). Vous pouvez ensuite ajuster manuellement ici. Vous ne pouvez
            ni modifier votre propre rôle, ni désactiver votre propre compte.
          </div>
        </div>
        {filtered.length > 0 && (
          <Pagination
            page={page}
            pageSize={pageSize}
            total={filtered.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        )}
      </div>
    </div>
  )
}
