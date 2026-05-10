'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type LlmConfig = {
  id: string
  name: string
  provider: string
  apiUrl: string | null
  model: string
  isDefault: boolean
}

type Props = { initial: LlmConfig[] }

const ANTHROPIC_MODELS = [
  'claude-opus-4-7',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
]

export function LlmConfigsSection({ initial }: Props) {
  const router = useRouter()
  const [configs, setConfigs] = useState<LlmConfig[]>(initial)
  const [form, setForm] = useState({
    name: '',
    provider: 'ollama' as 'ollama' | 'anthropic',
    apiUrl: 'https://fromager.unchk.sn',
    apiKey: '',
    model: 'gemma3:12b',
    isDefault: configs.length === 0,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  type TestResult =
    | 'loading'
    | { ok: true; latencyMs: number; modelsCount?: number; configuredModelAvailable?: boolean; configuredModel?: string; sampleModels?: string[] }
    | { ok: false; error: string; latencyMs?: number }
  const [testing, setTesting] = useState<Record<string, TestResult>>({})
  const [models, setModels] = useState<Record<string, { loading?: boolean; list?: string[]; error?: string }>>({})
  type EditState = {
    name: string
    apiUrl: string
    apiKey: string
    model: string
    saving?: boolean
    err?: string | null
    availableModels?: string[]
    loadingModels?: boolean
  }
  const [editing, setEditing] = useState<Record<string, EditState | undefined>>({})

  const startEdit = async (c: LlmConfig) => {
    setEditing(e => ({
      ...e,
      [c.id]: {
        name: c.name,
        apiUrl: c.apiUrl ?? '',
        apiKey: '',
        model: c.model,
        loadingModels: true,
      },
    }))
    // Charge automatiquement la liste des modèles dispos pour le dropdown
    try {
      const res = await fetch(`/api/llm-configs/${c.id}/models`)
      const data = await res.json()
      if (res.ok && Array.isArray(data.models)) {
        setEditing(e => ({
          ...e,
          [c.id]: { ...(e[c.id] as EditState), availableModels: data.models, loadingModels: false },
        }))
      } else {
        setEditing(e => ({
          ...e,
          [c.id]: { ...(e[c.id] as EditState), loadingModels: false },
        }))
      }
    } catch {
      setEditing(e => ({
        ...e,
        [c.id]: { ...(e[c.id] as EditState), loadingModels: false },
      }))
    }
  }

  const cancelEdit = (id: string) => {
    setEditing(e => ({ ...e, [id]: undefined }))
  }

  const saveEdit = async (id: string) => {
    const cur = editing[id]
    if (!cur) return
    setEditing(e => ({ ...e, [id]: { ...cur, saving: true, err: null } }))
    try {
      const body: Record<string, unknown> = {
        name: cur.name,
        model: cur.model,
        apiUrl: cur.apiUrl || null,
      }
      if (cur.apiKey) body.apiKey = cur.apiKey
      const res = await fetch(`/api/llm-configs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setEditing(e => ({ ...e, [id]: { ...cur, saving: false, err: data.error ?? `HTTP ${res.status}` } }))
        return
      }
      setConfigs(list =>
        list.map(c =>
          c.id === id
            ? { ...c, name: data.config.name, model: data.config.model, apiUrl: data.config.apiUrl ?? null }
            : c,
        ),
      )
      setEditing(e => ({ ...e, [id]: undefined }))
      // Invalide les badges de test/liste modèles puisque la config a changé
      setTesting(t => ({ ...t, [id]: undefined as unknown as TestResult }))
      setModels(m => ({ ...m, [id]: {} }))
      router.refresh()
    } catch (err) {
      setEditing(e => ({ ...e, [id]: { ...cur, saving: false, err: (err as Error).message } }))
    }
  }

  const handleTest = async (id: string) => {
    setTesting(t => ({ ...t, [id]: 'loading' }))
    try {
      const res = await fetch(`/api/llm-configs/${id}/test`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok && !('ok' in data)) {
        setTesting(t => ({ ...t, [id]: { ok: false, error: data.error ?? `HTTP ${res.status}` } }))
        return
      }
      setTesting(t => ({ ...t, [id]: data }))
    } catch (err) {
      setTesting(t => ({ ...t, [id]: { ok: false, error: (err as Error).message } }))
    }
  }

  const handleListModels = async (id: string) => {
    setModels(m => ({ ...m, [id]: { loading: true } }))
    try {
      const res = await fetch(`/api/llm-configs/${id}/models`)
      const data = await res.json()
      if (!res.ok) {
        setModels(m => ({ ...m, [id]: { error: data.error ?? `HTTP ${res.status}` } }))
        return
      }
      setModels(m => ({ ...m, [id]: { list: data.models ?? [] } }))
    } catch (err) {
      setModels(m => ({ ...m, [id]: { error: (err as Error).message } }))
    }
  }

  const handleProviderChange = (provider: 'ollama' | 'anthropic') => {
    setForm(f => ({
      ...f,
      provider,
      model: provider === 'ollama' ? 'gemma3:12b' : ANTHROPIC_MODELS[0],
      apiUrl: provider === 'ollama' ? 'https://fromager.unchk.sn' : null as unknown as string,
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    if (!form.name) {
      setError('Le nom est requis')
      return
    }
    if (form.provider === 'anthropic' && !form.apiKey) {
      setError('Clé Anthropic requise')
      return
    }
    if (form.provider === 'ollama' && !form.apiUrl) {
      setError('URL Ollama requise')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/llm-configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          provider: form.provider,
          apiUrl: form.provider === 'ollama' ? form.apiUrl : null,
          apiKey: form.apiKey || null,
          model: form.model,
          isDefault: form.isDefault,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      const updated = form.isDefault
        ? [data.config, ...configs.map(c => ({ ...c, isDefault: false }))]
        : [data.config, ...configs]
      setConfigs(updated)
      setSuccess(`Configuration « ${data.config.name} » ajoutée`)
      setForm(f => ({ ...f, name: '', apiKey: '', isDefault: false }))
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Supprimer la configuration « ${name} » ?`)) return
    setError(null)
    try {
      const res = await fetch(`/api/llm-configs/${id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setConfigs(c => c.filter(x => x.id !== id))
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const handleSetDefault = async (id: string) => {
    setError(null)
    try {
      const res = await fetch(`/api/llm-configs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)
      setConfigs(c => c.map(x => ({ ...x, isDefault: x.id === id })))
      router.refresh()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">
          <span className="card-icon">🤖</span> Fournisseurs IA
        </span>
        <span className="badge badge-info">{configs.length} config(s)</span>
      </div>
      <div className="card-body">
        {error && <div className="error-banner">{error}</div>}
        {success && <div className="success-banner">{success}</div>}

        {configs.length > 0 && (
          <div className="platform-list">
            {configs.map(c => {
              const t = testing[c.id]
              const m = models[c.id]
              return (
                <div
                  key={c.id}
                  className="platform-item"
                  style={{ flexDirection: 'column', alignItems: 'stretch' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div className="platform-info">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className="platform-name">{c.name}</span>
                        <span className="badge badge-neutral">{c.provider}</span>
                        <span className="badge badge-neutral">{c.model}</span>
                        {c.isDefault && <span className="badge badge-success">Défaut</span>}
                        {t && t !== 'loading' && (
                          t.ok ? (
                            <span className="badge badge-success">
                              ✓ joignable · {t.modelsCount ?? '?'} modèles · {t.latencyMs}ms
                              {t.configuredModelAvailable === false && (
                                <span style={{ marginLeft: 6, color: 'var(--warn)' }}>
                                  · ⚠ {t.configuredModel} absent
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="badge badge-danger">✗ {String(t.error).slice(0, 80)}</span>
                          )
                        )}
                      </div>
                      {c.apiUrl && <span className="platform-url">{c.apiUrl}</span>}
                    </div>
                    <div className="platform-actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: 12, padding: '4px 10px' }}
                        onClick={() => handleTest(c.id)}
                        disabled={t === 'loading'}
                      >
                        {t === 'loading' ? '…' : 'Tester'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: 12, padding: '4px 10px' }}
                        onClick={() => handleListModels(c.id)}
                        disabled={m?.loading}
                      >
                        {m?.loading ? '…' : 'Modèles'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ fontSize: 12, padding: '4px 10px' }}
                        onClick={() => (editing[c.id] ? cancelEdit(c.id) : startEdit(c))}
                      >
                        {editing[c.id] ? 'Fermer' : 'Éditer'}
                      </button>
                      {!c.isDefault && (
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{ fontSize: 12, padding: '4px 10px' }}
                          onClick={() => handleSetDefault(c.id)}
                        >
                          Défaut
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ fontSize: 12, padding: '4px 10px' }}
                        onClick={() => handleDelete(c.id, c.name)}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                  {editing[c.id] && (() => {
                    const ed = editing[c.id] as EditState
                    const isOllama = c.provider === 'ollama'
                    const fallbackList = isOllama ? [] : ANTHROPIC_MODELS
                    const list = ed.availableModels && ed.availableModels.length > 0 ? ed.availableModels : fallbackList
                    return (
                      <div style={{ marginTop: 10, padding: 12, background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--border)' }}>
                        {ed.err && <div className="error-banner">{ed.err}</div>}
                        <div className="config-layout">
                          <div className="form-group">
                            <label className="form-label">Nom</label>
                            <input
                              type="text"
                              value={ed.name}
                              onChange={e => setEditing(s => ({ ...s, [c.id]: { ...ed, name: e.target.value } }))}
                            />
                          </div>
                          <div className="form-group">
                            <label className="form-label">
                              Modèle {ed.loadingModels && <span style={{ color: 'var(--text3)' }}>(chargement…)</span>}
                            </label>
                            {list.length > 0 ? (
                              <select
                                value={ed.model}
                                onChange={e => setEditing(s => ({ ...s, [c.id]: { ...ed, model: e.target.value } }))}
                              >
                                {list.includes(ed.model) ? null : <option value={ed.model}>{ed.model} (custom)</option>}
                                {list.map(name => (
                                  <option key={name} value={name}>{name}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type="text"
                                value={ed.model}
                                onChange={e => setEditing(s => ({ ...s, [c.id]: { ...ed, model: e.target.value } }))}
                                placeholder={isOllama ? 'gemma3:12b' : 'claude-sonnet-4-6'}
                              />
                            )}
                          </div>
                          {isOllama && (
                            <div className="form-group full">
                              <label className="form-label">URL Ollama</label>
                              <input
                                type="url"
                                value={ed.apiUrl}
                                onChange={e => setEditing(s => ({ ...s, [c.id]: { ...ed, apiUrl: e.target.value } }))}
                              />
                            </div>
                          )}
                          <div className="form-group full">
                            <label className="form-label">
                              Nouvelle clé API <span style={{ color: 'var(--text3)' }}>(laisser vide pour conserver la clé actuelle)</span>
                            </label>
                            <input
                              type="password"
                              value={ed.apiKey}
                              onChange={e => setEditing(s => ({ ...s, [c.id]: { ...ed, apiKey: e.target.value } }))}
                              placeholder="••••••••"
                            />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={ed.saving || !ed.name || !ed.model}
                            onClick={() => saveEdit(c.id)}
                          >
                            {ed.saving ? 'Enregistrement…' : 'Enregistrer'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => cancelEdit(c.id)}
                            disabled={ed.saving}
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    )
                  })()}
                  {m && (m.list || m.error) && (
                    <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--surface)', borderRadius: 6, border: '1px solid var(--border)' }}>
                      {m.error && (
                        <div style={{ fontSize: 12, color: 'var(--danger)' }}>
                          ✗ {m.error}
                        </div>
                      )}
                      {m.list && (
                        <>
                          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            {m.list.length} modèle(s) disponibles
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {m.list.map(name => (
                              <span
                                key={name}
                                className={`badge ${name === c.model ? 'badge-info' : 'badge-neutral'}`}
                                style={{ fontFamily: 'var(--mono)', fontSize: 10 }}
                              >
                                {name}
                                {name === c.model && ' ★'}
                              </span>
                            ))}
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
          style={{ borderTop: configs.length ? '1px solid var(--border)' : 'none', paddingTop: configs.length ? 16 : 0 }}
        >
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 12 }}>
            Ajouter une configuration LLM
          </p>

          <div className="provider-grid">
            <div
              className={`provider-card ${form.provider === 'ollama' ? 'active' : ''}`}
              onClick={() => handleProviderChange('ollama')}
            >
              <div className="provider-card-title">⬡ Ollama</div>
              <div className="provider-card-sub">Souverain — Bearer auth</div>
            </div>
            <div
              className={`provider-card ${form.provider === 'anthropic' ? 'active' : ''}`}
              onClick={() => handleProviderChange('anthropic')}
            >
              <div className="provider-card-title">✦ Anthropic Claude</div>
              <div className="provider-card-sub">Cloud — API key requise</div>
            </div>
          </div>

          <div className="config-layout">
            <div className="form-group">
              <label className="form-label">Nom</label>
              <input
                type="text"
                placeholder="Ollama Fromager"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Modèle</label>
              {form.provider === 'anthropic' ? (
                <select
                  value={form.model}
                  onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                >
                  {ANTHROPIC_MODELS.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  placeholder="gemma3:12b"
                  value={form.model}
                  onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                />
              )}
            </div>

            {form.provider === 'ollama' && (
              <div className="form-group full">
                <label className="form-label">URL Ollama</label>
                <input
                  type="url"
                  placeholder="https://fromager.unchk.sn"
                  value={form.apiUrl}
                  onChange={e => setForm(f => ({ ...f, apiUrl: e.target.value }))}
                />
              </div>
            )}

            <div className="form-group full">
              <label className="form-label">
                Clé API {form.provider === 'ollama' ? '(Bearer token, optionnel)' : '(requise)'}
              </label>
              <input
                type="password"
                placeholder={form.provider === 'anthropic' ? 'sk-ant-…' : 'Bearer token Ollama'}
                value={form.apiKey}
                onChange={e => setForm(f => ({ ...f, apiKey: e.target.value }))}
              />
              <span className="form-hint">Stockée chiffrée (AES-256-GCM) en base.</span>
            </div>

            <div className="form-group full">
              <label
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={form.isDefault}
                  onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))}
                  style={{ width: 16, height: 16, accentColor: 'var(--brand)' }}
                />
                <span style={{ fontSize: 13 }}>Définir comme configuration par défaut</span>
              </label>
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Enregistrement…' : '+ Ajouter la configuration'}
          </button>
        </form>
      </div>
    </div>
  )
}
