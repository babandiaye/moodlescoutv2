'use client'

import { useState } from 'react'
import { LlmConfigEditForm } from './LlmConfigEditForm'
import { LlmModelsPanel } from './LlmModelsPanel'
import { LlmTestBadge } from './LlmTestBadge'
import type { LlmConfig, ModelsState, TestResult } from './types'

type Props = {
  config: LlmConfig
  onUpdated: (updated: LlmConfig) => void
  onDeleted: (id: string) => void
  onSetDefault: (id: string) => void
  onError: (msg: string) => void
}

/**
 * Une ligne dans la liste des configs LLM. Gère son propre état local
 * (testing, models, editing) — chaque ligne est indépendante des autres.
 *
 * Délègue le rendu des sous-blocs à LlmTestBadge, LlmModelsPanel,
 * LlmConfigEditForm. Les actions Tester/Modèles/Supprimer/Défaut/Éditer
 * sont déclenchées ici.
 */
export function LlmConfigRow({
  config: c,
  onUpdated,
  onDeleted,
  onSetDefault,
  onError,
}: Props) {
  const [testing, setTesting] = useState<TestResult | undefined>()
  const [modelsState, setModelsState] = useState<ModelsState | undefined>()
  const [editing, setEditing] = useState(false)

  const handleTest = async () => {
    setTesting('loading')
    try {
      const res = await fetch(`/api/llm-configs/${c.id}/test`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok && !('ok' in data)) {
        setTesting({ ok: false, error: data.error ?? `HTTP ${res.status}` })
        return
      }
      setTesting(data)
    } catch (err) {
      setTesting({ ok: false, error: (err as Error).message })
    }
  }

  const handleListModels = async () => {
    setModelsState({ loading: true })
    try {
      const res = await fetch(`/api/llm-configs/${c.id}/models`)
      const data = await res.json()
      if (!res.ok) {
        setModelsState({ error: data.error ?? `HTTP ${res.status}` })
        return
      }
      setModelsState({ list: data.models ?? [] })
    } catch (err) {
      setModelsState({ error: (err as Error).message })
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Supprimer la configuration « ${c.name} » ?`)) return
    try {
      const res = await fetch(`/api/llm-configs/${c.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        onError(data.error ?? `HTTP ${res.status}`)
        return
      }
      onDeleted(c.id)
    } catch (err) {
      onError((err as Error).message)
    }
  }

  const handleSetDefault = async () => {
    try {
      const res = await fetch(`/api/llm-configs/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      })
      const data = await res.json()
      if (!res.ok) {
        onError(data.error ?? `HTTP ${res.status}`)
        return
      }
      onSetDefault(c.id)
    } catch (err) {
      onError((err as Error).message)
    }
  }

  return (
    <div
      className="platform-item"
      style={{ flexDirection: 'column', alignItems: 'stretch' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div className="platform-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="platform-name">{c.name}</span>
            <span className="badge badge-neutral">{c.provider}</span>
            <span className="badge badge-neutral">{c.model}</span>
            {c.isDefault && <span className="badge badge-success">Défaut</span>}
            <LlmTestBadge result={testing} />
          </div>
          {c.apiUrl && <span className="platform-url">{c.apiUrl}</span>}
        </div>
        <div className="platform-actions">
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={handleTest}
            disabled={testing === 'loading'}
          >
            {testing === 'loading' ? '…' : 'Tester'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={handleListModels}
            disabled={modelsState?.loading}
          >
            {modelsState?.loading ? '…' : 'Modèles'}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={() => setEditing(e => !e)}
          >
            {editing ? 'Fermer' : 'Éditer'}
          </button>
          {!c.isDefault && (
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={handleSetDefault}
            >
              Défaut
            </button>
          )}
          <button
            type="button"
            className="btn btn-danger"
            style={{ fontSize: 12, padding: '4px 10px' }}
            onClick={handleDelete}
          >
            Supprimer
          </button>
        </div>
      </div>
      {editing && (
        <LlmConfigEditForm
          config={c}
          onCancel={() => setEditing(false)}
          onSaved={updated => {
            onUpdated(updated)
            setEditing(false)
            // Une édition peut avoir changé le modèle / l'URL : invalide les badges
            setTesting(undefined)
            setModelsState(undefined)
          }}
        />
      )}
      <LlmModelsPanel state={modelsState} configuredModel={c.model} />
    </div>
  )
}
