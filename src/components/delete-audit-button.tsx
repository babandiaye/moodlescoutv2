'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { TrashIcon } from '@heroicons/react/24/outline'

type Props = {
  id: string
  sessionKey: string
  compact?: boolean
}

/**
 * Bouton icône poubelle rouge, style rond. Confirmation avant suppression.
 * `compact` : bouton 34x34 icône seulement (défaut). Sinon inclut le mot "Supprimer".
 */
export function DeleteAuditButton({ id, sessionKey, compact = true }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    if (!confirm(`Supprimer l'audit ${sessionKey} et tous ses résultats ?`)) return
    setLoading(true)
    try {
      const res = await fetch(`/api/audits/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert(`Erreur : ${data.error ?? res.status}`)
        return
      }
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  if (compact) {
    return (
      <button
        type="button"
        className="action-btn danger"
        onClick={handleClick}
        disabled={loading}
        title="Supprimer l'audit"
        aria-label="Supprimer l'audit"
      >
        <TrashIcon />
      </button>
    )
  }

  return (
    <button
      type="button"
      className="btn btn-danger"
      onClick={handleClick}
      disabled={loading}
    >
      <TrashIcon width={14} height={14} /> {loading ? 'Suppression…' : 'Supprimer'}
    </button>
  )
}
