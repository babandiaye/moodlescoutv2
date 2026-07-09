'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AcademicCapIcon, CheckIcon, XMarkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { Pagination } from './pagination'

const ICON_INLINE = { width: 12, height: 12, verticalAlign: '-2px', display: 'inline-block' as const }

type Platform = {
  id: string
  name: string
  url: string
  version: string
  isActive: boolean
  createdAt: Date | string
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

type Props = {
  initial: Platform[]
}

export function PlatformsSection({ initial }: Props) {
  const router = useRouter()
  const [platforms, setPlatforms] = useState<Platform[]>(initial)
  const [form, setForm] = useState({ name: '', url: '', token: '', version: '4' })
  const [showToken, setShowToken] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [testing, setTesting] = useState<Record<string, 'loading' | { ok: true; sitename?: string; release?: string; latencyMs: number } | { ok: false; error: string }>>({})
  type StatsState = 'loading' | { error: string } | Stats
  const [stats, setStats] = useState<Record<string, StatsState | undefined>>({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  useEffect(() => { setPage(1) }, [pageSize])
  const paged = useMemo(
    () => platforms.slice((page - 1) * pageSize, page * pageSize),
    [platforms, page, pageSize],
  )
  const pagedIds = paged.map(p => p.id)
  const allPagedSelected = pagedIds.length > 0 && pagedIds.every(id => selected.has(id))
  const somePagedSelected = pagedIds.some(id => selected.has(id))

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
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

  const handleToggleActive = async (p: Platform) => {
    setError(null)
    const newVal = !p.isActive
    try {
      const res = await fetch(`/api/moodle-platforms/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: newVal }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setPlatforms(ps => ps.map(x => (x.id === p.id ? { ...x, isActive: newVal } : x)))
      setSuccess(`Plateforme « ${p.name} » ${newVal ? 'activée' : 'désactivée'}`)
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleBulkToggle = async (isActive: boolean) => {
    setError(null)
    setSuccess(null)
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
      setPlatforms(ps => ps.map(x => (selected.has(x.id) ? { ...x, isActive } : x)))
      setSelected(new Set())
      setSuccess(`${data.updated ?? ids.length} plateforme(s) ${isActive ? 'activée(s)' : 'désactivée(s)'}`)
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBulkBusy(false)
    }
  }

  const handleClearCache = async (id: string, name: string) => {
    if (!confirm(`Vider le cache Redis des appels Moodle Web Services pour « ${name} » ?\n\nUtile si vous venez de corriger quelque chose côté Moodle (token, capability, fonction ajoutée) — les prochaines requêtes iront directement sur Moodle sans attendre l'expiration du cache.`)) return
    setError(null)
    try {
      const res = await fetch(`/api/moodle-platforms/${id}/cache`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setSuccess(`Cache WS de « ${name} » vidé (${data.deleted ?? 0} clés)`)
    } catch (err) {
      setError((err as Error).message)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    if (!form.url || !form.token || !form.name) {
      setError('Nom, URL et token sont requis')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/moodle-platforms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setPlatforms(p => [data.platform, ...p])
      setForm({ name: '', url: '', token: '', version: '4' })
      setSuccess(`Plateforme « ${data.platform.name} » ajoutée`)
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Supprimer la plateforme « ${name} » ?`)) return
    setError(null)
    try {
      const res = await fetch(`/api/moodle-platforms/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setPlatforms(p => p.filter(x => x.id !== id))
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">
          <AcademicCapIcon className="card-icon" /> Plateformes Moodle
        </span>
        <span className="badge badge-info">{platforms.length} configurée(s)</span>
      </div>
      <div className="card-body">
        {error && <div className="error-banner">{error}</div>}
        {success && <div className="success-banner">{success}</div>}

        {platforms.length > 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
              padding: '8px 10px',
              marginBottom: 8,
              background: 'var(--surface2)',
              borderRadius: 6,
              fontSize: 12,
            }}
          >
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={allPagedSelected}
                ref={el => {
                  if (el) el.indeterminate = !allPagedSelected && somePagedSelected
                }}
                onChange={togglePage}
              />
              <span style={{ color: 'var(--text2)' }}>
                {selected.size > 0
                  ? `${selected.size} sélectionnée(s)`
                  : 'Tout sélectionner (page)'}
              </span>
            </label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn btn-success"
                style={{ fontSize: 11, padding: '4px 10px' }}
                disabled={selected.size === 0 || bulkBusy}
                onClick={() => handleBulkToggle(true)}
              >
                <CheckIcon style={ICON_INLINE} /> Activer sélection
              </button>
              <button
                type="button"
                className="btn btn-danger"
                style={{ fontSize: 11, padding: '4px 10px' }}
                disabled={selected.size === 0 || bulkBusy}
                onClick={() => handleBulkToggle(false)}
              >
                <XMarkIcon style={ICON_INLINE} /> Désactiver sélection
              </button>
              {selected.size > 0 && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: 11, padding: '4px 10px' }}
                  onClick={() => setSelected(new Set())}
                  disabled={bulkBusy}
                >
                  Réinitialiser
                </button>
              )}
            </div>
          </div>
        )}

        {platforms.length > 0 && (
          <div className="platform-list">
            {paged.map(p => {
              const s = stats[p.id]
              const isStatsLoading = s === 'loading'
              const statsObj = s && s !== 'loading' && !('error' in s) ? (s as Stats) : null
              const statsErr = s && s !== 'loading' && 'error' in s ? s.error : null
              const isChecked = selected.has(p.id)
              return (
                <div
                  key={p.id}
                  className="platform-item"
                  style={{
                    flexDirection: 'column',
                    alignItems: 'stretch',
                    opacity: p.isActive ? 1 : 0.7,
                    borderLeft: p.isActive ? undefined : '3px solid var(--danger)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div className="platform-info" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleOne(p.id)}
                        aria-label={`Sélectionner ${p.name}`}
                        style={{ cursor: 'pointer' }}
                      />
                      <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className="platform-name">{p.name}</span>
                        <span className="badge badge-neutral">Moodle {p.version}.x</span>
                        {p.isActive ? (
                          <span className="badge badge-success">
                            <CheckIcon style={ICON_INLINE} /> Active
                          </span>
                        ) : (
                          <span className="badge badge-danger">
                            <XMarkIcon style={ICON_INLINE} /> Désactivée
                          </span>
                        )}
                        {testing[p.id] && testing[p.id] !== 'loading' && (() => {
                          const t = testing[p.id] as { ok: boolean; sitename?: string; release?: string; latencyMs?: number; error?: string }
                          return t.ok ? (
                            <span className="badge badge-success">
                              <CheckIcon style={ICON_INLINE} /> {t.sitename || 'OK'} {t.release ? `(${t.release})` : ''} · {t.latencyMs}ms
                            </span>
                          ) : (
                            <span className="badge badge-danger">
                              <XMarkIcon style={ICON_INLINE} /> {String(t.error).slice(0, 80)}
                            </span>
                          )
                        })()}
                      </div>
                      <span className="platform-url">{p.url}</span>
                      </div>
                    </div>
                    <div className="platform-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: 12, padding: '4px 10px' }}
                        onClick={() => handleTest(p.id)}
                        disabled={testing[p.id] === 'loading'}
                      >
                        {testing[p.id] === 'loading' ? '…' : 'Tester'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: 12, padding: '4px 10px' }}
                        onClick={() => handleStats(p.id)}
                        disabled={isStatsLoading}
                        title="Inventaire de la plateforme (cours, utilisateurs uniques, enseignants, tuteurs)"
                      >
                        {isStatsLoading ? '…' : 'Détails'}
                      </button>
                      <Link
                        href={`/plateformes/${p.id}`}
                        className="btn btn-secondary"
                        style={{ fontSize: 12, padding: '4px 10px' }}
                        title="Explorer l'arbre catégoriel de cette plateforme (filière → niveau → UE → cours)"
                      >
                        Explorer
                      </Link>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: 12, padding: '4px 10px' }}
                        onClick={() => handleClearCache(p.id, p.name)}
                        title="Vider le cache Redis des appels Moodle Web Services pour cette plateforme"
                      >
                        Vider cache
                      </button>
                      <button
                        type="button"
                        className={`btn ${p.isActive ? 'btn-secondary' : 'btn-success'}`}
                        style={{ fontSize: 12, padding: '4px 10px' }}
                        onClick={() => handleToggleActive(p)}
                        title={
                          p.isActive
                            ? 'Cacher cette plateforme aux non-admins (audits + cours associés masqués)'
                            : 'Réactiver cette plateforme pour tous les utilisateurs'
                        }
                      >
                        {p.isActive ? 'Désactiver' : 'Activer'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ fontSize: 12, padding: '4px 10px' }}
                        onClick={() => handleDelete(p.id, p.name)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                  {(statsObj || statsErr || isStatsLoading) && (
                    <div style={{ marginTop: 10, padding: 12, background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--border)' }}>
                      {isStatsLoading && (
                        <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                          ⏳ Récupération des informations…
                        </div>
                      )}
                      {statsErr && (
                        <div style={{ fontSize: 12, color: 'var(--danger)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <XMarkIcon style={{ width: 13, height: 13 }} /> {statsErr}
                        </div>
                      )}
                      {statsObj && (
                        <>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                            <InfoBox label="URL" value={statsObj.url} mono />
                            <InfoBox
                              label="Site"
                              value={statsObj.sitename ?? '—'}
                            />
                            <InfoBox
                              label="Version Moodle"
                              value={statsObj.release ? statsObj.release.split(' ')[0] : '—'}
                              hint={statsObj.release ?? undefined}
                            />
                            <UsersInfoBox stats={statsObj} />
                          </div>
                          <TokenAccountLine stats={statsObj} />
                          <div
                            style={{
                              marginTop: 8,
                              fontSize: 11,
                              color: 'var(--text3)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <span>
                              {new Date(statsObj.computedAt).toLocaleString('fr-FR')} ·{' '}
                              {Math.round(statsObj.durationMs)}ms
                              {statsObj.cached ? ' · depuis cache (TTL 10 min)' : ''}
                            </span>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              style={{ fontSize: 11, padding: '2px 8px' }}
                              onClick={() => handleStats(p.id, true)}
                            >
                              ↻ Recalculer
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {platforms.length > 0 && (
          <div style={{ marginTop: 12, marginBottom: 16, marginLeft: -20, marginRight: -20 }}>
            <Pagination
              page={page}
              pageSize={pageSize}
              total={platforms.length}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          style={{ borderTop: platforms.length ? '1px solid var(--border)' : 'none', paddingTop: platforms.length ? 16 : 0 }}
        >
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 12 }}>
            Ajouter une plateforme
          </p>
          <div className="config-layout">
            <div className="form-group">
              <label className="form-label">Nom affiché</label>
              <input
                type="text"
                placeholder="Moodle Principal"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">URL Moodle</label>
              <input
                type="url"
                placeholder="https://moodle.unchk.edu.sn"
                value={form.url}
                onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              />
            </div>
            <div className="form-group full">
              <label className="form-label">Token Web Services</label>
              <div className="input-row">
                <input
                  type={showToken ? 'text' : 'password'}
                  placeholder="Token Moodle Web Services"
                  value={form.token}
                  onChange={e => setForm(f => ({ ...f, token: e.target.value }))}
                />
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ whiteSpace: 'nowrap', fontSize: 12 }}
                  onClick={() => setShowToken(s => !s)}
                >
                  {showToken ? 'Masquer' : 'Afficher'}
                </button>
              </div>
              <span className="form-hint">
                Moodle → Admin → Plugins → Web Services → Gérer les tokens. Le token est chiffré (AES-256-GCM) avant
                stockage.
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
          </div>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={submitting || !form.name || !form.url || !form.token}
          >
            {submitting ? 'Validation…' : '+ Ajouter la plateforme'}
          </button>
        </form>
      </div>
    </div>
  )
}

function InfoBox({
  label,
  value,
  hint,
  mono,
}: {
  label: string
  value: string
  hint?: string
  mono?: boolean
}) {
  return (
    <div
      style={{ background: 'var(--surface2)', padding: '8px 10px', borderRadius: 6 }}
      title={hint}
    >
      <div
        style={{
          fontSize: 10,
          color: 'var(--text3)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--brand)',
          fontFamily: mono ? 'var(--mono)' : 'inherit',
          wordBreak: 'break-all',
          lineHeight: 1.3,
        }}
      >
        {value}
      </div>
    </div>
  )
}

function UsersInfoBox({ stats }: { stats: Stats }) {
  const total = stats.nbUsers
  const breakdown = stats.usersBreakdown
  const partial = stats.usersBreakdownPartial
  const error = stats.usersError
  const method = stats.usersMethod
  const nbCourses = stats.usersNbCoursesScanned

  // Trie le breakdown par valeur décroissante (méthode dominante en premier)
  const sortedBreakdown = breakdown
    ? Object.entries(breakdown).sort((a, b) => b[1] - a[1])
    : []

  const isAccessError = error?.toLowerCase().includes('accessexception')
  const isInvalidToken = error?.toLowerCase().includes('invalidtoken')

  // Détecte le sous-cas du fallback : `core_user_get_users` est EXPOSÉE
  // (hasGetUsersFunction === true) mais le call a planté (timeout réseau,
  // payload tronqué, exception Moodle...) → on est tombé en enrolment.
  // Distinct du cas où la fonction n'est juste pas exposée du tout.
  const isFallbackDueToTimeout = method === 'enrolment' && stats.hasGetUsersFunction

  const hintParts: string[] = []
  if (total !== null && method === 'enrolment' && isFallbackDueToTimeout) {
    hintParts.push(
      "Fallback enrolment : l'appel direct core_user_get_users a été tronqué côté Moodle (payload trop gros pour max_execution_time PHP).",
      `Comptage distinct sur ${nbCourses ?? '?'} cours = ${total.toLocaleString('fr-FR')} users (≈99% du total réel).`,
      "Pour un compte exact, augmenter côté Moodle :",
      "  max_execution_time à 300s (php.ini ou .htaccess)",
      "  memory_limit éventuellement à 512M",
      "Le code reprendra la méthode directe automatiquement au prochain appel.",
      "Erreur captée : " + error,
    )
  } else if (total !== null && method === 'enrolment') {
    hintParts.push(
      "Comptage via core_enrol_get_enrolled_users (fallback automatique).",
      `Compte les users distincts inscrits dans ≥1 cours sur ${nbCourses ?? '?'} cours scannés.`,
      "Limite : exclut les comptes admins/techniques jamais inscrits.",
      "Pour un compte exact incluant tous les comptes, exposer core_user_get_users dans la liste des fonctions du service côté Moodle.",
    )
  }
  if (total === null && isAccessError) {
    hintParts.push(
      "Aucune capability disponible pour compter les utilisateurs.",
      "core_user_get_users ET core_enrol_get_enrolled_users sont refusés.",
      "Pour corriger côté Moodle (l'une OU l'autre suffit) :",
      "  Option A — moodle/user:viewdetails + moodle/user:viewalldetails (compte exact)",
      "  Option B — moodle/course:viewparticipants (compte via inscriptions)",
      "Erreur reçue : " + error,
    )
  } else if (total === null && isInvalidToken) {
    hintParts.push("Token Web Services invalide ou expiré côté Moodle.")
    hintParts.push("Erreur Moodle : " + error)
  } else if (total === null && error) {
    hintParts.push("Comptage indisponible. Erreur Moodle : " + error)
  } else if (total === null) {
    hintParts.push("Comptage indisponible.")
  }
  if (partial) {
    hintParts.push("⚠ Calcul partiel : certains appels ont échoué.")
    if (error) hintParts.push("Détail : " + error)
  }
  if (sortedBreakdown.length > 0 && method === 'auth-list') {
    hintParts.push(
      "Méthodes d'auth interrogées : " +
        sortedBreakdown
          .map(([m, c]) => `${m} = ${c.toLocaleString('fr-FR')}`)
          .join(', '),
    )
  }
  const hint = hintParts.join('\n') || undefined

  return (
    <div
      style={{ background: 'var(--surface2)', padding: '8px 10px', borderRadius: 6 }}
      title={hint}
    >
      <div
        style={{
          fontSize: 10,
          color: 'var(--text3)',
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
          marginBottom: 4,
        }}
      >
        Utilisateurs
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: total === null ? 'var(--warn)' : 'var(--brand)',
          lineHeight: 1.3,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexWrap: 'wrap',
        }}
      >
        {total !== null ? total.toLocaleString('fr-FR') : 'n/a'}
        {total !== null && method === 'enrolment' && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              padding: '1px 6px',
              borderRadius: 4,
              background: isFallbackDueToTimeout ? 'var(--warn-bg, #fff3cd)' : 'var(--info-bg, #d1ecf1)',
              color: isFallbackDueToTimeout ? 'var(--warn, #856404)' : 'var(--info, #0c5460)',
            }}
            title={isFallbackDueToTimeout ? "Timeout serveur Moodle — fallback via inscriptions" : "Compte via les inscriptions de cours (fallback)"}
          >
            {isFallbackDueToTimeout ? 'timeout serveur Moodle' : 'inscrits'}
          </span>
        )}
        {total === null && isAccessError && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              padding: '1px 6px',
              borderRadius: 4,
              background: 'var(--warn-bg, #fff3cd)',
              color: 'var(--warn, #856404)',
            }}
          >
            permission Moodle manquante
          </span>
        )}
        {total === null && isInvalidToken && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              padding: '1px 6px',
              borderRadius: 4,
              background: 'var(--err-bg, #f8d7da)',
              color: 'var(--err, #721c24)',
            }}
          >
            token invalide
          </span>
        )}
        {partial && (
          <ExclamationTriangleIcon
            style={{ width: 13, height: 13, color: 'var(--warn)' }}
            aria-label="Calcul partiel"
          />
        )}
      </div>
      {sortedBreakdown.length > 0 && (
        <div
          style={{
            marginTop: 3,
            fontSize: 10,
            color: 'var(--text3)',
            fontFamily: 'var(--mono)',
          }}
        >
          {sortedBreakdown
            .map(([method, count]) => `${method} ${count.toLocaleString('fr-FR')}`)
            .join(' · ')}
        </div>
      )}
    </div>
  )
}

/**
 * Affiche le compte Moodle qui détient le token webservice : utile pour
 * diagnostiquer les permissions (admin vs rôle dédié) et savoir si
 * `core_user_get_users` est exposé. Apparaît comme une ligne discrète sous
 * la grille principale des stats.
 */
function TokenAccountLine({ stats }: { stats: Stats }) {
  const { tokenUsername, tokenIsAdmin, hasGetUsersFunction, usersMethod } = stats
  if (!tokenUsername) return null

  const hint =
    tokenIsAdmin && !hasGetUsersFunction
      ? `Le compte du token est administrateur Moodle. Pour activer le compte exact des utilisateurs, ajouter core_user_get_users à la liste des fonctions exposées par le service webservice.\n\nAdministration → Web services → Services externes → [ton service] → Fonctions → Ajouter des fonctions → cocher "core_user_get_users".`
      : !tokenIsAdmin
      ? "Le token est rattaché à un compte non-admin. Bonne pratique de sécurité, mais limite les capabilities disponibles."
      : hasGetUsersFunction
      ? "Compte admin + core_user_get_users exposé → comptage direct opérationnel."
      : undefined

  return (
    <div
      style={{
        marginTop: 8,
        fontSize: 11,
        color: 'var(--text3)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        flexWrap: 'wrap',
      }}
      title={hint}
    >
      <span style={{ textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Compte du token :
      </span>
      <span style={{ fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{tokenUsername}</span>
      {tokenIsAdmin ? (
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            padding: '1px 6px',
            borderRadius: 4,
            background: 'var(--ok-bg, #d4edda)',
            color: 'var(--ok, #155724)',
          }}
        >
          admin Moodle
        </span>
      ) : (
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            padding: '1px 6px',
            borderRadius: 4,
            background: 'var(--surface2)',
            color: 'var(--text3)',
          }}
        >
          non-admin
        </span>
      )}
      {tokenIsAdmin && !hasGetUsersFunction && usersMethod === 'enrolment' && (
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            padding: '1px 6px',
            borderRadius: 4,
            background: 'var(--info-bg, #d1ecf1)',
            color: 'var(--info, #0c5460)',
          }}
        >
          ajouter core_user_get_users pour compte exact
        </span>
      )}
    </div>
  )
}
