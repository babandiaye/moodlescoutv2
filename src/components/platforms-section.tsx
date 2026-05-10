'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Platform = {
  id: string
  name: string
  url: string
  version: string
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
          <span className="card-icon">🎓</span> Plateformes Moodle
        </span>
        <span className="badge badge-info">{platforms.length} configurée(s)</span>
      </div>
      <div className="card-body">
        {error && <div className="error-banner">{error}</div>}
        {success && <div className="success-banner">{success}</div>}

        {platforms.length > 0 && (
          <div className="platform-list">
            {platforms.map(p => {
              const s = stats[p.id]
              const isStatsLoading = s === 'loading'
              const statsObj = s && s !== 'loading' && !('error' in s) ? (s as Stats) : null
              const statsErr = s && s !== 'loading' && 'error' in s ? s.error : null
              return (
                <div
                  key={p.id}
                  className="platform-item"
                  style={{ flexDirection: 'column', alignItems: 'stretch' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div className="platform-info">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className="platform-name">{p.name}</span>
                        <span className="badge badge-neutral">Moodle {p.version}.x</span>
                        {testing[p.id] && testing[p.id] !== 'loading' && (() => {
                          const t = testing[p.id] as { ok: boolean; sitename?: string; release?: string; latencyMs?: number; error?: string }
                          return t.ok ? (
                            <span className="badge badge-success">
                              ✓ {t.sitename || 'OK'} {t.release ? `(${t.release})` : ''} · {t.latencyMs}ms
                            </span>
                          ) : (
                            <span className="badge badge-danger">✗ {String(t.error).slice(0, 80)}</span>
                          )
                        })()}
                      </div>
                      <span className="platform-url">{p.url}</span>
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
                        <div style={{ fontSize: 12, color: 'var(--danger)' }}>✗ {statsErr}</div>
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

  // Trie le breakdown par valeur décroissante (méthode dominante en premier)
  const sortedBreakdown = breakdown
    ? Object.entries(breakdown).sort((a, b) => b[1] - a[1])
    : []

  const hintParts: string[] = []
  if (total === null) {
    hintParts.push(
      "Non disponible — le token Web Services n'a pas le droit core_user_get_users sur les méthodes d'auth interrogées (configurable via MOODLE_AUTH_METHODS).",
    )
  }
  if (partial) {
    hintParts.push('⚠ Calcul partiel : au moins une méthode d\'auth a échoué.')
  }
  if (sortedBreakdown.length > 0) {
    hintParts.push(
      'Détail : ' +
        sortedBreakdown
          .map(([m, c]) => `${m} = ${c.toLocaleString('fr-FR')}`)
          .join(', '),
    )
  }
  const hint = hintParts.join('\n\n') || undefined

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
          color: 'var(--brand)',
          lineHeight: 1.3,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        {total !== null ? total.toLocaleString('fr-FR') : 'n/a'}
        {partial && (
          <span style={{ color: 'var(--warn)', fontSize: 11 }} title="Calcul partiel">
            ⚠
          </span>
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
