'use client'

import { XMarkIcon, CheckBadgeIcon } from '@heroicons/react/24/outline'
import type { ModelsState } from './types'

type Props = {
  state: ModelsState | undefined
  configuredModel: string
}

/**
 * Panneau dépliable affiché quand l'utilisateur a cliqué « Modèles ».
 * Affiche soit l'erreur, soit la liste des modèles disponibles avec
 * le modèle actuellement configuré mis en évidence (★ + badge bleu).
 */
export function LlmModelsPanel({ state, configuredModel }: Props) {
  if (!state || (!state.list && !state.error)) return null

  return (
    <div
      style={{
        marginTop: 10,
        padding: '8px 10px',
        background: 'var(--surface)',
        borderRadius: 6,
        border: '1px solid var(--border)',
      }}
    >
      {state.error && (
        <div style={{ fontSize: 12, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <XMarkIcon style={{ width: 14, height: 14 }} /> {state.error}
        </div>
      )}
      {state.list && (
        <>
          <div
            style={{
              fontSize: 11,
              color: 'var(--text3)',
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {state.list.length} modèle(s) disponibles
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {state.list.map(name => (
              <span
                key={name}
                className={`badge ${name === configuredModel ? 'badge-info' : 'badge-neutral'}`}
                style={{ fontFamily: 'var(--mono)', fontSize: 10 }}
              >
                {name}
                {name === configuredModel && (
                  <CheckBadgeIcon style={{ width: 12, height: 12, marginLeft: 4, verticalAlign: '-2px' }} />
                )}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
