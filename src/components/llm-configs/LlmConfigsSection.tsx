'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LlmConfigCreateForm } from './LlmConfigCreateForm'
import { LlmConfigRow } from './LlmConfigRow'
import type { LlmConfig } from './types'

type Props = { initial: LlmConfig[] }

/**
 * Orchestrateur de la section « Fournisseurs IA » dans /configuration.
 * Garde l'état partagé minimum (liste + bannières) ; chaque ligne
 * (LlmConfigRow) gère son propre état local (testing, models, editing).
 */
export function LlmConfigsSection({ initial }: Props) {
  const router = useRouter()
  const [configs, setConfigs] = useState<LlmConfig[]>(initial)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleUpdated = (updated: LlmConfig) => {
    setConfigs(list => list.map(c => (c.id === updated.id ? updated : c)))
    router.refresh()
  }

  const handleDeleted = (id: string) => {
    setConfigs(list => list.filter(c => c.id !== id))
    router.refresh()
  }

  const handleSetDefault = (id: string) => {
    setConfigs(list => list.map(c => ({ ...c, isDefault: c.id === id })))
    router.refresh()
  }

  const handleCreated = (created: LlmConfig, becameDefault: boolean) => {
    setConfigs(list =>
      becameDefault
        ? [created, ...list.map(c => ({ ...c, isDefault: false }))]
        : [created, ...list],
    )
    router.refresh()
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
            {configs.map(c => (
              <LlmConfigRow
                key={c.id}
                config={c}
                onUpdated={handleUpdated}
                onDeleted={handleDeleted}
                onSetDefault={handleSetDefault}
                onError={setError}
              />
            ))}
          </div>
        )}

        <LlmConfigCreateForm
          isFirst={configs.length === 0}
          withTopBorder={configs.length > 0}
          onCreated={handleCreated}
          onError={setError}
          onSuccess={setSuccess}
        />
      </div>
    </div>
  )
}
