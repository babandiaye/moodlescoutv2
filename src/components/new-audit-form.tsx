'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

type Platform = { id: string; name: string; url: string; version: string }
type LlmConfig = { id: string; name: string; provider: string; model: string; isDefault: boolean }

type QuotaInfo = {
  perUser: { used: number; limit: number; remaining: number; retryAfterSec: number; windowSec: number }
  global: { used: number; limit: number; remaining: number; retryAfterSec: number; windowSec: number }
  blocked: boolean
  blockedKind: 'user' | 'global' | null
  retryAfterSec: number
  nearLimit: boolean
  nearLimitKind: 'user' | 'global' | null
}

type Props = {
  platforms: Platform[]
  llmConfigs: LlmConfig[]
}

function formatMmSs(sec: number): string {
  if (sec <= 0) return '00:00'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function NewAuditForm({ platforms, llmConfigs }: Props) {
  const router = useRouter()
  const defaultLlm = llmConfigs.find(c => c.isDefault) ?? llmConfigs[0]
  const [form, setForm] = useState({
    platformId: platforms[0]?.id ?? '',
    llmConfigId: defaultLlm?.id ?? '',
    extractImages: true,
    quizDetail: 'both' as 'meta' | 'detail' | 'both',
    categoriesText: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Quota rate limit (lecture seule pour avertir avant le clic)
  const [quota, setQuota] = useState<QuotaInfo | null>(null)
  const [countdown, setCountdown] = useState(0)

  // Charge le quota au mount et le rafraîchit après chaque tentative
  const loadQuota = async () => {
    try {
      const res = await fetch('/api/audits/quota')
      if (!res.ok) return
      const data: QuotaInfo = await res.json()
      setQuota(data)
      setCountdown(data.retryAfterSec)
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadQuota()
  }, [])

  // Compteur live qui décrémente chaque seconde quand on est bloqué
  useEffect(() => {
    if (countdown <= 0) return
    const interval = setInterval(() => {
      setCountdown(c => {
        const next = c - 1
        if (next <= 0) {
          // Quota libéré : rafraîchit l'état complet
          loadQuota()
          return 0
        }
        return next
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [countdown])

  const isBlocked = quota?.blocked || countdown > 0

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const categories = form.categoriesText
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
      const res = await fetch('/api/audits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platformId: form.platformId,
          llmConfigId: form.llmConfigId,
          extractImages: form.extractImages,
          quizDetail: form.quizDetail,
          categories,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        // Si rate limit, rafraîchit le quota pour mettre à jour le compteur live
        if (res.status === 429) {
          await loadQuota()
        }
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      router.push(`/audits/${data.session.id}`)
    } catch (err) {
      setError((err as Error).message)
      setSubmitting(false)
    }
  }

  return (
    <div className="flex-col-20">
      <form onSubmit={handleSubmit} className="flex-col-20">
        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <span className="card-icon">🎓</span> Plateforme Moodle
            </span>
          </div>
          <div className="card-body">
            <div className="platform-list">
              {platforms.map(p => (
                <label
                  key={p.id}
                  className="platform-item"
                  style={{ cursor: 'pointer', borderColor: form.platformId === p.id ? 'var(--brand)' : undefined }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
                    <input
                      type="radio"
                      name="platformId"
                      value={p.id}
                      checked={form.platformId === p.id}
                      onChange={() => setForm(f => ({ ...f, platformId: p.id }))}
                      style={{ accentColor: 'var(--brand)', width: 16, height: 16 }}
                    />
                    <div className="platform-info">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span className="platform-name">{p.name}</span>
                        <span className="badge badge-neutral">Moodle {p.version}.x</span>
                      </div>
                      <span className="platform-url">{p.url}</span>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <span className="card-icon">🤖</span> Configuration LLM
            </span>
          </div>
          <div className="card-body">
            <div className="form-group">
              <select
                value={form.llmConfigId}
                onChange={e => setForm(f => ({ ...f, llmConfigId: e.target.value }))}
              >
                {llmConfigs.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.provider}/{c.model}
                    {c.isDefault ? ' (défaut)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">
              <span className="card-icon">⚙</span> Options d&apos;audit
            </span>
          </div>
          <div className="card-body">
            <div className="config-layout">
              <div className="form-group">
                <label className="form-label">Profondeur quiz</label>
                <select
                  value={form.quizDetail}
                  onChange={e =>
                    setForm(f => ({ ...f, quizDetail: e.target.value as 'meta' | 'detail' | 'both' }))
                  }
                >
                  <option value="meta">Méta uniquement (rapide)</option>
                  <option value="detail">Détail par étudiant</option>
                  <option value="both">Les deux (recommandé)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Images des cours</label>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    cursor: 'pointer',
                    marginTop: 8,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.extractImages}
                    onChange={e => setForm(f => ({ ...f, extractImages: e.target.checked }))}
                    style={{ width: 16, height: 16, accentColor: 'var(--brand)' }}
                  />
                  <span style={{ fontSize: 13 }}>Analyser les images (infos animateurs)</span>
                </label>
              </div>
              <div className="form-group full">
                <label className="form-label">Filtre catégories (optionnel)</label>
                <input
                  type="text"
                  placeholder="ex: IDA, Licence 1, Master 2 (séparés par virgule)"
                  value={form.categoriesText}
                  onChange={e => setForm(f => ({ ...f, categoriesText: e.target.value }))}
                />
                <span className="form-hint">
                  Si vide : tous les cours visibles seront audités. Sinon, seuls les cours dont la
                  hiérarchie contient une catégorie listée.
                </span>
              </div>
            </div>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {quota && quota.blocked && (
          <div
            className="error-banner"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <span>
              ⛔{' '}
              {quota.blockedKind === 'user'
                ? `Vous avez atteint votre quota personnel (${quota.perUser.limit} audits / ${Math.round(
                    quota.perUser.windowSec / 60,
                  )} min).`
                : `Le quota global de la plateforme est saturé (${quota.global.limit} audits / ${Math.round(
                    quota.global.windowSec / 60,
                  )} min). D'autres auditeurs sont en cours.`}
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>
              Disponible dans {formatMmSs(countdown)}
            </span>
          </div>
        )}

        {quota && !quota.blocked && quota.nearLimit && (
          <div
            style={{
              padding: '10px 14px',
              background: 'var(--warn-light)',
              border: '1px solid #F9E79F',
              color: 'var(--warn)',
              borderRadius: 'var(--radius)',
              fontSize: 12,
            }}
          >
            ⚠{' '}
            {quota.nearLimitKind === 'user'
              ? `Quota personnel : ${quota.perUser.used}/${quota.perUser.limit} audits utilisés sur la fenêtre de ${Math.round(
                  quota.perUser.windowSec / 60,
                )} min.`
              : `Quota global : ${quota.global.used}/${quota.global.limit} audits utilisés. La file est chargée par d'autres auditeurs.`}
          </div>
        )}

        <div className="card">
          <div
            className="card-body"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>
              {isBlocked ? (
                <span>
                  Quota atteint — réessayez dans{' '}
                  <strong style={{ fontFamily: 'var(--mono)' }}>{formatMmSs(countdown)}</strong>.
                </span>
              ) : (
                <>Lancement asynchrone via la file d&apos;attente. Vous serez redirigé vers la page de suivi.</>
              )}
            </div>
            <button
              type="submit"
              className="btn-launch"
              disabled={submitting || isBlocked || !form.platformId || !form.llmConfigId}
            >
              {submitting
                ? 'Création…'
                : isBlocked
                  ? `⏳ ${formatMmSs(countdown)}`
                  : "▶ Lancer l'audit"}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
