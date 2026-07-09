'use client'

import { CheckIcon, XMarkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import type { TestResult } from './types'

const ICON_INLINE = { width: 12, height: 12, verticalAlign: '-2px', display: 'inline-block' as const }

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
        <CheckIcon style={ICON_INLINE} /> joignable · {result.modelsCount ?? '?'} modèles · {result.latencyMs}ms
        {result.configuredModelAvailable === false && (
          <span style={{ marginLeft: 6, color: 'var(--warn)' }}>
            · <ExclamationTriangleIcon style={ICON_INLINE} /> {result.configuredModel} absent
          </span>
        )}
      </span>
    )
  }

  return (
    <span className="badge badge-danger">
      <XMarkIcon style={ICON_INLINE} /> {String(result.error).slice(0, 80)}
    </span>
  )
}
