'use client'

import { useState } from 'react'
import { ANTHROPIC_MODELS, type LlmConfig, type Provider } from './types'

type Props = {
  isFirst: boolean
  withTopBorder: boolean
  onCreated: (created: LlmConfig, becameDefault: boolean) => void
  onError: (msg: string) => void
  onSuccess: (msg: string) => void
}

/**
 * Formulaire de création d'une nouvelle config LLM, affiché en bas de la liste.
 * Toggle Ollama/Anthropic, champs adaptés selon le provider.
 * À la soumission, appelle POST /api/llm-configs et remonte le résultat.
 */
export function LlmConfigCreateForm({
  isFirst,
  withTopBorder,
  onCreated,
  onError,
  onSuccess,
}: Props) {
  const [form, setForm] = useState({
    name: '',
    provider: 'ollama' as Provider,
    apiUrl: 'https://fromager.unchk.sn',
    apiKey: '',
    model: 'gemma3:12b',
    isDefault: isFirst,
  })
  const [submitting, setSubmitting] = useState(false)

  const handleProviderChange = (provider: Provider) => {
    setForm(f => ({
      ...f,
      provider,
      model: provider === 'ollama' ? 'gemma3:12b' : ANTHROPIC_MODELS[0],
      apiUrl: provider === 'ollama' ? 'https://fromager.unchk.sn' : (null as unknown as string),
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name) {
      onError('Le nom est requis')
      return
    }
    if (form.provider === 'anthropic' && !form.apiKey) {
      onError('Clé Anthropic requise')
      return
    }
    if (form.provider === 'ollama' && !form.apiUrl) {
      onError('URL Ollama requise')
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
      if (!res.ok) {
        onError(data.error ?? `HTTP ${res.status}`)
        return
      }
      onCreated(data.config as LlmConfig, form.isDefault)
      onSuccess(`Configuration « ${data.config.name} » ajoutée`)
      setForm(f => ({ ...f, name: '', apiKey: '', isDefault: false }))
    } catch (err) {
      onError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        borderTop: withTopBorder ? '1px solid var(--border)' : 'none',
        paddingTop: withTopBorder ? 16 : 0,
      }}
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
                <option key={m} value={m}>
                  {m}
                </option>
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
            Clé API{' '}
            {form.provider === 'ollama' ? '(Bearer token, optionnel)' : '(requise)'}
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
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
  )
}
