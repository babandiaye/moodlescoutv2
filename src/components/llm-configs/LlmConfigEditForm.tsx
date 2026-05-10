'use client'

import { useEffect, useState } from 'react'
import { ANTHROPIC_MODELS, type LlmConfig } from './types'

type Props = {
  config: LlmConfig
  onSaved: (updated: LlmConfig) => void
  onCancel: () => void
}

/**
 * Formulaire d'édition inline d'une config LLM.
 *
 * Au montage, charge la liste des modèles disponibles depuis
 * `/api/llm-configs/[id]/models` pour peupler le dropdown du champ Modèle.
 * Si la liste est indisponible (token sans droit, Ollama down), fallback sur
 * une saisie texte libre + liste statique pour Anthropic.
 *
 * À la sauvegarde, appelle PATCH puis remonte la nouvelle config via onSaved.
 * La clé API n'est envoyée que si l'utilisateur en a saisi une nouvelle (sinon
 * on conserve celle déjà chiffrée en base).
 */
export function LlmConfigEditForm({ config, onSaved, onCancel }: Props) {
  const [name, setName] = useState(config.name)
  const [apiUrl, setApiUrl] = useState(config.apiUrl ?? '')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(config.model)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [availableModels, setAvailableModels] = useState<string[] | null>(null)
  const [loadingModels, setLoadingModels] = useState(true)

  const isOllama = config.provider === 'ollama'

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/llm-configs/${config.id}/models`)
        if (cancelled) return
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data.models)) setAvailableModels(data.models)
        }
      } catch {
        // ignore : fallback sur saisie libre / liste statique
      } finally {
        if (!cancelled) setLoadingModels(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [config.id])

  const fallbackList = isOllama ? [] : (ANTHROPIC_MODELS as readonly string[])
  const list =
    availableModels && availableModels.length > 0 ? availableModels : fallbackList

  const handleSave = async () => {
    setSaving(true)
    setErr(null)
    try {
      const body: Record<string, unknown> = { name, model, apiUrl: apiUrl || null }
      if (apiKey) body.apiKey = apiKey
      const res = await fetch(`/api/llm-configs/${config.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        setErr(data.error ?? `HTTP ${res.status}`)
        return
      }
      onSaved({
        ...config,
        name: data.config.name,
        model: data.config.model,
        apiUrl: data.config.apiUrl ?? null,
      })
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        marginTop: 10,
        padding: 12,
        background: 'var(--surface)',
        borderRadius: 6,
        border: '1px solid var(--border)',
      }}
    >
      {err && <div className="error-banner">{err}</div>}
      <div className="config-layout">
        <div className="form-group">
          <label className="form-label">Nom</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">
            Modèle{' '}
            {loadingModels && <span style={{ color: 'var(--text3)' }}>(chargement…)</span>}
          </label>
          {list.length > 0 ? (
            <select value={model} onChange={e => setModel(e.target.value)}>
              {list.includes(model) ? null : (
                <option value={model}>{model} (custom)</option>
              )}
              {list.map(m => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder={isOllama ? 'gemma3:12b' : 'claude-sonnet-4-6'}
            />
          )}
        </div>
        {isOllama && (
          <div className="form-group full">
            <label className="form-label">URL Ollama</label>
            <input type="url" value={apiUrl} onChange={e => setApiUrl(e.target.value)} />
          </div>
        )}
        <div className="form-group full">
          <label className="form-label">
            Nouvelle clé API{' '}
            <span style={{ color: 'var(--text3)' }}>
              (laisser vide pour conserver la clé actuelle)
            </span>
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="••••••••"
          />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={saving || !name || !model}
          onClick={handleSave}
        >
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onCancel}
          disabled={saving}
        >
          Annuler
        </button>
      </div>
    </div>
  )
}
