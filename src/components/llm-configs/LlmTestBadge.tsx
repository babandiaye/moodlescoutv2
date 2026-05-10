'use client'

import type { TestResult } from './types'

type Props = { result: TestResult | undefined }

/**
 * Badge affiché à côté du nom de la config quand l'utilisateur a cliqué « Tester ».
 * - loading : badge orange « … »
 * - ok      : badge vert avec nb modèles + latence + warning si modèle configuré absent
 * - ko      : badge rouge avec début du message d'erreur
 */
export function LlmTestBadge({ result }: Props) {
  if (!result || result === 'loading') return null

  if (result.ok) {
    return (
      <span className="badge badge-success">
        ✓ joignable · {result.modelsCount ?? '?'} modèles · {result.latencyMs}ms
        {result.configuredModelAvailable === false && (
          <span style={{ marginLeft: 6, color: 'var(--warn)' }}>
            · ⚠ {result.configuredModel} absent
          </span>
        )}
      </span>
    )
  }

  return <span className="badge badge-danger">✗ {String(result.error).slice(0, 80)}</span>
}
